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

const CONTENT_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", mp4: "video/mp4" };

// Serves Firebase Storage media from our own domain so TikTok PULL_FROM_URL
// can pull from a portal-verified URL prefix: /api/media/{uid}__{mediaId}.{ext}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { file } = req.query;
  const match = /^([\w-]+)__([\w-]+)\.(png|jpe?g|mp4)$/.exec(file ?? "");
  if (!match) return res.status(400).json({ error: "Invalid media path" });
  const [, uid, mediaId, ext] = match;

  const storagePath = `media/${uid}/${mediaId}.${ext}`;
  const storageFile = getBucket().file(storagePath);
  const [exists] = await storageFile.exists();
  if (!exists) return res.status(404).json({ error: "Not found" });

  const [contents] = await storageFile.download();
  res.setHeader("Content-Type", CONTENT_TYPES[ext] ?? "application/octet-stream");
  res.setHeader("Content-Length", contents.length);
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.status(200).send(contents);
}

export const config = { api: { responseLimit: false } };
