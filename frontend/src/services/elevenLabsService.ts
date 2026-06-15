export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface AudioResult {
  audioBlob: Blob;
  wordTimestamps: WordTimestamp[];
  duration: number;
}

export async function generateAudio(
  text: string,
  voiceId: string,
  apiKey: string,
  modelId = "eleven_turbo_v2_5"
): Promise<AudioResult> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const audioBase64: string = data.audio_base64 ?? data.audio_base_64 ?? "";
  const alignment = data.alignment ?? {};

  // Decode base64 audio
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const audioBlob = new Blob([bytes], { type: "audio/mpeg" });

  // Build word timestamps
  const chars: string[] = alignment.characters ?? [];
  const starts: number[] = alignment.character_start_times_seconds ?? [];
  const ends: number[] = alignment.character_end_times_seconds ?? [];

  const wordTimestamps: WordTimestamp[] = [];
  let currentWord = "";
  let wordStart = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === " " || i === chars.length - 1) {
      if (ch !== " ") currentWord += ch;
      if (currentWord.trim()) {
        wordTimestamps.push({ word: currentWord.trim(), start: wordStart, end: ends[i] });
      }
      currentWord = "";
      wordStart = starts[i + 1] ?? 0;
    } else {
      if (!currentWord) wordStart = starts[i];
      currentWord += ch;
    }
  }

  const duration = ends.length ? ends[ends.length - 1] : 0;
  return { audioBlob, wordTimestamps, duration };
}
