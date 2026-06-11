import { useEffect, useRef, useState } from "react";
import { generateVideo, getVideoStatus, listVideos } from "../api";
import TikTokConnect from "./TikTokConnect";
import VideoCard from "./VideoCard";

interface Props {
  user: {
    uid: string;
    productDescription: string;
    videoStyle: string;
    tiktokConnected: boolean;
  };
  onRefreshUser: () => void;
}

export default function Dashboard({ user, onRefreshUser }: Props) {
  const [videos, setVideos] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"pika" | "brainrot">("brainrot");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadVideos() {
    try {
      const data = await listVideos();
      setVideos(data);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadVideos();
  }, []);

  // Poll in-progress videos every 5s
  useEffect(() => {
    const inProgress = videos.some((v) =>
      ["queued", "generating_script", "generating_av", "composing"].includes(v.status)
    );

    if (inProgress && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        const updated = await Promise.all(
          videos.map((v) =>
            ["queued", "generating_script", "generating_av", "composing"].includes(v.status)
              ? getVideoStatus(v.id).catch(() => v)
              : Promise.resolve(v)
          )
        );
        setVideos(updated);
      }, 3000);
    } else if (!inProgress && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [videos]);

  async function handleGenerate() {
    setError("");
    setGenerating(true);
    try {
      const { videoId } = await generateVideo(mode);
      const newJob = await getVideoStatus(videoId);
      setVideos((prev) => [newJob, ...prev]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Video Creator</h1>
          <p className="subtitle">{user.productDescription?.slice(0, 80)}…</p>
        </div>
        <TikTokConnect
          connected={user.tiktokConnected}
          onStatusChange={onRefreshUser}
        />
      </div>

      <div className="generate-section">
        <div className="mode-toggle">
          <button
            className={mode === "brainrot" ? "mode-btn mode-btn-active" : "mode-btn"}
            onClick={() => setMode("brainrot")}
          >
            🎮 Brainrot
          </button>
          <button
            className={mode === "pika" ? "mode-btn mode-btn-active" : "mode-btn"}
            onClick={() => setMode("pika")}
          >
            ✨ AI Video
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 12 }}>
          {mode === "brainrot"
            ? "Subway Surfers · Minecraft · Jetpack Joyride background"
            : "Pika Art generates a custom AI scene"}
        </p>
        {error && <p className="error">{error}</p>}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="btn-primary btn-large"
        >
          {generating ? "Starting…" : "Generate Video"}
        </button>
        <p className="hint">
          Claude writes the script · ElevenLabs voices it
          {mode === "pika" ? " · Pika generates the scene" : ""}
        </p>
      </div>

      {videos.length > 0 && (
        <div className="video-list">
          <h2>Your videos</h2>
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              tiktokConnected={user.tiktokConnected}
              onPosted={loadVideos}
            />
          ))}
        </div>
      )}
    </div>
  );
}
