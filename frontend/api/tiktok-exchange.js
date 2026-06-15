import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getDb() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({ credential: cert(sa) });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { code, codeVerifier, uid } = req.body;
  if (!code || !codeVerifier || !uid) {
    return res.status(400).json({ error: "Missing code, codeVerifier, or uid" });
  }

  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.TIKTOK_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    return res.status(400).json({ error: tokenData.error_description ?? tokenData.error });
  }

  const tokenDict = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() / 1000 + tokenData.expires_in,
    refresh_expires_at: Date.now() / 1000 + (tokenData.refresh_expires_in ?? 86400 * 30),
  };

  const db = getDb();
  await db.collection("users").doc(uid).set(
    { tiktokToken: tokenDict, tiktokConnectedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  res.json({ ok: true });
}
