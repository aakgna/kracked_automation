import { useEffect, useRef, useState } from "react";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, query, where, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { generateScript, generateCaption, generateKlingStoryboard, generateCarouselPlan, generateHeroImagePlan } from "../services/claudeService";
import { generateAudio } from "../services/elevenLabsService";
import { fetchBrainrotVideoUrls } from "../services/pexelsService";
import { composeVideo } from "../services/videoComposer";
import { generateVideoClips, generateImages, generateHeroImage, generateImageToVideoClips } from "../services/klingService";
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

type Mode = "brainrot" | "kling-video" | "kling-carousel" | "kling-i2v";

const MODE_HINTS: Record<Mode, string> = {
  "brainrot": "Subway Surfers · Minecraft · Jetpack Joyride background",
  "kling-video": "Kling AI renders a 3-4 scene brand film from a Claude storyboard",
  "kling-carousel": "Kling AI generates a 3-5 image photo carousel",
  "kling-i2v": "Kling AI designs a hero image, then animates it into a film",
};

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
      mediaType: mode === "kling-carousel" ? "photo" : "video",
      script: null,
      caption: null,
      storyboard: null,
      errorMessage: null,
      videoUrl: null,
      imageUrls: null,
      imagePaths: null,
      publishId: null,
      createdAt: serverTimestamp(),
    });
    const videoId = videoRef.id;

    const update = (fields: Record<string, any>) => updateDoc(doc(db, "videos", videoId), fields);

    try {
      if (mode === "kling-carousel") {
        await runCarouselFlow(videoId, update);
      } else if (mode === "brainrot") {
        await runBrainrotFlow(videoId, update);
      } else {
        await runKlingVideoFlow(videoId, update);
      }
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

  async function runBrainrotFlow(videoId: string, update: (f: Record<string, any>) => Promise<void>) {
    const elKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
    const elVoice = import.meta.env.VITE_ELEVENLABS_VOICE_ID;
    const pexelsKey = import.meta.env.VITE_PEXELS_API_KEY;

    // Stage 1: Script
    setProgress("Writing script…");
    await update({ status: "generating_script" });
    const script = await generateScript(user.productDescription, user.videoStyle);
    const caption = await generateCaption(script, user.productDescription);
    await update({ script, caption });

    // Stage 2: Audio + Video source
    setProgress("Generating audio & fetching video…");
    await update({ status: "generating_av" });

    const jamendoId = import.meta.env.VITE_JAMENDO_CLIENT_ID ?? "";
    const [audioResult, videoUrls, musicUrl] = await Promise.all([
      generateAudio(script, elVoice, elKey),
      fetchBrainrotVideoUrls(pexelsKey, 4),
      jamendoId ? fetchBackgroundMusicUrl(jamendoId) : Promise.resolve(null),
    ]);

    await composeAndPublish(videoId, update, videoUrls, audioResult, musicUrl, caption);
  }

  async function runKlingVideoFlow(videoId: string, update: (f: Record<string, any>) => Promise<void>) {
    const elKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
    const elVoice = import.meta.env.VITE_ELEVENLABS_VOICE_ID;

    // Stage 1: Script + storyboard
    setProgress("Writing script…");
    await update({ status: "generating_script" });
    const script = await generateScript(user.productDescription, user.videoStyle, "20-40");
    const caption = await generateCaption(script, user.productDescription);
    await update({ script, caption });

    setProgress("Directing the storyboard…");
    await update({ status: "generating_storyboard" });

    // Stage 2: Kling clips + audio + music in parallel
    const jamendoId = import.meta.env.VITE_JAMENDO_CLIENT_ID ?? "";
    const onClipProgress = (done: number, total: number) =>
      setProgress(`Rendering scene ${Math.min(done + 1, total)}/${total} with Kling AI…`);

    let clipsPromise: Promise<{ urls: string[]; paths: string[] }>;
    if (mode === "kling-i2v") {
      const plan = await generateHeroImagePlan(user.productDescription, script);
      await update({ status: "generating_media", storyboard: JSON.stringify(plan) });
      setProgress("Generating hero image…");
      clipsPromise = generateHeroImage(user.uid, videoId, plan.imagePrompt).then((hero) => {
        setProgress(`Animating hero image (${plan.motionPrompts.length} clips)…`);
        return generateImageToVideoClips(user.uid, videoId, hero.storageUrl, plan.motionPrompts, onClipProgress);
      });
    } else {
      const storyboard = await generateKlingStoryboard(user.productDescription, user.videoStyle, script);
      await update({ status: "generating_media", storyboard: JSON.stringify(storyboard) });
      setProgress(`Rendering scene 1/${storyboard.scenes.length} with Kling AI…`);
      clipsPromise = generateVideoClips(user.uid, videoId, storyboard, onClipProgress);
    }

    const [audioResult, clips, musicUrl] = await Promise.all([
      generateAudio(script, elVoice, elKey),
      clipsPromise,
      jamendoId ? fetchBackgroundMusicUrl(jamendoId) : Promise.resolve(null),
    ]);

    await composeAndPublish(videoId, update, clips.urls, audioResult, musicUrl, caption);
  }

  async function composeAndPublish(
    videoId: string,
    update: (f: Record<string, any>) => Promise<void>,
    videoUrls: string[],
    audioResult: Awaited<ReturnType<typeof generateAudio>>,
    musicUrl: string | null,
    caption: string
  ) {
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

    // Stage 5: Auto-post to TikTok if connected
    if (user.tiktokConnected) {
      setProgress("Posting to TikTok…");
      const { postVideoToTikTok } = await import("../api");
      const { publishId } = await postVideoToTikTok(user.uid, downloadUrl, caption);
      await update({ status: "posted", publishId, videoUrl: null });
      await deleteObject(storageRef).catch(() => {});
    }
  }

  async function runCarouselFlow(videoId: string, update: (f: Record<string, any>) => Promise<void>) {
    // Stage 1: Carousel plan (art direction + slide prompts + caption)
    setProgress("Art-directing the carousel…");
    await update({ status: "generating_storyboard" });
    const plan = await generateCarouselPlan(user.productDescription, user.videoStyle);
    await update({ caption: plan.caption, storyboard: JSON.stringify(plan) });

    // Stage 2: Generate all slides with Kling
    setProgress(`Rendering slide 1/${plan.images.length} with Kling AI…`);
    await update({ status: "generating_media" });
    const media = await generateImages(
      user.uid,
      videoId,
      plan.images.map((s) => s.prompt),
      (done, total) => setProgress(`Rendering slide ${Math.min(done + 1, total)}/${total} with Kling AI…`)
    );
    await update({ status: "ready", imageUrls: media.urls, imagePaths: media.paths });

    // Stage 3: Auto-post to TikTok if connected.
    // Images stay in Storage after posting — TikTok pulls them asynchronously.
    if (user.tiktokConnected) {
      setProgress("Posting carousel to TikTok…");
      const { postPhotosToTikTok } = await import("../api");
      const { publishId } = await postPhotosToTikTok(user.uid, media.paths, plan.caption);
      await update({ status: "posted", publishId });
    }
  }

  async function handleConnectTikTok() {
    const { url, state, codeVerifier } = await getTikTokAuthUrl(user.uid);
    sessionStorage.setItem("tiktok_pkce", JSON.stringify({ state, codeVerifier, uid: user.uid }));
    const popup = window.open(url, "tiktok-auth", "width=600,height=700");
    window.addEventListener("message", async (e) => {
      if (e.data?.tiktok === "connected") {
        popup?.close();
        onRefreshUser();
      } else if (e.data?.tiktok === "error") {
        setError(`TikTok connection failed: ${e.data.message ?? "unknown"}`);
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
            className={mode === "kling-video" ? "mode-btn mode-btn-active" : "mode-btn"}
            onClick={() => setMode("kling-video")}
          >
            🎬 AI Video
          </button>
          <button
            className={mode === "kling-carousel" ? "mode-btn mode-btn-active" : "mode-btn"}
            onClick={() => setMode("kling-carousel")}
          >
            🖼️ Carousel
          </button>
          <button
            className={mode === "kling-i2v" ? "mode-btn mode-btn-active" : "mode-btn"}
            onClick={() => setMode("kling-i2v")}
          >
            ✨ Image→Video
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 12 }}>{MODE_HINTS[mode]}</p>

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
          {generating ? "Generating…" : mode === "kling-carousel" ? "Generate Carousel" : "Generate Video"}
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
