import crypto from "crypto";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

function getBucket() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!getApps().length) {
    initializeApp({ credential: cert(sa) });
  }
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ?? `${sa.project_id}.firebasestorage.app`;
  return getStorage().bucket(bucketName);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { uid, mediaId, url, kind } = req.body ?? {};
  if (!uid || !mediaId || !url || !["video", "image"].includes(kind)) {
    return res.status(400).json({ error: "Missing uid, mediaId, url, or kind" });
  }
  if (!/^[\w-]+$/.test(uid) || !/^[\w-]+$/.test(mediaId)) {
    return res.status(400).json({ error: "Invalid uid or mediaId" });
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid url" });
  }
  if (parsed.protocol !== "https:") return res.status(400).json({ error: "URL must be https" });

  // Download from Kling's CDN before the result URL expires
  const mediaRes = await fetch(url);
  if (!mediaRes.ok) {
    return res.status(502).json({ error: `Failed to fetch media (${mediaRes.status})` });
  }
  const buffer = Buffer.from(await mediaRes.arrayBuffer());

  const ext = kind === "video" ? "mp4" : "png";
  const contentType = kind === "video" ? "video/mp4" : "image/png";
  const storagePath = `media/${uid}/${mediaId}.${ext}`;

  const bucket = getBucket();
  const file = bucket.file(storagePath);
  const downloadToken = crypto.randomUUID();
  await file.save(buffer, {
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
  });

  const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;
  return res.json({ storageUrl, storagePath });
}

export const config = { api: { bodyParser: { sizeLimit: "4mb" }, responseLimit: false } };
