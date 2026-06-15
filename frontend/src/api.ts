import { auth } from "./firebase";

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

export async function getTikTokAuthUrl(uid: string): Promise<{ url: string; state: string; codeVerifier: string }> {
  const r = await fetch(`/api/tiktok-start?uid=${uid}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function disconnectTikTok(uid: string) {
  const { getFirestore, doc, updateDoc, deleteField } = await import("firebase/firestore");
  const db = getFirestore();
  await updateDoc(doc(db, "users", uid), { tiktokToken: deleteField() });
}

export async function postVideoToTikTok(uid: string, videoUrl: string, caption: string): Promise<{ publishId: string }> {
  const r = await fetch("/api/tiktok-post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, videoUrl, caption }),
  });
  if (!r.ok) throw new Error(await r.json().then((d) => d.error).catch(() => r.statusText));
  return r.json();
}
