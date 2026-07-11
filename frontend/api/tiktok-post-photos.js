import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

  const { uid, photoUrls, caption } = req.body;

  if (!uid || !Array.isArray(photoUrls) || photoUrls.length === 0 || !caption) {
    return res.status(400).json({ error: "Missing uid, photoUrls, or caption" });
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

  // PULL_FROM_URL requires URLs on a TikTok-portal-verified prefix (our /api/media/)
  const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenDict.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      media_type: "PHOTO",
      post_mode: "MEDIA_UPLOAD",
      post_info: { title: caption },
      source_info: {
        source: "PULL_FROM_URL",
        photo_images: photoUrls,
        photo_cover_index: 0,
      },
    }),
  });
  const initData = await initRes.json();
  if (initData.error?.code !== "ok") {
    return res.status(500).json({ error: initData.error?.message ?? "Photo init failed" });
  }

  res.json({ publishId: initData.data.publish_id });
}
