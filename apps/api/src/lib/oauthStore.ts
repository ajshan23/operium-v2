import crypto from "crypto";

/**
 * Short-lived store for pending OAuth authorization codes (the MCP auth flow).
 * In-memory is fine for a single-instance deployment — codes live ~10 min and
 * are single-use. Move to Redis/Mongo if the api ever scales horizontally.
 */
export interface PendingCode {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  expiresAt: Date;
}

const pendingCodes = new Map<string, PendingCode>();

export function storeAuthCode(data: PendingCode): string {
  const code = "oac_" + crypto.randomBytes(24).toString("hex");
  pendingCodes.set(code, data);
  // Auto-expire; unref so the timer never keeps the process alive.
  setTimeout(() => pendingCodes.delete(code), 10 * 60 * 1000).unref?.();
  return code;
}

export function consumeAuthCode(code: string): PendingCode | null {
  const data = pendingCodes.get(code);
  if (!data) return null;
  pendingCodes.delete(code); // single-use
  if (data.expiresAt < new Date()) return null;
  return data;
}
