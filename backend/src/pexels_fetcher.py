import random
import time
from pathlib import Path

import requests

_PEXELS_API = "https://api.pexels.com/videos/search"

_QUERIES = [
    "subway surfers gameplay",
    "minecraft parkour",
    "jetpack joyride gameplay",
    "temple run gameplay",
    "infinite runner game",
    "satisfying parkour",
    "free running parkour",
    "skateboard tricks",
]


class PexelsFetchError(RuntimeError):
    pass


def fetch_brainrot_video(pexels_key: str, output_path: Path) -> Path:
    query = random.choice(_QUERIES)
    headers = {"Authorization": pexels_key}

    resp = requests.get(
        _PEXELS_API,
        headers=headers,
        params={"query": query, "per_page": 15, "orientation": "portrait"},
        timeout=15,
    )
    if resp.status_code != 200:
        raise PexelsFetchError(f"Pexels search failed ({resp.status_code}): {resp.text[:200]}")

    videos = resp.json().get("videos", [])
    if not videos:
        # fallback query
        resp = requests.get(
            _PEXELS_API,
            headers=headers,
            params={"query": "parkour", "per_page": 15},
            timeout=15,
        )
        videos = resp.json().get("videos", [])

    if not videos:
        raise PexelsFetchError("No videos found on Pexels")

    video = random.choice(videos)

    # Pick best file at HD or below (avoid huge 4K files that slow FFmpeg)
    files = video.get("video_files", [])
    hd_files = [f for f in files if f.get("height", 0) <= 1080 and f.get("height", 0) >= 480]
    chosen_files = sorted(hd_files or files, key=lambda f: f.get("width", 0) * f.get("height", 0), reverse=True)
    if not chosen_files:
        raise PexelsFetchError("No video files in Pexels result")

    video_url = chosen_files[0]["link"]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    dl = requests.get(video_url, timeout=120, stream=True)
    if dl.status_code != 200:
        raise PexelsFetchError(f"Video download failed ({dl.status_code})")

    with output_path.open("wb") as f:
        for chunk in dl.iter_content(chunk_size=65536):
            f.write(chunk)

    return output_path
