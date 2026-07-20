import { GoogleGenAI } from "@google/genai";

// Verified against the live API (Jul 2026): 3.5-flash is the newest stable
// flash, flash-latest is Google's auto-tracking alias, 2.5-flash still serves,
// gemma is the free-tier last resort. Preview model ids rot fast — prefer
// stable ids + the alias so a retired model never takes the cascade down.
const MODEL_CASCADE = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemma-4-31b-it",
] as const;

function isRateLimit(err: any): boolean {
  const msg: string = err?.message || "";
  return (
    err?.status === 429 ||
    msg.includes("429") ||
    msg.toLowerCase().includes("quota") ||
    msg.toLowerCase().includes("rate limit") ||
    msg.toLowerCase().includes("resource has been exhausted")
  );
}

/** Errors that should advance the cascade instead of failing the request —
 *  crucially including 404s from retired model ids. */
function shouldTryNextModel(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  return (
    isRateLimit(err) ||
    err?.status === 404 ||
    msg.includes("not found") ||
    msg.includes("404") ||
    msg.includes("unavailable") ||
    msg.includes("deprecated") ||
    msg.includes("not supported") ||
    msg.includes("invalid argument")
  );
}

function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .replace(/^\s*<\/?think(?:ing)?>\s*$/gim, "")
    .trim();
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export class AIService {
  private getKey(override?: string): string {
    const key = override || process.env.GOOGLE_API_KEY;
    if (!key) throw Object.assign(new Error("No GOOGLE_API_KEY configured"), { code: "NO_GEMINI_KEY" });
    return key;
  }

  async generate(prompt: string, apiKey?: string, thinkingBudget = 0): Promise<string> {
    const key = this.getKey(apiKey);
    const ai  = new GoogleGenAI({ apiKey: key });
    let lastError: any;

    for (const modelName of MODEL_CASCADE) {
      try {
        const result = await ai.models.generateContent({
          model:    modelName,
          contents: prompt,
          // Gemma models reject thinkingConfig
          ...(modelName.startsWith("gemini") ? { config: { thinkingConfig: { thinkingBudget } } } : {}),
        });

        const parts: any[] = result.candidates?.[0]?.content?.parts ?? [];
        const textOnly = parts
          .filter((p: any) => p.text !== undefined && !p.thought)
          .map((p: any) => p.text as string)
          .join("");

        const raw = textOnly || result.text || "";
        return stripThinkingBlocks(raw);
      } catch (err: any) {
        lastError = err;
        if (shouldTryNextModel(err)) continue;
        throw err;
      }
    }
    throw lastError;
  }

  async chat(messages: ChatMessage[], systemPrompt: string, apiKey?: string): Promise<string> {
    const key = this.getKey(apiKey);
    const ai  = new GoogleGenAI({ apiKey: key });
    let lastError: any;

    for (const modelName of MODEL_CASCADE) {
      try {
        const history = messages.slice(0, -1).map(m => ({
          role:  m.role,
          parts: [{ text: m.content }],
        }));

        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) throw new Error("No messages provided");

        // Gemma rejects systemInstruction — fold the prompt into the history
        const isGemini = modelName.startsWith("gemini");
        const chat = ai.chats.create({
          model:   modelName,
          ...(isGemini ? { config: { systemInstruction: systemPrompt } } : {}),
          history: isGemini ? history : [
            { role: "user",  parts: [{ text: systemPrompt }] },
            { role: "model", parts: [{ text: "Understood." }] },
            ...history,
          ],
        });
        const result = await chat.sendMessage({ message: lastMsg.content });

        const parts: any[] = result.candidates?.[0]?.content?.parts ?? [];
        const textOnly = parts
          .filter((p: any) => p.text !== undefined && !p.thought)
          .map((p: any) => p.text as string)
          .join("");

        return stripThinkingBlocks(textOnly || result.text || "");
      } catch (err: any) {
        lastError = err;
        if (shouldTryNextModel(err)) continue;
        throw err;
      }
    }
    throw lastError;
  }
}

export const aiService = new AIService();
