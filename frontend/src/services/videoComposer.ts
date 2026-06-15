import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { WordTimestamp } from "./elevenLabsService";

const ffmpeg = new FFmpeg();
let loaded = false;

async function load() {
  if (loaded) return;
  const base = `${window.location.origin}`;
  await ffmpeg.load({
    coreURL: `${base}/ffmpeg-core.js`,
    wasmURL: `${base}/ffmpeg-core.wasm`,
  });
  loaded = true;
}

function buildAssSubtitles(words: WordTimestamp[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,84,&H0000FFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,6,0,2,80,80,270,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
  };

  const anim = "{\\fscx112\\fscy112\\t(0,180,\\fscx100\\fscy100)\\fad(60,80)}";
  const lines: string[] = [header];
  const chunkSize = 3;

  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize);
    const start = fmt(chunk[0].start);
    const end = fmt(chunk[chunk.length - 1].end);
    const karaoke = chunk.map((w, j) => {
      const durCs = Math.max(5, Math.round(((chunk[j + 1]?.start ?? w.end) - w.start) * 100));
      return `{\\k${durCs}}${w.word}`;
    }).join(" ");
    lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${anim}${karaoke}`);
  }

  return lines.join("\n");
}

export async function composeVideo(
  videoUrl: string,
  audioBlob: Blob,
  wordTimestamps: WordTimestamp[],
  audioDuration: number,
  musicUrl: string | null = null,
  musicVolume = 0.15,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  await load();

  ffmpeg.on("progress", ({ progress }) => onProgress?.(progress));

  await ffmpeg.writeFile("input.mp4", await fetchFile(videoUrl));
  await ffmpeg.writeFile("audio.mp3", await fetchFile(audioBlob));

  const hasMusic = !!musicUrl;
  if (hasMusic) await ffmpeg.writeFile("music.mp3", await fetchFile(musicUrl!));

  const hasSubs = wordTimestamps.length > 0;
  if (hasSubs) await ffmpeg.writeFile("subs.ass", buildAssSubtitles(wordTimestamps));

  const subFilter = hasSubs ? `,subtitles=subs.ass` : "";

  let filterComplex: string;
  let mapArgs: string[];

  if (hasMusic) {
    filterComplex = [
      `[0:v]crop=ih*9/16:ih,scale=1080:1920,fps=30[vid]`,
      `[vid]trim=duration=${audioDuration}${subFilter}[vout]`,
      `[1:a]volume=1.0[voice]`,
      `[2:a]volume=${musicVolume}[music]`,
      `[voice][music]amix=inputs=2:duration=shortest[aout]`,
    ].join(";");
    mapArgs = ["-map", "[vout]", "-map", "[aout]"];
  } else {
    filterComplex = [
      `[0:v]crop=ih*9/16:ih,scale=1080:1920,fps=30[vid]`,
      `[vid]trim=duration=${audioDuration}${subFilter}[vout]`,
    ].join(";");
    mapArgs = ["-map", "[vout]", "-map", "1:a"];
  }

  const inputs = [
    "-stream_loop", "-1", "-an", "-i", "input.mp4",
    "-i", "audio.mp3",
    ...(hasMusic ? ["-stream_loop", "-1", "-i", "music.mp3"] : []),
  ];

  await ffmpeg.exec([
    ...inputs,
    "-filter_complex", filterComplex,
    ...mapArgs,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-t", String(audioDuration),
    "-y", "output.mp4",
  ]);

  const data = await ffmpeg.readFile("output.mp4");
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBuffer);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "video/mp4" });
}
