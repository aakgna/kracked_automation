export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, system, schema } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  // Try Anthropic first
  const anthropicBody = {
    model: "claude-opus-4-8",
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  };
  if (system) anthropicBody.system = system;
  if (schema) anthropicBody.output_config = { format: { type: "json_schema", schema } };

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(anthropicBody),
  });

  if (anthropicRes.ok) {
    const data = await anthropicRes.json();
    const text = data.content.find((b) => b.type === "text")?.text ?? "";
    return res.json({ text: text.trim() });
  }

  // Fallback to OpenAI gpt-4o-mini (can't honor output_config — coerce via prompt)
  const openaiMessages = [];
  if (system) openaiMessages.push({ role: "system", content: system });
  openaiMessages.push({
    role: "user",
    content: schema
      ? `${prompt}\n\nReturn ONLY valid JSON matching this schema:\n${JSON.stringify(schema)}`
      : prompt,
  });

  const openaiBody = {
    model: "gpt-4o-mini",
    max_tokens: 8192,
    messages: openaiMessages,
  };
  if (schema) openaiBody.response_format = { type: "json_object" };

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(openaiBody),
  });

  if (!openaiRes.ok) {
    const data = await openaiRes.json().catch(() => ({}));
    const msg = data?.error?.message ?? `OpenAI HTTP ${openaiRes.status}`;
    return res.status(openaiRes.status).json({ error: msg });
  }

  const data = await openaiRes.json();
  return res.json({ text: data.choices[0].message.content.trim() });
}
