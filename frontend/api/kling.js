import crypto from "crypto";

const KLING_BASE = "https://api-singapore.klingai.com";

const ENDPOINTS = {
  text2video: "/v1/videos/text2video",
  image2video: "/v1/videos/image2video",
  images: "/v1/images/generations",
};

// Server-side whitelists so this proxy can't be abused for arbitrary spend
const ALLOWED_VIDEO_MODELS = ["kling-v2-5-turbo", "kling-v2-1", "kling-v1-6"];
const ALLOWED_IMAGE_MODELS = ["kling-v2", "kling-v2-new", "kling-v1-5"];
const ALLOWED_MODES = ["std", "pro"];
const ALLOWED_DURATIONS = ["5", "10"];
const ALLOWED_ASPECT_RATIOS = ["9:16", "16:9", "1:1"];
const MAX_IMAGES_N = 5;

function buildJwt(accessKey, secretKey) {
  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ iss: accessKey, exp: now + 1800, nbf: now - 5 });
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function sanitizeCreateBody(type, body) {
  if (type === "images") {
    const model = body.model_name ?? "kling-v2";
    if (!ALLOWED_IMAGE_MODELS.includes(model)) throw new Error(`Model not allowed: ${model}`);
    const n = Math.min(Math.max(parseInt(body.n ?? 1, 10) || 1, 1), MAX_IMAGES_N);
    const out = {
      model_name: model,
      prompt: String(body.prompt ?? "").slice(0, 2500),
      n,
      aspect_ratio: ALLOWED_ASPECT_RATIOS.includes(body.aspect_ratio) ? body.aspect_ratio : "9:16",
    };
    if (body.negative_prompt) out.negative_prompt = String(body.negative_prompt).slice(0, 2500);
    if (["1k", "2k"].includes(body.resolution)) out.resolution = body.resolution;
    return out;
  }

  const model = body.model_name ?? "kling-v2-5-turbo";
  if (!ALLOWED_VIDEO_MODELS.includes(model)) throw new Error(`Model not allowed: ${model}`);
  const out = {
    model_name: model,
    mode: ALLOWED_MODES.includes(body.mode) ? body.mode : "pro",
    prompt: String(body.prompt ?? "").slice(0, 2500),
    duration: ALLOWED_DURATIONS.includes(String(body.duration)) ? String(body.duration) : "10",
    aspect_ratio: ALLOWED_ASPECT_RATIOS.includes(body.aspect_ratio) ? body.aspect_ratio : "9:16",
  };
  if (body.negative_prompt) out.negative_prompt = String(body.negative_prompt).slice(0, 2500);
  if (type === "image2video") {
    if (!body.image) throw new Error("image2video requires an image");
    out.image = String(body.image);
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) {
    return res.status(500).json({ error: "Kling API keys not configured" });
  }

  const { action, type, taskId, body } = req.body ?? {};
  const path = ENDPOINTS[type];
  if (!path) return res.status(400).json({ error: `Unknown type: ${type}` });

  const headers = {
    Authorization: `Bearer ${buildJwt(accessKey, secretKey)}`,
    "Content-Type": "application/json",
  };

  try {
    if (action === "create") {
      const klingRes = await fetch(`${KLING_BASE}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(sanitizeCreateBody(type, body ?? {})),
      });
      const data = await klingRes.json();
      if (!klingRes.ok || data.code !== 0) {
        return res.status(502).json({ error: data.message ?? `Kling HTTP ${klingRes.status}` });
      }
      return res.json({ taskId: data.data.task_id });
    }

    if (action === "status") {
      if (!taskId) return res.status(400).json({ error: "Missing taskId" });
      const klingRes = await fetch(`${KLING_BASE}${path}/${encodeURIComponent(taskId)}`, { headers });
      const data = await klingRes.json();
      if (!klingRes.ok || data.code !== 0) {
        return res.status(502).json({ error: data.message ?? `Kling HTTP ${klingRes.status}` });
      }
      const task = data.data;
      const urls =
        task.task_result?.videos?.map((v) => v.url) ??
        task.task_result?.images?.map((i) => i.url) ??
        [];
      return res.json({
        status: task.task_status,
        statusMsg: task.task_status_msg ?? null,
        urls,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    return res.status(400).json({ error: e.message ?? String(e) });
  }
}
