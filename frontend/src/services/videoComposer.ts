import type { WordTimestamp } from "./elevenLabsService";

const W = 1080;
const H = 1920;
const FPS = 30;
const FONT_SIZE = 78;
const CAPTION_Y = H * 0.78;
const CHUNK = 3;

function activeChunk(words: WordTimestamp[], t: number): WordTimestamp[] | null {
  for (let i = 0; i < words.length; i += CHUNK) {
    const c = words.slice(i, i + CHUNK);
    if (t >= c[0].start - 0.05 && t <= c[c.length - 1].end + 0.5) return c;
  }
  return null;
}

function drawFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, words: WordTimestamp[], t: number) {
  const vw = video.videoWidth || W;
  const vh = video.videoHeight || H;
  const srcAspect = vw / vh;
  const dstAspect = W / H;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (srcAspect > dstAspect) { sw = Math.round(vh * dstAspect); sx = Math.round((vw - sw) / 2); }
  else { sh = Math.round(vw / dstAspect); sy = Math.round((vh - sh) / 2); }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);

  const chunk = activeChunk(words, t);
  if (!chunk) return;

  ctx.font = `900 ${FONT_SIZE}px Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  const spaceW = ctx.measureText(" ").width;
  const widths = chunk.map(w => ctx.measureText(w.word).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * (chunk.length - 1);
  let x = (W - totalW) / 2;

  for (let i = 0; i < chunk.length; i++) {
    const { word, start, end } = chunk[i];
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 14;
    ctx.strokeText(word, x, CAPTION_Y);
    ctx.fillStyle = t >= start && t <= end ? "#FFFF00" : "#FFFFFF";
    ctx.fillText(word, x, CAPTION_Y);
    x += widths[i] + (i < chunk.length - 1 ? spaceW : 0);
  }
}

async function loadVideoEl(blobUrl: string): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.src = blobUrl;
    v.oncanplay = () => res(v);
    v.onerror = () => rej(new Error("Failed to load video clip"));
    v.load();
  });
}

export async function composeVideo(
  videoUrls: string[],
  audioBlob: Blob,
  wordTimestamps: WordTimestamp[],
  audioDuration: number,
  musicUrl: string | null = null,
  musicVolume = 0.15,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Fetch all clips as blob URLs in parallel to avoid canvas CORS taint
  const blobUrls = await Promise.all(
    videoUrls.map(async (url) => {
      const resp = await fetch(url);
      return URL.createObjectURL(await resp.blob());
    })
  );
  const videoEls = await Promise.all(blobUrls.map(loadVideoEl));

  let clipIdx = 0;
  await videoEls[0].play();

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();

  const voiceBuffer = await audioCtx.decodeAudioData(await audioBlob.arrayBuffer());

  if (musicUrl) {
    try {
      const musicResp = await fetch(musicUrl);
      const musicBuffer = await audioCtx.decodeAudioData(await musicResp.arrayBuffer());
      const src = audioCtx.createBufferSource();
      src.buffer = musicBuffer;
      src.loop = true;
      const gain = audioCtx.createGain();
      gain.gain.value = musicVolume;
      src.connect(gain);
      gain.connect(dest);
      src.start();
    } catch { /* music optional */ }
  }

  const mimeType =
    ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
      .find(t => MediaRecorder.isTypeSupported(t)) ?? "video/webm";

  const stream = new MediaStream([
    ...canvas.captureStream(FPS).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.start(100);

  const voice = audioCtx.createBufferSource();
  voice.buffer = voiceBuffer;
  voice.connect(dest);
  voice.start();

  const startTime = audioCtx.currentTime;

  await new Promise<void>((resolve) => {
    const draw = () => {
      const elapsed = audioCtx.currentTime - startTime;
      if (elapsed >= audioDuration) { resolve(); return; }

      onProgress?.(elapsed / audioDuration);

      // Advance to next clip when current one ends
      const cur = videoEls[clipIdx];
      if (cur.ended || (cur.duration > 0 && cur.currentTime >= cur.duration - 0.15)) {
        cur.pause();
        clipIdx = (clipIdx + 1) % videoEls.length;
        videoEls[clipIdx].currentTime = 0;
        videoEls[clipIdx].play();
      }

      drawFrame(ctx, videoEls[clipIdx], wordTimestamps, elapsed);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });

  recorder.stop();
  videoEls.forEach(v => v.pause());
  blobUrls.forEach(u => URL.revokeObjectURL(u));
  await audioCtx.close();

  await new Promise<void>((res) => { recorder.onstop = () => res(); });

  return new Blob(chunks, { type: mimeType });
}

// Podcast mode: the clips carry their own generated audio (Kling 2.6 sound),
// so instead of a voiceover we decode each clip's audio track, schedule the
// buffers back-to-back, and drive clip switching off the audio clock so the
// picture stays locked to the speech. No captions (no word timestamps exist).
export async function stitchClipsWithAudio(
  videoUrls: string[],
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Fetch each clip once; the bytes feed both the video element and the audio decode
  const buffers = await Promise.all(
    videoUrls.map(async (url) => {
      const resp = await fetch(url);
      return resp.arrayBuffer();
    })
  );
  const blobUrls = buffers.map((b) => URL.createObjectURL(new Blob([b], { type: "video/mp4" })));
  const videoEls = await Promise.all(blobUrls.map(loadVideoEl));

  const audioCtx = new AudioContext();
  await audioCtx.resume().catch(() => {});
  const dest = audioCtx.createMediaStreamDestination();
  const audioBuffers = await Promise.all(buffers.map((b) => audioCtx.decodeAudioData(b.slice(0))));

  // Cumulative timeline: clip i's audio starts where clip i-1's ends
  const clipStarts: number[] = [];
  let totalDuration = 0;
  for (const ab of audioBuffers) {
    clipStarts.push(totalDuration);
    totalDuration += ab.duration;
  }

  const mimeType =
    ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
      .find(t => MediaRecorder.isTypeSupported(t)) ?? "video/webm";

  const stream = new MediaStream([
    ...canvas.captureStream(FPS).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.start(100);

  const startTime = audioCtx.currentTime + 0.1;
  audioBuffers.forEach((ab, i) => {
    const src = audioCtx.createBufferSource();
    src.buffer = ab;
    src.connect(dest);
    src.start(startTime + clipStarts[i]);
  });

  let clipIdx = 0;
  await videoEls[0].play();

  await new Promise<void>((resolve) => {
    const draw = () => {
      const elapsed = audioCtx.currentTime - startTime;
      if (elapsed >= totalDuration) { resolve(); return; }

      onProgress?.(Math.max(elapsed, 0) / totalDuration);

      // Switch clips on the audio clock, not on 'ended', so AV stays in sync
      let target = clipIdx;
      while (target < videoEls.length - 1 && elapsed >= clipStarts[target + 1]) target++;
      if (target !== clipIdx) {
        videoEls[clipIdx].pause();
        clipIdx = target;
        videoEls[clipIdx].currentTime = Math.max(elapsed - clipStarts[clipIdx], 0);
        videoEls[clipIdx].play();
      }

      drawFrame(ctx, videoEls[clipIdx], [], Math.max(elapsed, 0));
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });

  recorder.stop();
  videoEls.forEach(v => v.pause());
  blobUrls.forEach(u => URL.revokeObjectURL(u));
  await audioCtx.close();

  await new Promise<void>((res) => { recorder.onstop = () => res(); });

  return new Blob(chunks, { type: mimeType });
}
