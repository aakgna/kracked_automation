const QUERIES = [
  "subway surfers gameplay",
  "minecraft parkour",
  "jetpack joyride gameplay",
  "temple run gameplay",
  "satisfying parkour",
  "free running parkour",
  "skateboard tricks",
];

export async function fetchBrainrotVideoUrl(apiKey: string): Promise<string> {
  const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];

  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait`,
    { headers: { Authorization: apiKey } }
  );
  if (!res.ok) throw new Error(`Pexels error ${res.status}`);

  let videos = (await res.json()).videos ?? [];

  if (!videos.length) {
    const fallback = await fetch(
      `https://api.pexels.com/videos/search?query=parkour&per_page=15`,
      { headers: { Authorization: apiKey } }
    );
    videos = (await fallback.json()).videos ?? [];
  }

  if (!videos.length) throw new Error("No videos found on Pexels");

  const video = videos[Math.floor(Math.random() * videos.length)];
  const files: any[] = video.video_files ?? [];
  const hdFiles = files.filter((f) => f.height <= 1080 && f.height >= 480);
  const sorted = (hdFiles.length ? hdFiles : files).sort(
    (a, b) => b.width * b.height - a.width * a.height
  );

  if (!sorted.length) throw new Error("No suitable video files found");
  return sorted[0].link;
}
