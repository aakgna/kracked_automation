const QUERIES = [
  "subway surfers gameplay",
  "minecraft parkour",
  "satisfying parkour",
  "free running parkour",
  "skateboard tricks",
  "jetpack joyride gameplay",
  "temple run gameplay",
];

async function fetchOneClip(apiKey: string, query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) return null;
    const videos: any[] = (await res.json()).videos ?? [];
    if (!videos.length) return null;

    const video = videos[Math.floor(Math.random() * videos.length)];
    const files: any[] = video.video_files ?? [];
    const hdFiles = files.filter((f) => f.height <= 1080 && f.height >= 480);
    const sorted = (hdFiles.length ? hdFiles : files).sort(
      (a, b) => b.width * b.height - a.width * a.height
    );
    return sorted[0]?.link ?? null;
  } catch {
    return null;
  }
}

export async function fetchBrainrotVideoUrls(apiKey: string, count = 4): Promise<string[]> {
  // Pick `count` distinct random queries
  const shuffled = [...QUERIES].sort(() => Math.random() - 0.5).slice(0, count);
  const results = await Promise.all(shuffled.map((q) => fetchOneClip(apiKey, q)));
  const urls = results.filter((u): u is string => !!u);

  if (!urls.length) {
    // Fallback: try generic parkour
    const fallback = await fetchOneClip(apiKey, "parkour");
    if (fallback) urls.push(fallback);
  }

  if (!urls.length) throw new Error("No videos found on Pexels");
  return urls;
}
