import base64
import hashlib
import secrets
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode

import requests

_TIKTOK_BASE = "https://open.tiktokapis.com/v2"
_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/"
_TOKEN_URL = f"{_TIKTOK_BASE}/oauth/token/"
_INBOX_INIT_URL = f"{_TIKTOK_BASE}/post/publish/inbox/video/init/"
_PUBLISH_INIT_URL = f"{_TIKTOK_BASE}/post/publish/video/init/"
_STATUS_URL = f"{_TIKTOK_BASE}/post/publish/status/fetch/"


class TikTokAuthError(RuntimeError):
    pass


class TikTokUploadError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# OAuth helpers (web flow — no stdin)
# ---------------------------------------------------------------------------

def build_auth_url(
    client_key: str,
    redirect_uri: str,
    state: str,
    code_verifier: str,
) -> str:
    code_challenge = (
        base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode()).digest()
        )
        .rstrip(b"=")
        .decode()
    )
    params = {
        "client_key": client_key,
        "scope": "video.publish,video.upload",
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{_AUTH_URL}?{urlencode(params)}"


def exchange_code(
    code: str,
    code_verifier: str,
    client_key: str,
    client_secret: str,
    redirect_uri: str,
) -> dict:
    resp = requests.post(
        _TOKEN_URL,
        data={
            "client_key": client_key,
            "client_secret": client_secret,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    data = resp.json()
    if resp.status_code != 200 or "access_token" not in data:
        raise TikTokAuthError(f"Token exchange failed ({resp.status_code}): {data}")

    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "expires_at": int(time.time()) + data.get("expires_in", 86400),
        "refresh_expires_at": int(time.time()) + data.get("refresh_expires_in", 31536000),
    }


# ---------------------------------------------------------------------------
# Token management (in-memory, caller persists to Firestore)
# ---------------------------------------------------------------------------

def is_token_expired(token_dict: dict, buffer_seconds: int = 300) -> bool:
    return time.time() + buffer_seconds >= token_dict.get("expires_at", 0)


def refresh_access_token(
    token_dict: dict,
    client_key: str,
    client_secret: str,
) -> dict:
    resp = requests.post(
        _TOKEN_URL,
        data={
            "client_key": client_key,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": token_dict["refresh_token"],
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    data = resp.json()
    if resp.status_code != 200 or "access_token" not in data:
        raise TikTokAuthError(f"Token refresh failed: {data}")

    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", token_dict["refresh_token"]),
        "expires_at": int(time.time()) + data.get("expires_in", 86400),
        "refresh_expires_at": int(time.time()) + data.get("refresh_expires_in", 31536000),
    }


def ensure_valid_token(
    token_dict: dict,
    client_key: str,
    client_secret: str,
) -> tuple[str, dict | None]:
    """Return (access_token, refreshed_token_dict_or_None)."""
    if is_token_expired(token_dict):
        refreshed = refresh_access_token(token_dict, client_key, client_secret)
        return refreshed["access_token"], refreshed
    return token_dict["access_token"], None


# ---------------------------------------------------------------------------
# Upload helpers
# ---------------------------------------------------------------------------

def _init_upload_to(
    url: str,
    access_token: str,
    video_path: Path,
    caption: str,
    privacy_level: str,
) -> tuple[str, str]:
    video_size = video_path.stat().st_size
    payload = {
        "post_info": {
            "title": caption,
            "privacy_level": privacy_level,
            "disable_duet": False,
            "disable_comment": False,
            "disable_stitch": False,
        },
        "source_info": {
            "source": "FILE_UPLOAD",
            "video_size": video_size,
            "chunk_size": video_size,
            "total_chunk_count": 1,
        },
    }
    resp = requests.post(
        url,
        json=payload,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        },
        timeout=30,
    )
    data = resp.json()
    if resp.status_code != 200 or "data" not in data:
        raise TikTokUploadError(f"Init upload failed ({resp.status_code}): {data}")

    return data["data"]["publish_id"], data["data"]["upload_url"]


def _upload_video_file(upload_url: str, video_path: Path) -> None:
    video_size = video_path.stat().st_size
    with video_path.open("rb") as f:
        resp = requests.put(
            upload_url,
            data=f,
            headers={
                "Content-Type": "video/mp4",
                "Content-Length": str(video_size),
                "Content-Range": f"bytes 0-{video_size - 1}/{video_size}",
                "X-Tt-Request-Id": str(uuid.uuid4()),
            },
            timeout=300,
        )
    if resp.status_code not in (200, 201, 204):
        raise TikTokUploadError(
            f"Video upload failed ({resp.status_code}): {resp.text[:500]}"
        )


def _poll_status(
    publish_id: str,
    access_token: str,
    max_attempts: int = 20,
    poll_interval: float = 5.0,
) -> str:
    for attempt in range(1, max_attempts + 1):
        resp = requests.post(
            _STATUS_URL,
            json={"publish_id": publish_id},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            timeout=30,
        )
        data = resp.json()
        if resp.status_code != 200:
            return "INBOX_UPLOADED"

        status = data.get("data", {}).get("status", "UNKNOWN")
        if status in ("PUBLISH_COMPLETE", "INBOX_UPLOADED", "SEND_TO_USER_INBOX"):
            return status
        if status == "FAILED":
            raise TikTokUploadError(
                f"TikTok publish failed: {data.get('data', {}).get('fail_reason', 'unknown')}"
            )
        time.sleep(poll_interval)

    raise TikTokUploadError(
        f"Publish did not complete after {max_attempts} attempts"
    )


def _direct_publish_with_retry(
    access_token: str,
    video_path: Path,
    caption: str,
    privacy_level: str,
    max_attempts: int = 10,
) -> str:
    last_err = None
    for attempt in range(1, max_attempts + 1):
        try:
            publish_id, upload_url = _init_upload_to(
                _PUBLISH_INIT_URL, access_token, video_path, caption, privacy_level
            )
            _upload_video_file(upload_url, video_path)
            _poll_status(publish_id, access_token)
            return publish_id
        except TikTokUploadError as e:
            last_err = e
            if attempt < max_attempts:
                time.sleep(5)
    raise TikTokUploadError(
        f"video.publish failed after {max_attempts} attempts: {last_err}"
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def post_to_tiktok(
    video_path: Path,
    caption: str,
    token_dict: dict,
    client_key: str,
    client_secret: str,
    privacy_level: str = "PUBLIC_TO_EVERYONE",
) -> tuple[str, dict | None]:
    """Post video and return (publish_id, refreshed_token_dict_or_None)."""
    access_token, refreshed = ensure_valid_token(token_dict, client_key, client_secret)

    # Inbox upload (draft fallback)
    publish_id, upload_url = _init_upload_to(
        _INBOX_INIT_URL, access_token, video_path, caption, privacy_level
    )
    _upload_video_file(upload_url, video_path)
    inbox_status = _poll_status(publish_id, access_token)
    print(f"  [tiktok] Inbox status: {inbox_status}")

    # Direct publish (10 attempts)
    direct_id = _direct_publish_with_retry(
        access_token, video_path, caption, privacy_level
    )
    return direct_id, refreshed
