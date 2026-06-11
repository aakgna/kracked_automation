import time
from pathlib import Path

import requests

_FAL_BASE = "https://queue.fal.run"
_PIKA_MODEL = "fal-ai/pika/v2.2/text-to-video"


class PikaGenerationError(RuntimeError):
    pass


def generate_pika_video(
    prompt: str,
    fal_key: str,
    output_path: Path,
    aspect_ratio: str = "9:16",
    duration: int = 7,
    poll_interval: float = 4.0,
    max_wait: float = 300.0,
) -> Path:
    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }

    submit_url = f"{_FAL_BASE}/{_PIKA_MODEL}"
    resp = requests.post(
        submit_url,
        json={"prompt": prompt, "aspect_ratio": aspect_ratio, "duration": duration},
        headers=headers,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise PikaGenerationError(
            f"Pika submit failed ({resp.status_code}): {resp.text[:400]}"
        )

    data = resp.json()
    request_id = data.get("request_id")
    if not request_id:
        raise PikaGenerationError(f"No request_id in Pika response: {data}")

    status_url = f"{_FAL_BASE}/{_PIKA_MODEL}/requests/{request_id}/status"
    result_url = f"{_FAL_BASE}/{_PIKA_MODEL}/requests/{request_id}"

    elapsed = 0.0
    while elapsed < max_wait:
        time.sleep(poll_interval)
        elapsed += poll_interval

        status_resp = requests.get(status_url, headers=headers, timeout=30)
        if status_resp.status_code != 200:
            continue

        status_data = status_resp.json()
        status = status_data.get("status", "")

        if status == "COMPLETED":
            break
        if status in ("FAILED", "CANCELLED"):
            raise PikaGenerationError(f"Pika generation {status}: {status_data}")
    else:
        raise PikaGenerationError(
            f"Pika generation timed out after {max_wait}s (request_id={request_id})"
        )

    result_resp = requests.get(result_url, headers=headers, timeout=30)
    if result_resp.status_code != 200:
        raise PikaGenerationError(
            f"Pika result fetch failed ({result_resp.status_code}): {result_resp.text[:400]}"
        )

    result_data = result_resp.json()
    video_url = (
        result_data.get("output", {}).get("video", {}).get("url")
        or result_data.get("video", {}).get("url")
    )
    if not video_url:
        raise PikaGenerationError(f"No video URL in Pika result: {result_data}")

    video_resp = requests.get(video_url, timeout=120, stream=True)
    if video_resp.status_code != 200:
        raise PikaGenerationError(
            f"Video download failed ({video_resp.status_code})"
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as f:
        for chunk in video_resp.iter_content(chunk_size=8192):
            f.write(chunk)

    return output_path
