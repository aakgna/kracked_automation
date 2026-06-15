const TAGS = ["lofi", "ambient", "background", "chill", "electronic"];

export async function fetchBackgroundMusicUrl(clientId: string): Promise<string | null> {
  try {
    const tag = TAGS[Math.floor(Math.random() * TAGS.length)];
    const res = await fetch(
      `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=20&tags=${tag}&audioformat=mp32&include=musicinfo`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const tracks: any[] = data.results ?? [];
    if (!tracks.length) return null;
    const track = tracks[Math.floor(Math.random() * tracks.length)];
    return track.audio ?? null;
  } catch {
    return null;
  }
}
