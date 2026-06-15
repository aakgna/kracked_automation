async function ask(prompt: string): Promise<string> {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.text;
}

export async function generateScript(productDescription: string, videoStyle: string): Promise<string> {
  return ask(`You are a viral TikTok scriptwriter. Write a 30-45 second spoken script for a TikTok video about this product: "${productDescription}". Video style: ${videoStyle}. Hook viewers in the first 3 seconds, be punchy and fast-paced, end with a strong call to action. Return ONLY the spoken words — no stage directions, no labels.`);
}

export async function generateCaption(script: string, productDescription: string): Promise<string> {
  return ask(`Write a TikTok caption (under 150 chars) with 3-5 relevant hashtags for this script about "${productDescription}": ${script.slice(0, 200)}. Return ONLY the caption text.`);
}

export async function generatePikaPrompt(productDescription: string, script: string): Promise<string> {
  return ask(`Write a 1-sentence cinematic Pika text-to-video prompt for a vertical 9:16 TikTok video that visually accompanies this script about "${productDescription}": ${script.slice(0, 150)}. Describe motion, colors, style. No text overlays. Return ONLY the prompt.`);
}
