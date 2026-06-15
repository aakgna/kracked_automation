import { useState } from "react";
import { getTikTokAuthUrl, disconnectTikTok } from "../api";
import { auth } from "../firebase";

interface Props {
  connected: boolean;
  onStatusChange: () => void;
}

export default function TikTokConnect({ connected, onStatusChange }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid ?? "";
      const { url } = await getTikTokAuthUrl(uid);
      const popup = window.open(url, "tiktok-auth", "width=600,height=700");
      window.addEventListener("message", function handler(e) {
        if (e.data?.tiktok === "connected" || e.data?.tiktok === "error") {
          window.removeEventListener("message", handler);
          popup?.close();
          setLoading(false);
          onStatusChange();
        }
      });
    } catch {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid ?? "";
      await disconnectTikTok(uid);
      onStatusChange();
    } finally {
      setLoading(false);
    }
  }

  if (connected) {
    return (
      <div className="tiktok-status connected">
        <span>✓ TikTok connected</span>
        <button onClick={handleDisconnect} disabled={loading} className="btn-ghost">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="tiktok-status">
      <span>TikTok not connected</span>
      <button onClick={handleConnect} disabled={loading} className="btn-tiktok">
        {loading ? "Connecting…" : "Connect TikTok"}
      </button>
    </div>
  );
}
