export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  // Try Anthropic first
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (anthropicRes.ok) {
    const data = await anthropicRes.json();
    return res.json({ text: data.content[0].text.trim() });
  }

  // Fallback to OpenAI gpt-4o-mini
  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!openaiRes.ok) {
    const data = await openaiRes.json().catch(() => ({}));
    const msg = data?.error?.message ?? `OpenAI HTTP ${openaiRes.status}`;
    return res.status(openaiRes.status).json({ error: msg });
  }

  const data = await openaiRes.json();
  return res.json({ text: data.choices[0].message.content.trim() });
}
