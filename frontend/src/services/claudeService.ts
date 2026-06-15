const BASE = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

async function ask(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-allow-browser": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content[0].text.trim();
}

export async function generateScript(productDescription: string, videoStyle: string, apiKey: string): Promise<string> {
  return ask(apiKey, `You are a viral TikTok scriptwriter. Write a 30-45 second spoken script for a TikTok video about this product: "${productDescription}". Video style: ${videoStyle}. The script should hook viewers in the first 3 seconds, be punchy and fast-paced, and end with a strong call to action. Return ONLY the spoken words — no stage directions, no labels.`);
}

export async function generateCaption(script: string, productDescription: string, apiKey: string): Promise<string> {
  return ask(apiKey, `Write a TikTok caption (under 150 chars) with 3-5 relevant hashtags for this script about "${productDescription}": ${script.slice(0, 200)}. Return ONLY the caption text.`);
}

export async function generatePikaPrompt(productDescription: string, script: string, apiKey: string): Promise<string> {
  return ask(apiKey, `Write a 1-sentence cinematic Pika text-to-video prompt for a vertical 9:16 TikTok video that visually accompanies this script about "${productDescription}": ${script.slice(0, 150)}. Describe motion, colors, style. No text overlays. Return ONLY the prompt.`);
}
