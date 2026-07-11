// One-time setup: allow the browser video composer to fetch() media from
// Firebase Storage. Buckets ship with no CORS config, so without this every
// Kling clip download is blocked and generation fails at "Composing video…".
//
// Run from frontend/ with the service account in .env.local:
//   node --env-file=.env.local scripts/setup-storage-cors.mjs
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { cert } = require("firebase-admin/app");

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set — run with: node --env-file=.env.local scripts/setup-storage-cors.mjs");
  process.exit(1);
}
const sa = JSON.parse(raw);
const bucket = process.env.FIREBASE_STORAGE_BUCKET ?? `${sa.project_id}.firebasestorage.app`;

const { access_token } = await cert(sa).getAccessToken();
const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}?fields=cors`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    cors: [{ origin: ["*"], method: ["GET", "HEAD"], responseHeader: ["Content-Type"], maxAgeSeconds: 3600 }],
  }),
});
if (!res.ok) {
  console.error(`Failed (${res.status}):`, await res.text());
  process.exit(1);
}
console.log(`CORS configured on gs://${bucket}:`);
console.log(JSON.stringify((await res.json()).cors, null, 2));
