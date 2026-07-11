async function ask(prompt: string, system?: string, schema?: object): Promise<string> {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, system, schema }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.text;
}

async function askJson<T>(prompt: string, system: string, schema: object): Promise<T> {
  const text = await ask(prompt, system, schema);
  try {
    return JSON.parse(text) as T;
  } catch {
    // Fallback models sometimes wrap JSON in prose or code fences
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("Claude returned invalid JSON for a structured request");
  }
}

export async function generateScript(
  productDescription: string,
  videoStyle: string,
  lengthSeconds = "30-45"
): Promise<string> {
  return ask(`You are a viral TikTok scriptwriter. Write a ${lengthSeconds} second spoken script for a TikTok video about this product: "${productDescription}". Video style: ${videoStyle}. Hook viewers in the first 3 seconds, be punchy and fast-paced, end with a strong call to action. Return ONLY the spoken words — no stage directions, no labels.`);
}

export async function generateCaption(script: string, productDescription: string): Promise<string> {
  return ask(`Write a TikTok caption (under 150 chars) with 3-5 relevant hashtags for this script about "${productDescription}": ${script.slice(0, 200)}. Return ONLY the caption text.`);
}

// ---------------------------------------------------------------------------
// Kling prompt layer — every generator shares one director-grade system prompt
// so all three modes produce cohesive, non-generic marketing visuals.
// ---------------------------------------------------------------------------

const KRACKED_DIRECTOR_SYSTEM = `You are a senior brand film director and product marketer working for Kracked (kracked.app), an app that auto-creates and posts TikTok marketing content.

Your output feeds an AI video/image generator (Kling), so every prompt you write must be a complete, self-contained visual specification. Non-negotiable rules:

- PROFOUND PRODUCT MARKETING, NEVER AI SLOP. No vague adjectives ("stunning", "amazing", "cinematic vibes"). Every claim about the frame must be concrete and filmable.
- CINEMATOGRAPHY IS EXPLICIT: name the lens (e.g. 35mm anamorphic), the camera move (slow push-in, orbital dolly, whip pan), the lighting setup (single hard key from camera left, tungsten practicals, overcast softbox sky), and the color palette (2-4 named colors with where they appear).
- SECOND-BY-SECOND BEATS: describe what happens inside the shot moment by moment, so motion is choreographed rather than random.
- ONE CONTINUOUS VISUAL MOTIF across every scene/slide (an object, a color, a light source, a texture) so the set reads as one campaign.
- NO ON-SCREEN TEXT, no captions, no logos, no UI mockups with legible words — karaoke captions are overlaid later and AI-rendered text looks broken.
- 9:16 VERTICAL framing: compose for a phone screen; keep the subject in the center-safe area, use vertical leading lines.
- PREMIUM, CONSIDERED TONE: this is brand film language, not stock-footage language. Think product truth made visible, not decoration.`;

export interface StoryboardSecond {
  t: number;
  action: string;
}

export interface StoryboardScene {
  prompt: string;
  negativePrompt: string;
  seconds: StoryboardSecond[];
}

export interface KlingStoryboard {
  scenes: StoryboardScene[];
}

const STORYBOARD_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "Complete Kling text2video prompt for one 10s shot, under 2400 characters, embedding the per-second beats, cinematography, palette, motif and continuity notes.",
          },
          negativePrompt: {
            type: "string",
            description: "Comma-separated list of artifacts to avoid (text, watermarks, warped hands, etc.).",
          },
          seconds: {
            type: "array",
            items: {
              type: "object",
              properties: {
                t: { type: "integer", description: "Second within the shot (0-9)." },
                action: { type: "string", description: "What happens at this second." },
              },
              required: ["t", "action"],
              additionalProperties: false,
            },
          },
        },
        required: ["prompt", "negativePrompt", "seconds"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
};

export async function generateKlingStoryboard(
  productDescription: string,
  videoStyle: string,
  script: string
): Promise<KlingStoryboard> {
  const storyboard = await askJson<KlingStoryboard>(
    `Design a storyboard of exactly 3 or 4 scenes for a vertical TikTok brand film about this product: "${productDescription}". Video style: ${videoStyle}.

The finished video will play this voiceover on top (you are choreographing visuals to accompany it, not illustrating it literally):
"${script}"

Each scene becomes ONE 10-second AI-generated shot. For each scene:
- Write the per-second beat map first (seconds 0-9), then fold those beats into a single flowing "prompt" under 2400 characters.
- Scene prompts after the first must open with a continuity note restating the shared motif, palette and lighting from the previous scene so the shots cut together seamlessly.
- The final scene should land the product's core promise visually — the image a viewer remembers.
Return the storyboard as JSON.`,
    KRACKED_DIRECTOR_SYSTEM,
    STORYBOARD_SCHEMA
  );
  if (!storyboard.scenes?.length) throw new Error("Storyboard came back empty");
  for (const scene of storyboard.scenes) {
    if (scene.prompt.length > 2500) scene.prompt = scene.prompt.slice(0, 2500);
  }
  return storyboard;
}

export interface CarouselSlide {
  prompt: string;
  role: string;
}

export interface CarouselPlan {
  images: CarouselSlide[];
  caption: string;
}

const CAROUSEL_SCHEMA = {
  type: "object",
  properties: {
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "Complete Kling image-generation prompt for one 9:16 slide, under 2400 characters, beginning with the shared art-direction block verbatim.",
          },
          role: {
            type: "string",
            description: "The slide's job in the arc: hook, product truth, proof, or CTA.",
          },
        },
        required: ["prompt", "role"],
        additionalProperties: false,
      },
    },
    caption: {
      type: "string",
      description: "TikTok caption for the carousel, under 150 characters, with 3-5 hashtags.",
    },
  },
  required: ["images", "caption"],
  additionalProperties: false,
};

export async function generateCarouselPlan(
  productDescription: string,
  videoStyle: string
): Promise<CarouselPlan> {
  const plan = await askJson<CarouselPlan>(
    `Design a TikTok photo carousel of 3 to 5 slides marketing this product: "${productDescription}". Visual style: ${videoStyle}.

The slides must read as one campaign with a narrative arc: hook → product truth → proof → CTA (the CTA slide is still purely visual — no text).
- First write one shared art-direction block (palette, lighting, lens, motif, mood — 2-4 sentences).
- Then begin EVERY slide prompt with that art-direction block repeated verbatim, followed by the slide-specific composition.
- Each slide prompt stays under 2400 characters.
Return the plan as JSON.`,
    KRACKED_DIRECTOR_SYSTEM,
    CAROUSEL_SCHEMA
  );
  if (!plan.images?.length) throw new Error("Carousel plan came back empty");
  for (const slide of plan.images) {
    if (slide.prompt.length > 2500) slide.prompt = slide.prompt.slice(0, 2500);
  }
  return plan;
}

export interface HeroImagePlan {
  imagePrompt: string;
  motionPrompts: string[];
}

const HERO_SCHEMA = {
  type: "object",
  properties: {
    imagePrompt: {
      type: "string",
      description:
        "Complete Kling image-generation prompt for the 9:16 hero frame, under 2400 characters.",
    },
    motionPrompts: {
      type: "array",
      items: {
        type: "string",
        description:
          "Kling image2video motion prompt for one 10s clip animating the hero image: explicit camera move plus subject motion, under 2400 characters.",
      },
    },
  },
  required: ["imagePrompt", "motionPrompts"],
  additionalProperties: false,
};

export async function generateHeroImagePlan(
  productDescription: string,
  script: string
): Promise<HeroImagePlan> {
  const plan = await askJson<HeroImagePlan>(
    `Design a hero image plus motion plan for a vertical TikTok brand film about this product: "${productDescription}".

The finished video plays this voiceover on top:
"${script}"

1. "imagePrompt": one 9:16 hero frame that captures the product's essence — the single image the whole film lives inside. Make it rich enough that a camera can explore it for 30-40 seconds.
2. "motionPrompts": exactly 3 or 4 prompts, each animating that SAME hero frame into a distinct 10-second clip. Each names one clear camera move and one subject/environment motion (light shifting, particles drifting, fabric moving). Vary the moves so the clips cut together like coverage of one scene.
Return the plan as JSON.`,
    KRACKED_DIRECTOR_SYSTEM,
    HERO_SCHEMA
  );
  if (!plan.imagePrompt || !plan.motionPrompts?.length) throw new Error("Hero image plan came back empty");
  if (plan.imagePrompt.length > 2500) plan.imagePrompt = plan.imagePrompt.slice(0, 2500);
  plan.motionPrompts = plan.motionPrompts.map((p) => (p.length > 2500 ? p.slice(0, 2500) : p));
  return plan;
}
