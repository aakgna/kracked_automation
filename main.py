#!/usr/bin/env python3
"""
Kracked TikTok Automation Pipeline

Usage:
  python main.py              # Run the full pipeline (generate → audio → video → post)
  python main.py --authorize  # One-time TikTok OAuth setup
  python main.py --dry-run    # Generate and render video but skip TikTok posting
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent
STATE_PATH = BASE_DIR / "state.json"
TOKEN_PATH = BASE_DIR / "token.json"
VIDEOS_DIR = BASE_DIR / "videos"
MUSIC_DIR = BASE_DIR / "music"
OUTPUT_DIR = BASE_DIR / "output"

REQUIRED_ENV = [
    "ANTHROPIC_API_KEY",
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_VOICE_ID",
    "TIKTOK_CLIENT_KEY",
    "TIKTOK_CLIENT_SECRET",
    "TIKTOK_REDIRECT_URI",
]

REQUIRED_ENV_PIPELINE = [
    "ANTHROPIC_API_KEY",
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_VOICE_ID",
]


def validate_env(keys: list[str]) -> None:
    missing = [k for k in keys if not os.getenv(k)]
    if missing:
        print(f"ERROR: Missing required environment variables: {', '.join(missing)}")
        print(f"Copy .env.example to .env and fill in the values.")
        sys.exit(1)


def load_state() -> dict:
    if not STATE_PATH.exists():
        state = {"topic_index": 0}
        save_state(state)
        return state
    try:
        return json.loads(STATE_PATH.read_text())
    except (json.JSONDecodeError, ValueError):
        state = {"topic_index": 0}
        save_state(state)
        return state


def save_state(state: dict) -> None:
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.rename(STATE_PATH)


def advance_topic(state: dict) -> int:
    state["topic_index"] = (state["topic_index"] + 1) % 6
    return state["topic_index"]


def run_pipeline(dry_run: bool = False) -> None:
    required = REQUIRED_ENV_PIPELINE if dry_run else REQUIRED_ENV
    validate_env(required)

    OUTPUT_DIR.mkdir(exist_ok=True)
    VIDEOS_DIR.mkdir(exist_ok=True)
    MUSIC_DIR.mkdir(exist_ok=True)

    state = load_state()
    topic_index = state["topic_index"]

    from src.script_generator import TOPICS, ScriptGenerationError, generate_script, generate_caption
    from src.audio_generator import AudioGenerationError, generate_audio, get_audio_duration
    from src.video_editor import VideoEditorError, pick_random_music, pick_random_video, render_video, generate_subtitles
    from src.tiktok_poster import TikTokAuthError, TikTokUploadError, post_to_tiktok

    topic_name = TOPICS[topic_index]
    print(f"\nKracked TikTok Pipeline")
    print(f"Topic [{topic_index}/5]: {topic_name}")
    print("=" * 50)

    # Stage 1: Script
    print("\n[1/4] Generating script...")
    try:
        script = generate_script(
            topic_index=topic_index,
            api_key=os.environ["ANTHROPIC_API_KEY"],
            model=os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6"),
        )
    except ScriptGenerationError as e:
        print(f"ERROR in script generation: {e}")
        sys.exit(1)

    word_count = len(script.split())
    print(f"  Script generated ({word_count} words)")
    print(f"  Preview: {script[:80]}...")

    try:
        caption = generate_caption(
            topic_index=topic_index,
            api_key=os.environ["ANTHROPIC_API_KEY"],
            model=os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6"),
        )
    except ScriptGenerationError as e:
        print(f"ERROR in caption generation: {e}")
        sys.exit(1)

    print(f"  Caption:\n    {caption.replace(chr(10), chr(10) + '    ')}")

    # Stage 2: Audio
    print("\n[2/4] Generating audio (ElevenLabs)...")
    ts = int(time.time())
    tmp_audio_path = OUTPUT_DIR / f"_tmp_audio_{ts}.mp3"
    try:
        _, word_timestamps = generate_audio(
            script=script,
            voice_id=os.environ["ELEVENLABS_VOICE_ID"],
            api_key=os.environ["ELEVENLABS_API_KEY"],
            output_path=tmp_audio_path,
            model_id=os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5"),
        )
        audio_duration = get_audio_duration(tmp_audio_path)
    except AudioGenerationError as e:
        print(f"ERROR in audio generation: {e}")
        sys.exit(1)

    print(f"  Audio generated ({audio_duration:.1f}s, {len(word_timestamps)} words timed)")

    # Stage 3: Video
    print("\n[3/4] Rendering video (FFmpeg)...")
    try:
        video_src = pick_random_video(VIDEOS_DIR)
        music_src = pick_random_music(MUSIC_DIR)
        output_path = OUTPUT_DIR / f"kracked_topic{topic_index}_{ts}.mp4"
        music_volume = float(os.getenv("MUSIC_VOLUME", "0.15"))

        subtitle_path = None
        if word_timestamps:
            subtitle_path = OUTPUT_DIR / f"_tmp_subs_{ts}.ass"
            generate_subtitles(word_timestamps, subtitle_path)
            print(f"  Subtitles: {len(word_timestamps)} words -> {subtitle_path.name}")

        print(f"  Video source: {video_src.name}")
        print(f"  Music: {music_src.name if music_src else 'none'}")

        render_video(
            video_path=video_src,
            audio_path=tmp_audio_path,
            music_path=music_src,
            output_path=output_path,
            audio_duration=audio_duration,
            music_volume=music_volume,
            subtitle_path=subtitle_path,
        )
    except VideoEditorError as e:
        print(f"ERROR in video render: {e}")
        tmp_audio_path.unlink(missing_ok=True)
        sys.exit(1)

    print(f"  Video rendered -> {output_path.name}")
    if subtitle_path:
        subtitle_path.unlink(missing_ok=True)

    if dry_run:
        print("\n[4/4] Skipping TikTok post (--dry-run mode)")
        print(f"\nDone. Video saved to: {output_path}")
        tmp_audio_path.unlink(missing_ok=True)
        return

    # Stage 4: TikTok
    print("\n[4/4] Posting to TikTok...")
    try:
        publish_id = post_to_tiktok(
            video_path=output_path,
            caption=caption,
            token_path=TOKEN_PATH,
            client_key=os.environ["TIKTOK_CLIENT_KEY"],
            client_secret=os.environ["TIKTOK_CLIENT_SECRET"],
            privacy_level=os.getenv("TIKTOK_PRIVACY_LEVEL", "PUBLIC_TO_EVERYONE"),
        )
    except (TikTokAuthError, TikTokUploadError) as e:
        print(f"ERROR posting to TikTok: {e}")
        tmp_audio_path.unlink(missing_ok=True)
        sys.exit(1)

    print(f"  Posted! publish_id={publish_id}")

    advance_topic(state)
    save_state(state)
    print(f"\nTopic index advanced to {state['topic_index']}/5")

    tmp_audio_path.unlink(missing_ok=True)
    print(f"\nDone. Video saved to: {output_path}")


def run_authorize() -> None:
    validate_env(["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI"])
    from src.tiktok_poster import authorize_tiktok
    authorize_tiktok(
        client_key=os.environ["TIKTOK_CLIENT_KEY"],
        client_secret=os.environ["TIKTOK_CLIENT_SECRET"],
        redirect_uri=os.environ["TIKTOK_REDIRECT_URI"],
        token_path=TOKEN_PATH,
    )


def run_post_only(video_path: Path) -> None:
    validate_env(["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"])
    from src.tiktok_poster import TikTokAuthError, TikTokUploadError, post_to_tiktok

    if not video_path.exists():
        print(f"ERROR: File not found: {video_path}")
        sys.exit(1)

    caption = "Download Kracked\nSharp minds are built one puzzle at a time.\n#kracked #puzzles #braintraining #logicgames #iq"
    print(f"\nPosting existing video to TikTok: {video_path.name}")
    try:
        publish_id = post_to_tiktok(
            video_path=video_path,
            caption=caption,
            token_path=TOKEN_PATH,
            client_key=os.environ["TIKTOK_CLIENT_KEY"],
            client_secret=os.environ["TIKTOK_CLIENT_SECRET"],
            privacy_level=os.getenv("TIKTOK_PRIVACY_LEVEL", "PUBLIC_TO_EVERYONE"),
        )
    except (TikTokAuthError, TikTokUploadError) as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    print(f"Done! publish_id={publish_id}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Kracked TikTok automation pipeline"
    )
    parser.add_argument(
        "--authorize",
        action="store_true",
        help="Run one-time TikTok OAuth authorization flow",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate and render video but skip TikTok posting",
    )
    parser.add_argument(
        "--post-only",
        metavar="VIDEO_PATH",
        help="Skip generation and post an existing video file directly to TikTok",
    )
    args = parser.parse_args()

    if args.authorize:
        run_authorize()
    elif args.post_only:
        run_post_only(Path(args.post_only))
    else:
        run_pipeline(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
