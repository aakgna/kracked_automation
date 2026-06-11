import os
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, session
from flask_cors import CORS
import firebase_admin
from firebase_admin import auth as fb_auth

load_dotenv()

# Initialize Firebase Admin once at startup
import json as _json
from firebase_admin import credentials as _creds
_sa_val = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")
if _sa_val:
    try:
        _sa_dict = _json.loads(_sa_val)
        _cred = _creds.Certificate(_sa_dict)
    except Exception:
        _cred = _creds.Certificate(_sa_val)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(_cred)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))

_allowed_origins = ["http://localhost:5173"]
_frontend_url = os.environ.get("FRONTEND_URL")
if _frontend_url:
    _allowed_origins.append(_frontend_url)
CORS(app, supports_credentials=True, origins=_allowed_origins)

OUTPUT_DIR = Path(__file__).parent / "output"
MUSIC_DIR = Path(__file__).parent / "music"
OUTPUT_DIR.mkdir(exist_ok=True)

_executor = ThreadPoolExecutor(max_workers=4)

# Temporary in-memory store for OAuth PKCE verifiers keyed by state
_oauth_states: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Auth middleware
# ---------------------------------------------------------------------------

def _verify_token() -> str | None:
    """Verify Firebase ID token from Authorization header. Returns uid or None."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    id_token = auth_header[7:]
    try:
        decoded = fb_auth.verify_id_token(id_token)
        return decoded["uid"]
    except Exception:
        return None


def require_auth(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*args, **kwargs):
        uid = _verify_token()
        if not uid:
            return jsonify({"error": "Unauthorized"}), 401
        return fn(uid, *args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# User routes
# ---------------------------------------------------------------------------

@app.route("/api/users/me", methods=["GET"])
@require_auth
def get_me(uid):
    from src.firestore_db import get_user, get_tiktok_token
    user = get_user(uid) or {}
    token = get_tiktok_token(uid)
    return jsonify({
        "uid": uid,
        "productDescription": user.get("productDescription"),
        "videoStyle": user.get("videoStyle"),
        "tiktokConnected": token is not None,
    })


@app.route("/api/users/onboard", methods=["POST"])
@require_auth
def onboard(uid):
    from src.firestore_db import save_user_profile
    body = request.get_json(force=True)
    product_description = (body.get("productDescription") or "").strip()
    video_style = (body.get("videoStyle") or "").strip()
    if not product_description or not video_style:
        return jsonify({"error": "productDescription and videoStyle are required"}), 400
    save_user_profile(uid, product_description, video_style)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# TikTok OAuth routes
# ---------------------------------------------------------------------------

@app.route("/api/auth/tiktok/start", methods=["GET"])
@require_auth
def tiktok_auth_start(uid):
    from src.tiktok_poster import build_auth_url
    state = secrets.token_urlsafe(16)
    code_verifier = secrets.token_urlsafe(64)
    _oauth_states[state] = {"uid": uid, "code_verifier": code_verifier}
    url = build_auth_url(
        client_key=os.environ["TIKTOK_CLIENT_KEY"],
        redirect_uri=os.environ["TIKTOK_REDIRECT_URI"],
        state=state,
        code_verifier=code_verifier,
    )
    return jsonify({"url": url})


@app.route("/api/auth/tiktok/callback", methods=["GET"])
def tiktok_callback():
    from src.tiktok_poster import exchange_code, TikTokAuthError
    from src.firestore_db import save_tiktok_token

    state = request.args.get("state", "")
    code = request.args.get("code", "")
    error = request.args.get("error")

    if error:
        return f"<script>window.opener.postMessage({{tiktok:'error',message:'{error}'}}, '*');window.close();</script>"

    ctx = _oauth_states.pop(state, None)
    if not ctx or not code:
        return "<script>window.opener.postMessage({tiktok:'error',message:'invalid_state'}, '*');window.close();</script>"

    try:
        token_dict = exchange_code(
            code=code,
            code_verifier=ctx["code_verifier"],
            client_key=os.environ["TIKTOK_CLIENT_KEY"],
            client_secret=os.environ["TIKTOK_CLIENT_SECRET"],
            redirect_uri=os.environ["TIKTOK_REDIRECT_URI"],
        )
        save_tiktok_token(ctx["uid"], token_dict)
    except TikTokAuthError as e:
        return f"<script>window.opener.postMessage({{tiktok:'error',message:'{e}'}}, '*');window.close();</script>"

    return "<script>window.opener.postMessage({tiktok:'connected'}, '*');window.close();</script>"


@app.route("/api/auth/tiktok", methods=["DELETE"])
@require_auth
def tiktok_disconnect(uid):
    from src.firestore_db import clear_tiktok_token
    clear_tiktok_token(uid)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Video generation routes
# ---------------------------------------------------------------------------

@app.route("/api/videos/generate", methods=["POST"])
@require_auth
def generate_video(uid):
    from src.firestore_db import get_user, get_tiktok_token, create_video_job

    user = get_user(uid)
    if not user or not user.get("productDescription"):
        return jsonify({"error": "Complete onboarding first"}), 400

    video_id = create_video_job(uid)
    _executor.submit(_run_pipeline, video_id, uid, user)
    return jsonify({"videoId": video_id}), 202


@app.route("/api/videos/<video_id>/status", methods=["GET"])
@require_auth
def video_status(uid, video_id):
    from src.firestore_db import get_video_job
    job = get_video_job(video_id)
    if not job or job.get("userId") != uid:
        return jsonify({"error": "Not found"}), 404
    return jsonify(job)


@app.route("/api/videos/<video_id>/post", methods=["POST"])
@require_auth
def post_video(uid, video_id):
    from src.firestore_db import get_video_job, get_tiktok_token, update_video_job, save_tiktok_token
    from src.tiktok_poster import post_to_tiktok, TikTokAuthError, TikTokUploadError

    job = get_video_job(video_id)
    if not job or job.get("userId") != uid:
        return jsonify({"error": "Not found"}), 404
    if job.get("status") != "ready":
        return jsonify({"error": "Video is not ready"}), 400

    token_dict = get_tiktok_token(uid)
    if not token_dict:
        return jsonify({"error": "TikTok not connected"}), 400

    video_path = Path(job["localVideoPath"])
    if not video_path.exists():
        return jsonify({"error": "Video file missing from server"}), 500

    try:
        publish_id, refreshed = post_to_tiktok(
            video_path=video_path,
            caption=job.get("caption", ""),
            token_dict=token_dict,
            client_key=os.environ["TIKTOK_CLIENT_KEY"],
            client_secret=os.environ["TIKTOK_CLIENT_SECRET"],
            privacy_level=os.environ.get("TIKTOK_PRIVACY_LEVEL", "PUBLIC_TO_EVERYONE"),
        )
        if refreshed:
            save_tiktok_token(uid, refreshed)
        update_video_job(video_id, status="posted", publishId=publish_id)
        return jsonify({"publishId": publish_id})
    except (TikTokAuthError, TikTokUploadError) as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/videos", methods=["GET"])
@require_auth
def list_videos(uid):
    from src.firestore_db import list_user_videos
    return jsonify(list_user_videos(uid))


# ---------------------------------------------------------------------------
# Background pipeline
# ---------------------------------------------------------------------------

def _run_pipeline(video_id: str, uid: str, user: dict) -> None:
    from src.firestore_db import update_video_job, save_tiktok_token
    from src.script_generator import (
        generate_script, generate_caption, generate_pika_prompt, ScriptGenerationError
    )
    from src.audio_generator import generate_audio, get_audio_duration, AudioGenerationError
    from src.pika_generator import generate_pika_video, PikaGenerationError
    from src.video_editor import pick_random_music, generate_subtitles, render_video, VideoEditorError

    product_desc = user["productDescription"]
    video_style = user.get("videoStyle", "engaging and energetic")
    anthropic_key = os.environ["ANTHROPIC_API_KEY"]
    model = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
    ts = int(time.time())

    try:
        # Stage 1: Script
        update_video_job(video_id, status="generating_script")
        script = generate_script(product_desc, video_style, anthropic_key, model)
        caption = generate_caption(script, product_desc, anthropic_key, model)
        pika_prompt = generate_pika_prompt(product_desc, script, anthropic_key, model)
        update_video_job(video_id, script=script, caption=caption, pikaPrompt=pika_prompt)

        # Stage 2: Audio + Pika concurrently
        update_video_job(video_id, status="generating_av")
        tmp_audio = OUTPUT_DIR / f"_tmp_audio_{video_id}_{ts}.mp3"
        tmp_pika = OUTPUT_DIR / f"_tmp_pika_{video_id}_{ts}.mp4"

        audio_future = _executor.submit(
            generate_audio,
            script,
            os.environ["ELEVENLABS_VOICE_ID"],
            os.environ["ELEVENLABS_API_KEY"],
            tmp_audio,
            os.environ.get("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5"),
        )
        pika_future = _executor.submit(
            generate_pika_video,
            pika_prompt,
            os.environ["FAL_KEY"],
            tmp_pika,
        )

        _, word_timestamps = audio_future.result()
        pika_future.result()

        audio_duration = get_audio_duration(tmp_audio)

        # Stage 3: Compose
        update_video_job(video_id, status="composing")
        music_src = pick_random_music(MUSIC_DIR)
        output_path = OUTPUT_DIR / f"video_{video_id}_{ts}.mp4"
        subtitle_path = None
        if word_timestamps:
            subtitle_path = OUTPUT_DIR / f"_tmp_subs_{video_id}_{ts}.ass"
            generate_subtitles(word_timestamps, subtitle_path)

        music_volume = float(os.environ.get("MUSIC_VOLUME", "0.15"))
        render_video(
            video_path=tmp_pika,
            audio_path=tmp_audio,
            music_path=music_src,
            output_path=output_path,
            audio_duration=audio_duration,
            music_volume=music_volume,
            subtitle_path=subtitle_path,
        )

        update_video_job(video_id, status="ready", localVideoPath=str(output_path))

    except (ScriptGenerationError, AudioGenerationError, PikaGenerationError, VideoEditorError, Exception) as e:
        update_video_job(video_id, status="failed", errorMessage=str(e))
    finally:
        for p in [tmp_audio, subtitle_path]:
            if p and Path(p).exists():
                Path(p).unlink(missing_ok=True)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
