import { useEffect, useState } from "react";

export default function TikTokCallbackPage() {
  const [status, setStatus] = useState("Connecting TikTok…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    const finish = (msg: { tiktok: string; message?: string }) => {
      if (window.opener) {
        window.opener.postMessage(msg, "*");
        window.close();
      } else {
        // Opened in same tab — redirect back to dashboard
        window.location.href = "/";
      }
    };

    if (error) { finish({ tiktok: "error", message: error }); return; }
    if (!code || !state) { finish({ tiktok: "error", message: "missing_params" }); return; }

    const stored = sessionStorage.getItem("tiktok_pkce");
    if (!stored) { finish({ tiktok: "error", message: "no_pkce_stored" }); return; }

    let pkce: { codeVerifier: string; uid: string; state: string };
    try { pkce = JSON.parse(stored); } catch { finish({ tiktok: "error", message: "bad_pkce" }); return; }

    if (pkce.state !== state) { finish({ tiktok: "error", message: "state_mismatch" }); return; }

    fetch("/api/tiktok-exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: pkce.codeVerifier, uid: pkce.uid }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        sessionStorage.removeItem("tiktok_pkce");
        setStatus("Connected! Closing…");
        finish({ tiktok: "connected" });
      })
      .catch(e => {
        setStatus(`Error: ${e.message}`);
        setTimeout(() => finish({ tiktok: "error", message: e.message }), 2000);
      });
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif" }}>
      <p style={{ fontSize: 18, color: "#666" }}>{status}</p>
    </div>
  );
}
