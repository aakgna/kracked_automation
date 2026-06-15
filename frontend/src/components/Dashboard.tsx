import { useEffect, useRef, useState } from "react";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, query, where, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { generateScript, generateCaption, generatePikaPrompt } from "../services/claudeService";
import { generateAudio } from "../services/elevenLabsService";
import { fetchBrainrotVideoUrls } from "../services/pexelsService";
import { composeVideo } from "../services/videoComposer";
import { getTikTokAuthUrl, disconnectTikTok } from "../api";
import { fetchBackgroundMusicUrl } from "../services/musicService";
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

type Mode = "brainrot" | "pika";

const db = getFirestore();
const storage = getStorage();

export default function Dashboard({ user, onRefreshUser }: Props) {
  const [videos, setVideos] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [composeProgress, setComposeProgress] = useState(0);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("brainrot");
  const unsubRef = useRef<(() => void) | null>(null);

  // Real-time listener for this user's videos
  useEffect(() => {
    const q = query(
      collection(db, "videos"),
      where("userId", "==", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        .slice(0, 20);
      setVideos(sorted);
    });
    unsubRef.current = unsub;
    return () => unsub();
  }, [user.uid]);

  async function handleGenerate() {
    setError("");
    setGenerating(true);
    setComposeProgress(0);

    const videoRef = await addDoc(collection(db, "videos"), {
      userId: user.uid,
      status: "queued",
      mode,
      script: null,
      caption: null,
      pikaPrompt: null,
      errorMessage: null,
      videoUrl: null,
      publishId: null,
      createdAt: serverTimestamp(),
    });
    const videoId = videoRef.id;

    const update = (fields: Record<string, any>) => updateDoc(doc(db, "videos", videoId), fields);

    try {
      const elKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
      const elVoice = import.meta.env.VITE_ELEVENLABS_VOICE_ID;
      const pexelsKey = import.meta.env.VITE_PEXELS_API_KEY;

      // Stage 1: Script
      setProgress("Writing script…");
      await update({ status: "generating_script" });
      const script = await generateScript(user.productDescription, user.videoStyle);
      const caption = await generateCaption(script, user.productDescription);
      const pikaPrompt = mode === "pika" ? await generatePikaPrompt(user.productDescription, script) : null;
      await update({ script, caption, pikaPrompt });

      // Stage 2: Audio + Video source
      setProgress("Generating audio & fetching video…");
      await update({ status: "generating_av" });

      const jamendoId = import.meta.env.VITE_JAMENDO_CLIENT_ID ?? "";
      const [audioResult, videoUrls, musicUrl] = await Promise.all([
        generateAudio(script, elVoice, elKey),
        mode === "brainrot" ? fetchBrainrotVideoUrls(pexelsKey, 4) : Promise.resolve([""]),
        jamendoId ? fetchBackgroundMusicUrl(jamendoId) : Promise.resolve(null),
      ]);

      // Stage 3: Compose
      setProgress("Composing video…");
      await update({ status: "composing" });

      const videoBlob = await composeVideo(
        videoUrls,
        audioResult.audioBlob,
        audioResult.wordTimestamps,
        audioResult.duration,
        musicUrl,
        0.15,
        (r) => setComposeProgress(Math.round(r * 100))
      );

      // Stage 4: Upload to Firebase Storage
      setProgress("Uploading…");
      const storageRef = ref(storage, `videos/${user.uid}/${videoId}.mp4`);
      await uploadBytes(storageRef, videoBlob, { contentType: "video/mp4" });
      const downloadUrl = await getDownloadURL(storageRef);

      await update({ status: "ready", videoUrl: downloadUrl });
      setProgress("");
    } catch (e: any) {
      await updateDoc(doc(db, "videos", videoId), {
        status: "failed",
        errorMessage: e.message ?? String(e),
      });
      setError(e.message ?? "Generation failed");
    } finally {
      setGenerating(false);
      setProgress("");
      setComposeProgress(0);
    }
  }

  async function handleConnectTikTok() {
    const { url } = await getTikTokAuthUrl(user.uid);
    const popup = window.open(url, "tiktok-auth", "width=600,height=700");
    window.addEventListener("message", async (e) => {
      if (e.data?.tiktok === "connected") {
        popup?.close();
        onRefreshUser();
      }
    }, { once: true });
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Video Creator</h1>
          <p className="subtitle">{user.productDescription?.slice(0, 80)}…</p>
        </div>
        <div className="tiktok-status">
          {user.tiktokConnected ? (
            <>
              <span className="connected">TikTok connected ✓</span>
              <button className="btn-ghost" onClick={() => disconnectTikTok(user.uid).then(onRefreshUser)}>
                Disconnect
              </button>
            </>
          ) : (
            <button className="btn-tiktok" onClick={handleConnectTikTok}>
              Connect TikTok
            </button>
          )}
        </div>
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

        {generating && (
          <div style={{ marginBottom: 12 }}>
            <p className="hint">{progress}</p>
            {composeProgress > 0 && (
              <div className="progress-bar">
                <div className="progress-bar-inner" style={{ width: `${composeProgress}%`, animation: "none" }} />
              </div>
            )}
          </div>
        )}

        <button onClick={handleGenerate} disabled={generating} className="btn-primary btn-large">
          {generating ? "Generating…" : "Generate Video"}
        </button>
        <p className="hint">Runs entirely in your browser — no server needed</p>
      </div>

      {videos.length > 0 && (
        <div className="video-list">
          <h2>Your videos</h2>
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              tiktokConnected={user.tiktokConnected}
              uid={user.uid}
              onPosted={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
