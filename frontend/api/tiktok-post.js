import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getDb() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({ credential: cert(sa) });
  }
  return getFirestore();
}

async function refreshToken(tokenDict) {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tokenDict.refresh_token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description ?? data.error);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? tokenDict.refresh_token,
    expires_at: Date.now() / 1000 + data.expires_in,
    refresh_expires_at: Date.now() / 1000 + (data.refresh_expires_in ?? 86400 * 30),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { uid, videoUrl, caption, privacyLevel = "PUBLIC_TO_EVERYONE" } = req.body;

  if (!uid || !videoUrl || !caption) {
    return res.status(400).json({ error: "Missing uid, videoUrl, or caption" });
  }

  const db = getDb();
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

  let tokenDict = userDoc.data().tiktokToken;
  if (!tokenDict) return res.status(400).json({ error: "TikTok not connected" });

  // Refresh token if needed
  if (Date.now() / 1000 > tokenDict.expires_at - 60) {
    tokenDict = await refreshToken(tokenDict);
    await db.collection("users").doc(uid).update({ tiktokToken: tokenDict });
  }

  const accessToken = tokenDict.access_token;
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  // Download video from Firebase Storage URL
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error("Failed to fetch video from storage");
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const videoSize = videoBuffer.length;

  // Init upload
  const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
    method: "POST",
    headers,
    body: JSON.stringify({
      source_info: { source: "FILE_UPLOAD", video_size: videoSize, chunk_size: videoSize, total_chunk_count: 1 },
    }),
  });
  const initData = await initRes.json();
  if (initData.error?.code !== "ok") return res.status(500).json({ error: initData.error?.message ?? "Init failed" });

  const { publish_id, upload_url } = initData.data;

  // Upload chunk
  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    headers: {
      "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      "Content-Type": "video/mp4",
    },
    body: videoBuffer,
  });
  if (uploadRes.status !== 200 && uploadRes.status !== 201) {
    return res.status(500).json({ error: `Upload failed: ${uploadRes.status}` });
  }

  res.json({ publishId: publish_id });
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };
