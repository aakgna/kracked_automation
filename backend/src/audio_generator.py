import base64
import subprocess
from pathlib import Path

from elevenlabs.client import ElevenLabs


class AudioGenerationError(RuntimeError):
    pass


WordTimestamp = tuple[str, float, float]  # (word, start_sec, end_sec)


def generate_audio(
    script: str,
    voice_id: str,
    api_key: str,
    output_path: Path,
    model_id: str = "eleven_turbo_v2_5",
) -> tuple[Path, list[WordTimestamp]]:
    try:
        client = ElevenLabs(api_key=api_key)
        response = client.text_to_speech.convert_with_timestamps(
            text=script,
            voice_id=voice_id,
            model_id=model_id,
            output_format="mp3_44100_128",
        )
    except Exception as e:
        raise AudioGenerationError(f"ElevenLabs TTS failed: {e}") from e

    raw_b64 = getattr(response, "audio_base_64", None) or getattr(response, "audio_base64", None)
    if raw_b64:
        audio_bytes = base64.b64decode(raw_b64)
    elif hasattr(response, "audio"):
        raw = response.audio
        audio_bytes = base64.b64decode(raw) if isinstance(raw, str) else raw
    else:
        attrs = [a for a in dir(response) if not a.startswith("_")]
        raise AudioGenerationError(
            f"Cannot extract audio from ElevenLabs response. Available attributes: {attrs}"
        )

    output_path.write_bytes(audio_bytes)

    alignment = getattr(response, "alignment", None) or getattr(response, "normalized_alignment", None)
    word_timestamps = _extract_word_timestamps(alignment)
    return output_path, word_timestamps


def _extract_word_timestamps(alignment) -> list[WordTimestamp]:
    if alignment is None:
        return []

    chars = alignment.characters or []
    starts = alignment.character_start_times_seconds or []
    ends = alignment.character_end_times_seconds or []

    words: list[WordTimestamp] = []
    current_word = ""
    word_start = 0.0
    word_end = 0.0

    for char, start, end in zip(chars, starts, ends):
        if char in (" ", "\n", "\t"):
            if current_word.strip():
                words.append((current_word.strip(), word_start, word_end))
            current_word = ""
        else:
            if not current_word:
                word_start = start
            current_word += char
            word_end = end

    if current_word.strip():
        words.append((current_word.strip(), word_start, word_end))

    return words


def get_audio_duration(audio_path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(audio_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except FileNotFoundError:
        raise AudioGenerationError(
            "ffprobe not found. Install FFmpeg: brew install ffmpeg"
        )
    except subprocess.CalledProcessError as e:
        raise AudioGenerationError(f"ffprobe failed: {e.stderr}") from e

    try:
        return float(result.stdout.strip())
    except ValueError as e:
        raise AudioGenerationError(
            f"Could not parse duration from ffprobe output: {result.stdout!r}"
        ) from e
