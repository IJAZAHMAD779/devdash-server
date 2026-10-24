interface SynthesizedComponentOutput {
  name: string;
  category: string;
  description: string;
  framework: "REACT" | "NEXTJS" | "HTML_CSS";
  styling: "TAILWIND" | "VANILLA_CSS";
  dependencies: string[];
  propsSchema: Array<{
    prop: string;
    type: string;
    default?: string;
    description: string;
  }>;
  howToUse: string;
  aiAgentPrompt: string;
  code: string;
}

const MODEL_PRIORITY = [
  "gemini-4-argon",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
];

async function callGemini(systemPrompt: string, userPrompt: string): Promise<SynthesizedComponentOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in server environment.");
  }

  let lastError: Error | null = null;

  for (const model of MODEL_PRIORITY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\nTask:\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.2,
          },
        }),
      });

      clearTimeout(timeout);
      const data = (await response.json()) as any;

      if (!response.ok) {
        const errorMsg = data?.error?.message || response.statusText;
        // If quota exceeded (429) or high demand (503), try next model in fallback priority
        if (response.status === 429 || response.status === 503) {
          lastError = new Error(`[${model}] ${errorMsg}`);
          continue;
        }
        throw new Error(`Gemini API error (${response.status}): ${errorMsg}`);
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error(`Model ${model} returned an empty response.`);
      }

      const parsed = JSON.parse(text) as SynthesizedComponentOutput;

      // Sanitize output fields
      return {
        name: parsed.name?.replace(/[^a-zA-Z0-9]/g, "") || "CustomComponent",
        category: (parsed.category || "general").toLowerCase().trim(),
        description: parsed.description || "A clean modular component designed for DevDash.",
        framework: parsed.framework === "HTML_CSS" ? "HTML_CSS" : parsed.framework === "NEXTJS" ? "NEXTJS" : "REACT",
        styling: parsed.styling === "VANILLA_CSS" ? "VANILLA_CSS" : "TAILWIND",
        dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
        propsSchema: Array.isArray(parsed.propsSchema) ? parsed.propsSchema : [],
        howToUse: parsed.howToUse || "// Import and render inside your view\n<Component />",
        aiAgentPrompt: parsed.aiAgentPrompt || "Generate a modern dark-mode component matching this pattern.",
        code: parsed.code || "// Component code\nexport function Component() { return null; }",
      };
    } catch (err: any) {
      lastError = err;
      // Aborted or network timeout, try next fallback
      continue;
    }
  }

  throw lastError || new Error("All candidate Gemini models failed to generate output.");
}

export const geminiService = {
  async synthesizeFromCode(input: {
    code: string;
    targetFramework?: string;
    styling?: string;
  }): Promise<SynthesizedComponentOutput> {
    const systemPrompt = `You are the DevDash Master Component Architect & AI Prompt Engineer.
Analyze user-provided UI component code and reverse-engineer it into a structured asset specification.

You MUST respond strictly in valid JSON with these exact keys:
- "name": PascalCase component title (e.g., "NotificationBell", "MetricStatCard", "AvatarGroup")
- "category": Choose the single best match from: ["auth", "verify", "error404", "email", "avatar", "button", "modal", "table", "badge", "card", "navigation", "sidebar", "tabs", "dashboard", "pet", "form", "general"]
- "description": Concise 1-2 sentence description of visual aesthetic, state management, and behavior.
- "framework": "REACT" or "NEXTJS" or "HTML_CSS"
- "styling": "TAILWIND" or "VANILLA_CSS"
- "dependencies": Array of NPM package names required by the code (e.g. ["lucide-react", "framer-motion", "clsx", "tailwind-merge"]). If only React, return []
- "propsSchema": Array of objects: [{"prop": string, "type": string, "default"?: string, "description": string}]
- "howToUse": A realistic usage snippet showing how to import and render with props
- "aiAgentPrompt": A comprehensive, high-fidelity prompt that an AI agent (Claude, Cursor, Antigravity, v0) can use in any future project to recreate or adapt this exact component pattern, layout, design tokens, micro-interactions, and props
- "code": The clean, formatted, production-ready source code (export default or export function)`;

    const userPrompt = `Target Framework: ${input.targetFramework || "REACT"}
Target Styling: ${input.styling || "TAILWIND"}

Input Code to Analyze:
\`\`\`
${input.code.trim()}
\`\`\``;

    return callGemini(systemPrompt, userPrompt);
  },

  async generateFromPrompt(input: {
    prompt: string;
    category?: string;
    framework?: string;
    styling?: string;
  }): Promise<SynthesizedComponentOutput> {
    const systemPrompt = `You are the DevDash Master Component Architect & AI Prompt Engineer.
Create a production-ready, beautiful UI component matching the user's description.

Design Standards:
- Dark Luxury Linear Aesthetics: canvas (#010102), surface (#0f1011), hairline border (#23252a), text (#f7f8f8), primary accent (#2563eb).
- No amateur pastel/beige AI fluff.
- Clean Tailwind CSS classes.
- Lucide React icons where relevant.
- Fully accessible, interactive, and responsive.

You MUST respond strictly in valid JSON with these exact keys:
- "name": PascalCase component title
- "category": Match: ["auth", "verify", "error404", "email", "avatar", "button", "modal", "table", "badge", "card", "navigation", "sidebar", "tabs", "dashboard", "pet", "form", "general"]
- "description": Concise 1-2 sentence summary
- "framework": "REACT" or "NEXTJS" or "HTML_CSS"
- "styling": "TAILWIND" or "VANILLA_CSS"
- "dependencies": Array of NPM packages required (e.g. ["lucide-react", "clsx"])
- "propsSchema": Array of objects: [{"prop": string, "type": string, "default"?: string, "description": string}]
- "howToUse": Realistic usage snippet
- "aiAgentPrompt": A comprehensive master prompt that another AI agent can use in future projects to reproduce or customize this component
- "code": Complete, production-ready TSX component with export`;

    const userPrompt = `Requested Component Prompt:
${input.prompt.trim()}

Preferred Category: ${input.category || "auto-detect"}
Preferred Framework: ${input.framework || "REACT"}
Preferred Styling: ${input.styling || "TAILWIND"}`;

    return callGemini(systemPrompt, userPrompt);
  },
};
