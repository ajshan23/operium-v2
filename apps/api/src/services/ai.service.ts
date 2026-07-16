import { GoogleGenAI } from "@google/genai";

const MODEL_CASCADE = [
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
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
          config:   { thinkingConfig: { thinkingBudget } },
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
        if (isRateLimit(err) || err?.message?.includes("unavailable") || err?.message?.includes("deprecated")) {
          continue;
        }
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

        const chat = ai.chats.create({
          model:   modelName,
          config:  { systemInstruction: systemPrompt },
          history,
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
        if (isRateLimit(err) || err?.message?.includes("unavailable") || err?.message?.includes("deprecated")) {
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }
}

export const aiService = new AIService();
