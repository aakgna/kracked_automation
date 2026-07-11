import { useState } from "react";
import { postVideoToTikTok, postPhotosToTikTok } from "../api";
import { getFirestore, doc, updateDoc } from "firebase/firestore";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  generating_script: "Writing script…",
  generating_av: "Generating audio…",
  generating_storyboard: "Directing storyboard…",
  generating_media: "Rendering with Kling AI…",
  composing: "Composing video…",
  ready: "Ready to post",
  posted: "Posted ✓",
  failed: "Failed",
};

interface Props {
  video: {
    id: string;
    status: string;
    mediaType?: string;
    caption?: string;
    script?: string;
    publishId?: string;
    errorMessage?: string;
    createdAt?: any;
    videoUrl?: string;
    imageUrls?: string[];
    imagePaths?: string[];
  };
  tiktokConnected: boolean;
  uid: string;
  onPosted: () => void;
}

const db = getFirestore();

export default function VideoCard({ video, tiktokConnected, uid, onPosted }: Props) {
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const isPhoto = video.mediaType === "photo";

  async function handlePost() {
    if (!video.caption) return;
    setPosting(true);
    setError("");
    try {
      const { publishId } = isPhoto
        ? await postPhotosToTikTok(uid, video.imagePaths ?? [], video.caption)
        : await postVideoToTikTok(uid, video.videoUrl!, video.caption);
      await updateDoc(doc(db, "videos", video.id), { status: "posted", publishId });
      onPosted();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  const isInProgress = ["queued", "generating_script", "generating_av", "generating_storyboard", "generating_media", "composing"].includes(video.status);
  const statusLabel = STATUS_LABELS[video.status] ?? video.status;
  const date = video.createdAt?.toDate ? video.createdAt.toDate().toLocaleString() : "";

  const canPost =
    video.status === "ready" &&
    (isPhoto ? (video.imagePaths?.length ?? 0) > 0 : Boolean(video.videoUrl));

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

      {video.caption && <p className="video-caption">{video.caption}</p>}

      {video.status === "failed" && video.errorMessage && (
        <p className="error">{video.errorMessage}</p>
      )}

      {canPost && (
        <div style={{ marginTop: 10 }}>
          {isPhoto ? (
            <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
              {(video.imageUrls ?? []).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                  <img
                    src={url}
                    alt={`Slide ${i + 1}`}
                    style={{ height: 220, borderRadius: 8, background: "#000" }}
                  />
                </a>
              ))}
            </div>
          ) : (
            <video
              src={video.videoUrl}
              controls
              style={{ width: "100%", maxHeight: 300, borderRadius: 8, background: "#000" }}
            />
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            {!isPhoto && (
              <a href={video.videoUrl} download={`video-${video.id}.mp4`} className="btn-ghost" style={{ textDecoration: "none", textAlign: "center" }}>
                Download
              </a>
            )}
            {tiktokConnected && (
              <button onClick={handlePost} disabled={posting} className="btn-primary" style={{ flex: 1 }}>
                {posting ? "Posting…" : "Post to TikTok"}
              </button>
            )}
          </div>
          {!tiktokConnected && <p className="hint" style={{ marginTop: 8 }}>Connect TikTok above to post.</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {video.status === "posted" && isPhoto && (video.imageUrls?.length ?? 0) > 0 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 10 }}>
          {(video.imageUrls ?? []).map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Slide ${i + 1}`}
              style={{ height: 120, borderRadius: 8, background: "#000", flexShrink: 0 }}
            />
          ))}
        </div>
      )}

      {video.status === "posted" && video.publishId && (
        <p className="publish-id">publish_id: {video.publishId}</p>
      )}
    </div>
  );
}
