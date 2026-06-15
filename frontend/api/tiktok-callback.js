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
  const { code, state, error } = req.query;

  if (error) {
    return res.send(`<script>window.opener.postMessage({tiktok:'error',message:'${error}'},'*');window.close();</script>`);
  }

  // Retrieve codeVerifier from cookie
  const cookieHeader = req.headers.cookie ?? "";
  const match = cookieHeader.match(/tiktok_state=([^;]+)/);
  if (!match) {
    return res.send(`<script>window.opener.postMessage({tiktok:'error',message:'state_missing'},'*');window.close();</script>`);
  }

  const [cookieState, codeVerifier] = match[1].split(":");
  if (cookieState !== state || !code) {
    return res.send(`<script>window.opener.postMessage({tiktok:'error',message:'invalid_state'},'*');window.close();</script>`);
  }

  // Get uid from query param (passed by frontend when opening popup)
  const uid = req.query.uid;

  try {
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
    if (tokenData.error) throw new Error(tokenData.error_description ?? tokenData.error);

    const tokenDict = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() / 1000 + tokenData.expires_in,
      refresh_expires_at: Date.now() / 1000 + (tokenData.refresh_expires_in ?? 86400 * 30),
    };

    if (uid) {
      const db = getDb();
      await db.collection("users").doc(uid).set(
        { tiktokToken: tokenDict, tiktokConnectedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
  } catch (e) {
    return res.send(`<script>window.opener.postMessage({tiktok:'error',message:'${String(e).replace(/'/g, "")}'},'*');window.close();</script>`);
  }

  res.send(`<script>window.opener.postMessage({tiktok:'connected'},'*');window.close();</script>`);
}
