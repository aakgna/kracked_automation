import type { KlingStoryboard } from "./claudeService";

export type KlingTaskType = "text2video" | "image2video" | "images";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1_000;

export interface MaterializedMedia {
  urls: string[]; // Firebase Storage download URLs (CORS-friendly)
  paths: string[]; // Storage object paths (media/{uid}/{mediaId}.{ext})
}

async function createTask(type: KlingTaskType, body: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/kling", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", type, body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Kling create failed (${res.status})`);
  return data.taskId;
}

async function pollTask(
  type: KlingTaskType,
  taskId: string,
  onTick?: (status: string) => void
): Promise<string[]> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch("/api/kling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", type, taskId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Kling status failed (${res.status})`);
    onTick?.(data.status);
    if (data.status === "succeed") return data.urls;
    if (data.status === "failed") {
      throw new Error(`Kling generation failed: ${data.statusMsg ?? "unknown reason"}`);
    }
  }
  throw new Error("Kling generation timed out after 10 minutes");
}

async function materialize(
  uid: string,
  mediaId: string,
  url: string,
  kind: "video" | "image"
): Promise<{ storageUrl: string; storagePath: string }> {
  const res = await fetch("/api/kling-fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, mediaId, url, kind }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Failed to save media (${res.status})`);
  return data;
}

async function runVideoTask(
  type: "text2video" | "image2video",
  body: Record<string, unknown>,
  uid: string,
  mediaId: string,
  onTick?: (status: string) => void
): Promise<{ storageUrl: string; storagePath: string }> {
  const taskId = await createTask(type, body);
  const [url] = await pollTask(type, taskId, onTick);
  if (!url) throw new Error("Kling returned no video URL");
  return materialize(uid, mediaId, url, "video");
}

export async function generateVideoClips(
  uid: string,
  videoId: string,
  storyboard: KlingStoryboard,
  onProgress?: (done: number, total: number) => void
): Promise<MaterializedMedia> {
  const total = storyboard.scenes.length;
  let done = 0;
  const results = await Promise.all(
    storyboard.scenes.map(async (scene, i) => {
      const result = await runVideoTask(
        "text2video",
        {
          prompt: scene.prompt,
          negative_prompt: scene.negativePrompt,
          duration: "10",
          aspect_ratio: "9:16",
        },
        uid,
        `${videoId}_clip${i}`
      );
      onProgress?.(++done, total);
      return result;
    })
  );
  return { urls: results.map((r) => r.storageUrl), paths: results.map((r) => r.storagePath) };
}

// Podcast mode: kling-v2-6 renders picture AND the host's voice (sound: "on"),
// so these clips carry their own audio track — no ElevenLabs voiceover.
export async function generatePodcastClips(
  uid: string,
  videoId: string,
  prompts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<MaterializedMedia> {
  const total = prompts.length;
  let done = 0;
  const results = await Promise.all(
    prompts.map(async (prompt, i) => {
      const result = await runVideoTask(
        "text2video",
        {
          model_name: "kling-v2-6",
          sound: "on",
          prompt,
          duration: "10",
          aspect_ratio: "9:16",
        },
        uid,
        `${videoId}_clip${i}`
      );
      onProgress?.(++done, total);
      return result;
    })
  );
  return { urls: results.map((r) => r.storageUrl), paths: results.map((r) => r.storagePath) };
}

export async function generateImages(
  uid: string,
  videoId: string,
  prompts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<MaterializedMedia> {
  const total = prompts.length;
  let done = 0;
  const results = await Promise.all(
    prompts.map(async (prompt, i) => {
      const taskId = await createTask("images", { prompt, n: 1, aspect_ratio: "9:16" });
      const [url] = await pollTask("images", taskId);
      if (!url) throw new Error("Kling returned no image URL");
      const result = await materialize(uid, `${videoId}_img${i}`, url, "image");
      onProgress?.(++done, total);
      return result;
    })
  );
  return { urls: results.map((r) => r.storageUrl), paths: results.map((r) => r.storagePath) };
}

export async function generateHeroImage(
  uid: string,
  videoId: string,
  imagePrompt: string
): Promise<{ storageUrl: string; storagePath: string }> {
  const taskId = await createTask("images", { prompt: imagePrompt, n: 1, aspect_ratio: "9:16" });
  const [url] = await pollTask("images", taskId);
  if (!url) throw new Error("Kling returned no hero image URL");
  return materialize(uid, `${videoId}_hero`, url, "image");
}

export async function generateImageToVideoClips(
  uid: string,
  videoId: string,
  heroImageUrl: string,
  motionPrompts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<MaterializedMedia> {
  const total = motionPrompts.length;
  let done = 0;
  const results = await Promise.all(
    motionPrompts.map(async (prompt, i) => {
      const result = await runVideoTask(
        "image2video",
        { prompt, image: heroImageUrl, duration: "10", aspect_ratio: "9:16" },
        uid,
        `${videoId}_clip${i}`
      );
      onProgress?.(++done, total);
      return result;
    })
  );
  return { urls: results.map((r) => r.storageUrl), paths: results.map((r) => r.storagePath) };
}
