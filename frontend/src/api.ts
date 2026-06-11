import { auth } from "./firebase";

// In dev, Vite proxies /api → localhost:5000.
// In prod (Vercel), set VITE_API_URL=https://your-app.onrender.com
const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...(options.headers as Record<string, string>),
  };
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

export async function getMe() {
  const r = await apiFetch("/api/users/me");
  if (!r.ok) throw new Error("Not authenticated");
  return r.json();
}

export async function onboard(productDescription: string, videoStyle: string) {
  const r = await apiFetch("/api/users/onboard", {
    method: "POST",
    body: JSON.stringify({ productDescription, videoStyle }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getTikTokAuthUrl(): Promise<string> {
  const r = await apiFetch("/api/auth/tiktok/start");
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.url;
}

export async function disconnectTikTok() {
  const r = await apiFetch("/api/auth/tiktok", { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function generateVideo(mode: "pika" | "brainrot" = "pika"): Promise<{ videoId: string }> {
  const r = await apiFetch("/api/videos/generate", {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getVideoStatus(videoId: string) {
  const r = await apiFetch(`/api/videos/${videoId}/status`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function postVideo(videoId: string) {
  const r = await apiFetch(`/api/videos/${videoId}/post`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listVideos() {
  const r = await apiFetch("/api/videos");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
