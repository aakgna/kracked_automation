import crypto from "crypto";

export default function handler(req, res) {
  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(64).toString("hex");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
    response_type: "code",
    scope: "user.info.basic,video.publish,video.upload",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const url = `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  res.json({ url, state, codeVerifier });
}
