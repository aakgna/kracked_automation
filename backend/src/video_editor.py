import random
import subprocess
from pathlib import Path
from typing import Optional

_MUSIC_EXTS = {".mp3", ".m4a", ".aac"}

# ASS colors are AABBGGRR:
#   &H0000FFFF = yellow (active/spoken word)
#   &H00FFFFFF = white  (unspoken words in chunk)
#   &H00000000 = black  (outline)
_ASS_HEADER = """\
[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,84,&H0000FFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,6,0,2,80,80,270,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

_WORDS_PER_CHUNK = 3

# Pop-in: scale from 112% → 100% over 180ms, fade in 60ms, fade out 80ms
_CHUNK_ANIM = r"{\fscx112\fscy112\t(0,180,\fscx100\fscy100)\fad(60,80)}"


def _fmt_ass_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def generate_subtitles(word_timestamps: list, output_path: Path) -> Path:
    lines = [_ASS_HEADER]
    i = 0
    while i < len(word_timestamps):
        chunk = word_timestamps[i : i + _WORDS_PER_CHUNK]
        chunk_start = chunk[0][1]
        chunk_end = chunk[-1][2]

        # Build karaoke tags: \k duration in centiseconds per word.
        # Each word stays in SecondaryColour (white) until its turn, then
        # switches to PrimaryColour (yellow) — classic TikTok highlight.
        kara_parts = []
        for j, (word, w_start, w_end) in enumerate(chunk):
            if j < len(chunk) - 1:
                dur_cs = max(5, int((chunk[j + 1][1] - w_start) * 100))
            else:
                dur_cs = max(5, int((w_end - w_start) * 100))
            kara_parts.append(f"{{\\k{dur_cs}}}{word}")

        text = _CHUNK_ANIM + " ".join(kara_parts)
        lines.append(
            f"Dialogue: 0,{_fmt_ass_time(chunk_start)},{_fmt_ass_time(chunk_end)},"
            f"Default,,0,0,0,,{text}"
        )
        i += _WORDS_PER_CHUNK

    output_path.write_text("\n".join(lines), encoding="utf-8")
    return output_path


class VideoEditorError(RuntimeError):
    pass


def pick_random_music(music_dir: Path) -> Optional[Path]:
    if not music_dir.exists():
        return None
    candidates = [p for p in music_dir.iterdir() if p.suffix.lower() in _MUSIC_EXTS]
    return random.choice(candidates) if candidates else None


def build_ffmpeg_command(
    video_path: Path,
    audio_path: Path,
    music_path: Optional[Path],
    output_path: Path,
    audio_duration: float,
    music_volume: float = 0.15,
    subtitle_path: Optional[Path] = None,
) -> list[str]:
    if subtitle_path:
        escaped_sub = str(subtitle_path).replace(":", "\\:")
        sub_filter = f",subtitles={escaped_sub}"
    else:
        sub_filter = ""

    # -an on input 0 strips the brainrot video's original audio entirely before processing
    if music_path:
        return [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-an", "-i", str(video_path),
            "-i", str(audio_path),
            "-i", str(music_path),
            "-filter_complex",
            (
                f"[0:v]crop=ih*9/16:ih,scale=1080:1920,fps=30[vid];"
                f"[vid]trim=duration={audio_duration}{sub_filter}[vtrimmed];"
                "[1:a]volume=1.0[voice];"
                f"[2:a]volume={music_volume}[music];"
                "[voice][music]amix=inputs=2:duration=shortest[audio]"
            ),
            "-map", "[vtrimmed]",
            "-map", "[audio]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-t", str(audio_duration),
            str(output_path),
        ]
    else:
        return [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-an", "-i", str(video_path),
            "-i", str(audio_path),
            "-filter_complex",
            (
                f"[0:v]crop=ih*9/16:ih,scale=1080:1920,fps=30[vid];"
                f"[vid]trim=duration={audio_duration}{sub_filter}[vtrimmed]"
            ),
            "-map", "[vtrimmed]",
            "-map", "1:a",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-t", str(audio_duration),
            str(output_path),
        ]


def render_video(
    video_path: Path,
    audio_path: Path,
    music_path: Optional[Path],
    output_path: Path,
    audio_duration: float,
    music_volume: float = 0.15,
    subtitle_path: Optional[Path] = None,
) -> Path:
    cmd = build_ffmpeg_command(
        video_path, audio_path, music_path, output_path, audio_duration, music_volume, subtitle_path
    )
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except FileNotFoundError:
        raise VideoEditorError("ffmpeg not found. Install FFmpeg: brew install ffmpeg")
    except subprocess.CalledProcessError as e:
        last_lines = "\n".join(e.stderr.splitlines()[-20:])
        raise VideoEditorError(f"FFmpeg failed:\n{last_lines}") from e

    return output_path
