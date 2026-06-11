import { useState } from "react";
import { postVideo } from "../api";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  generating_script: "Writing script…",
  generating_av: "Generating video & audio…",
  composing: "Composing final video…",
  ready: "Ready to post",
  posted: "Posted ✓",
  failed: "Failed",
};

interface Props {
  video: {
    id: string;
    status: string;
    caption?: string;
    script?: string;
    pikaPrompt?: string;
    publishId?: string;
    errorMessage?: string;
    createdAt?: number;
  };
  tiktokConnected: boolean;
  onPosted: () => void;
}

export default function VideoCard({ video, tiktokConnected, onPosted }: Props) {
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  async function handlePost() {
    setPosting(true);
    setError("");
    try {
      await postVideo(video.id);
      onPosted();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  const isInProgress = ["queued", "generating_script", "generating_av", "composing"].includes(video.status);
  const statusLabel = STATUS_LABELS[video.status] ?? video.status;
  const date = video.createdAt
    ? new Date(video.createdAt * 1000).toLocaleString()
    : "";

  return (
    <div className={`video-card status-${video.status}`}>
      <div className="video-card-header">
        <span className={`badge badge-${video.status}`}>{statusLabel}</span>
        {date && <span className="video-date">{date}</span>}
      </div>

      {isInProgress && (
        <div className="progress-bar">
          <div className="progress-bar-inner" />
        </div>
      )}

      {video.caption && (
        <p className="video-caption">{video.caption}</p>
      )}

      {video.pikaPrompt && (
        <p className="video-scene-prompt">
          <em>Scene: {video.pikaPrompt}</em>
        </p>
      )}

      {video.status === "failed" && video.errorMessage && (
        <p className="error">{video.errorMessage}</p>
      )}

      {video.status === "posted" && video.publishId && (
        <p className="publish-id">publish_id: {video.publishId}</p>
      )}

      {video.status === "ready" && tiktokConnected && (
        <div>
          {error && <p className="error">{error}</p>}
          <button onClick={handlePost} disabled={posting} className="btn-primary">
            {posting ? "Posting…" : "Post to TikTok"}
          </button>
        </div>
      )}

      {video.status === "ready" && !tiktokConnected && (
        <p className="hint">Connect TikTok above to post this video.</p>
      )}
    </div>
  );
}
