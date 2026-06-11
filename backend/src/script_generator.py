import anthropic


class ScriptGenerationError(RuntimeError):
    pass


_SCRIPT_SYSTEM = """\
You are a short-form video scriptwriter. Write a compelling TikTok script for the user's product.

Rules:
- Exactly 100-120 words (targets under 45 seconds at a natural speaking pace)
- Conversational, punchy tone — sound like a real person, not an ad
- No em-dashes, no hashtags, no stage directions, no emojis
- Start with a strong hook (no "Hey guys" or "Welcome back")
- End with a clear call to action mentioning the product or its URL
- Match the user's requested video style
- Output ONLY the script text — no title, no labels, nothing else"""

_CAPTION_SYSTEM = """\
You are writing a TikTok caption for a product video.

Format (output ONLY this, nothing else):
Download [Product Name]
[one punchy sentence — a surprising fact or stat relevant to the video topic]
#hashtag1 #hashtag2 #hashtag3 #hashtag4 #hashtag5

Rules:
- First line is exactly: Download [Product Name]
- Fact sentence is 1 sentence max, punchy and scroll-stopping
- Exactly 5 hashtags, all lowercase, relevant to topic + general reach
- Always include the product's branded hashtag
- No emojis, no extra lines"""

_PIKA_SYSTEM = """\
You are a text-to-video prompt writer for Pika Art.
Write ONE sentence (max 30 words) describing a visually stunning, cinematic shot for a 9:16 vertical TikTok video.
Focus on: motion, lighting, colors, camera angle, visual style.
Do NOT include: text overlays, people talking, UI screens, or the product name as text.
Output ONLY the prompt sentence."""


def generate_script(
    product_description: str,
    video_style: str,
    api_key: str,
    model: str = "claude-sonnet-4-6",
) -> str:
    client = anthropic.Anthropic(api_key=api_key)
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=400,
            system=_SCRIPT_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Product: {product_description}\n\n"
                        f"Video style: {video_style}"
                    ),
                }
            ],
        )
    except anthropic.APIError as e:
        raise ScriptGenerationError(f"Claude API error: {e}") from e

    text = msg.content[0].text.strip()
    if not text:
        raise ScriptGenerationError("Claude returned empty script.")

    word_count = len(text.split())
    if not (90 <= word_count <= 140):
        print(f"  [warn] Script word count is {word_count} (target 100-120)")

    return text


def generate_caption(
    script: str,
    product_description: str,
    api_key: str,
    model: str = "claude-sonnet-4-6",
) -> str:
    client = anthropic.Anthropic(api_key=api_key)
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=150,
            system=_CAPTION_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Product context: {product_description}\n\n"
                        f"Script:\n{script}"
                    ),
                }
            ],
        )
    except anthropic.APIError as e:
        raise ScriptGenerationError(f"Claude API error (caption): {e}") from e

    return msg.content[0].text.strip()


def generate_pika_prompt(
    product_description: str,
    script: str,
    api_key: str,
    model: str = "claude-sonnet-4-6",
) -> str:
    client = anthropic.Anthropic(api_key=api_key)
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=80,
            system=_PIKA_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Product: {product_description}\n\n"
                        f"Script topic summary: {script[:200]}"
                    ),
                }
            ],
        )
    except anthropic.APIError as e:
        raise ScriptGenerationError(f"Claude API error (pika prompt): {e}") from e

    return msg.content[0].text.strip()
