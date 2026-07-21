/**
 * MCP OAuth 2.1 authorization server (PKCE, public clients).
 *
 * This is the flow Claude Code / Codex / Cursor use to connect to the Operium
 * MCP endpoint. Discovery → dynamic registration → /authorize (user signs in &
 * consents) → /token exchanges the code for an access token.
 *
 * The issued access token is a normal Operium JWT (signed with JWT_SECRET), so
 * the existing MCP router (routes/mcp.ts → resolveUser) accepts it as a Bearer
 * token with no extra plumbing. Tokens are long-lived; access is still revoked
 * immediately when a user is blocked (resolveUser re-checks isBlocked).
 */
import { Router, Request, Response, IRouter } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { User } from "@operium/db";
import { authService } from "../services/auth.service.js";
import { JWT_SECRET } from "../utils/jwtSecret.js";
import { storeAuthCode, consumeAuthCode } from "../lib/oauthStore.js";

const router: IRouter = Router();

// MCP access tokens are long-lived so agents don't re-auth constantly; blocking
// a user still cuts access instantly (resolveUser re-checks on every session).
const TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;

function baseUrl(req: Request): string {
  return process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`;
}

function issueAccessToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function appendQueryParams(url: string, params: Record<string, string>): string {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

function verifyPKCE(verifier: string, challenge: string, method: string): boolean {
  if (method === "S256") {
    const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
    return computed === challenge;
  }
  if (method === "plain") return verifier === challenge;
  return false;
}

// ── Discovery documents ─────────────────────────────────────────────────────

/** GET /.well-known/oauth-authorization-server (RFC 8414) */
export function wellKnownAuthServer(req: Request, res: Response): void {
  const base = baseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp", "openid", "email", "profile"],
  });
}

/** GET /.well-known/oauth-protected-resource (RFC 9728) */
export function protectedResource(req: Request, res: Response): void {
  const base = baseUrl(req);
  res.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  });
}

// ── Dynamic client registration (RFC 7591) ──────────────────────────────────

router.post("/register", (req: Request, res: Response) => {
  const clientId = "operium-" + Date.now();
  res.status(201).json({
    client_id: clientId,
    client_name: req.body?.client_name || "MCP Client",
    redirect_uris: req.body?.redirect_uris || [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
});

// ── Consent / sign-in page ──────────────────────────────────────────────────

function renderPage(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Operium</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#050505;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.wrap{width:100%;max-width:440px}
.logo-row{display:flex;align-items:center;gap:10px;margin-bottom:32px}
.logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#0d59f2,#3b82f6);border-radius:9px;display:flex;align-items:center;justify-content:center}
.logo-icon svg{width:20px;height:20px;fill:#fff}
.logo-text{font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px}
h1{font-size:26px;font-weight:700;color:#fff;letter-spacing:-.4px;margin-bottom:6px}
.subtitle{font-size:14px;color:#94a3b8;margin-bottom:24px;line-height:1.6}
.client-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:5px 10px;margin-bottom:20px}
.client-badge::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e}
.scope-box{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:24px}
.scope-item{font-size:13px;color:#94a3b8;padding:4px 0;display:flex;align-items:center;gap:8px}
.social-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
.btn-social{display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 16px;background:#121212;border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none}
.btn-social:hover{background:#1a1a1a;border-color:rgba(255,255,255,0.2)}
.divider{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.divider-line{flex:1;height:1px;background:rgba(255,255,255,0.08)}
.divider-text{font-size:12px;color:#64748b;white-space:nowrap;text-transform:uppercase;letter-spacing:.05em}
.field{margin-bottom:18px}
label{display:block;font-size:13px;font-weight:500;color:#cbd5e1;margin-bottom:7px}
input[type=email],input[type=password]{width:100%;padding:11px 14px;background:#121212;border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-size:14px;outline:none}
input:focus{border-color:#0d59f2;box-shadow:0 0 0 3px rgba(13,89,242,0.15)}
.btn-primary,.btn-allow{width:100%;padding:12px;background:#0d59f2;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer}
.btn-primary:hover,.btn-allow:hover{background:#0b4fd4}
.btn-cancel{display:block;text-align:center;margin-top:14px;font-size:13px;color:#64748b;text-decoration:none}
.error{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:11px 14px;margin-bottom:18px;font-size:13px;color:#f87171}
</style></head><body><div class="wrap">
  <div class="logo-row"><div class="logo-icon">
    <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
  </div><span class="logo-text">Operium</span></div>
  ${content}
</div></body></html>`;
}

const scopeBox = `
  <div class="scope-box">
    <div class="scope-item">✓ Read &amp; manage your notes, spaces, and memory</div>
    <div class="scope-item">✓ Recall your past sessions &amp; conventions</div>
    <div class="scope-item">✓ Use Operium MCP tools on your behalf</div>
  </div>`;

// ── GET /authorize — show sign-in / consent ──────────────────────────────────

router.get("/authorize", (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const { client_id, redirect_uri, response_type, code_challenge, code_challenge_method, state, scope } = q;

  if (!client_id || !redirect_uri || response_type !== "code" || !code_challenge) {
    res.status(400).send(renderPage("Error", `<div class="error">Invalid OAuth request — missing required parameters.</div>`));
    return;
  }

  const safeParams = new URLSearchParams({
    client_id, redirect_uri, response_type, code_challenge,
    code_challenge_method: code_challenge_method || "S256",
    scope: scope || "mcp",
    ...(state ? { state } : {}),
  });
  const cancelUrl = appendQueryParams(redirect_uri, { error: "access_denied", ...(state ? { state } : {}) });
  const loginError = q.login_error ? `<div class="error">${escapeHtml(q.login_error)}</div>` : "";

  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
  };

  res.send(renderPage("Sign in to authorize", `
    <h1>Sign in to authorize</h1>
    <p class="subtitle"><span class="client-badge">${escapeHtml(client_id)}</span> wants access to your Operium account.</p>
    ${loginError}
    <div class="social-grid">
      <a href="/oauth/github?${safeParams.toString()}" class="btn-social">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.38.6.1.82-.26.82-.57v-2c-3.34.72-4.04-1.6-4.04-1.6-.54-1.37-1.33-1.74-1.33-1.74-1.08-.74.08-.73.08-.73 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.48 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.3-1.23 3.3-1.23.64 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.3c0 .32.22.68.82.56C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
        GitHub
      </a>
      <button id="googleBtn" class="btn-social" type="button">
        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Google
      </button>
    </div>
    <div class="divider"><div class="divider-line"></div><span class="divider-text">Or continue with email</span><div class="divider-line"></div></div>
    <form method="POST" action="/authorize?${safeParams.toString()}">
      <input type="hidden" name="action" value="login_and_approve">
      <div class="field"><label for="email">Email address</label><input type="email" id="email" name="email" required autocomplete="email" placeholder="name@company.com"></div>
      <div class="field"><label for="password">Password</label><input type="password" id="password" name="password" required autocomplete="current-password" placeholder="••••••••"></div>
      ${scopeBox}
      <button type="submit" class="btn-primary">Sign in &amp; Allow Access</button>
    </form>
    <form method="POST" action="/authorize?${safeParams.toString()}" id="googleForm" style="display:none">
      <input type="hidden" name="action" value="firebase_id_token">
      <input type="hidden" name="idToken" id="googleIdToken">
    </form>
    <a href="${escapeHtml(cancelUrl)}" class="btn-cancel">Cancel — go back</a>
    <script type="module">
      import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js';
      import { getAuth, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js';
      const app = initializeApp(${JSON.stringify(firebaseConfig)});
      const auth = getAuth(app);
      document.getElementById('googleBtn').addEventListener('click', async () => {
        const btn = document.getElementById('googleBtn');
        try {
          btn.disabled = true; btn.textContent = 'Signing in…';
          const result = await signInWithPopup(auth, new GoogleAuthProvider());
          document.getElementById('googleIdToken').value = await result.user.getIdToken();
          document.getElementById('googleForm').submit();
        } catch (err) { console.error(err); btn.disabled = false; btn.textContent = 'Google — try again'; }
      });
    </script>
  `));
});

// ── POST /authorize — verify login, issue auth code ──────────────────────────

router.post("/authorize", async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string>;
    const { client_id, redirect_uri, code_challenge, code_challenge_method, state, scope } = q;
    const { action, email, password, idToken } = req.body || {};

    if (!client_id || !redirect_uri || !code_challenge) {
      res.status(400).send("Invalid request parameters");
      return;
    }

    const backToLogin = (msg: string) => {
      const p = new URLSearchParams({ ...q, login_error: msg });
      res.redirect(`/authorize?${p.toString()}`);
    };

    let userId: string | null = null;

    try {
      if (action === "login_and_approve") {
        if (!email || !password) return backToLogin("Email and password are required");
        const user = await authService.loginUser(email, password);
        userId = (user as any)._id.toString();
      } else if (action === "firebase_id_token") {
        if (!idToken) return backToLogin("Google sign-in failed");
        const user = await authService.googleLogin(idToken);
        userId = (user as any)._id.toString();
      } else {
        res.redirect(appendQueryParams(redirect_uri, { error: "access_denied", ...(state ? { state } : {}) }));
        return;
      }
    } catch (err: any) {
      return backToLogin(err?.message || "Sign-in failed");
    }

    const code = storeAuthCode({
      userId: userId!,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || "S256",
      scope: scope || "mcp",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    res.redirect(appendQueryParams(redirect_uri, { code, ...(state ? { state } : {}) }));
  } catch (err) {
    console.error("[OAuth] POST /authorize error:", err);
    res.status(500).send("Internal server error");
  }
});

// ── POST /token — exchange code (+PKCE) for an access token ───────────────────

router.post("/token", async (req: Request, res: Response) => {
  try {
    const { grant_type, code, redirect_uri, code_verifier, client_id } = (req.body || {}) as Record<string, string>;

    if (grant_type !== "authorization_code") {
      res.status(400).json({ error: "unsupported_grant_type" });
      return;
    }
    if (!code || !code_verifier || !redirect_uri) {
      res.status(400).json({ error: "invalid_request", error_description: "Missing code, code_verifier, or redirect_uri" });
      return;
    }

    const pending = consumeAuthCode(code);
    if (!pending) {
      res.status(400).json({ error: "invalid_grant", error_description: "Authorization code expired or invalid" });
      return;
    }
    if (pending.redirectUri !== redirect_uri) {
      res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
      return;
    }
    if (client_id && pending.clientId !== client_id) {
      res.status(400).json({ error: "invalid_grant", error_description: "client_id mismatch" });
      return;
    }
    if (!verifyPKCE(code_verifier, pending.codeChallenge, pending.codeChallengeMethod)) {
      res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
      return;
    }

    // Re-check the account is still active before minting a long-lived token.
    const user = await User.findById(pending.userId).select("isBlocked").lean() as any;
    if (!user || user.isBlocked) {
      res.status(400).json({ error: "invalid_grant", error_description: "Account not found or blocked" });
      return;
    }

    res.json({
      access_token: issueAccessToken(pending.userId),
      token_type: "Bearer",
      expires_in: TOKEN_TTL_SECONDS,
      scope: pending.scope,
    });
  } catch (err) {
    console.error("[OAuth] POST /token error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// ── GitHub sign-in for the consent page ──────────────────────────────────────

router.get("/oauth/github", (req: Request, res: Response) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    res.status(500).send(renderPage("Error", `<div class="error">GitHub OAuth is not configured on this server.</div>`));
    return;
  }
  const q = req.query as Record<string, string>;
  if (!q.client_id || !q.redirect_uri || !q.code_challenge) {
    res.status(400).send(renderPage("Error", `<div class="error">Invalid OAuth request parameters.</div>`));
    return;
  }
  // Carry the MCP params through GitHub's state so we can resume in the callback.
  const mcpState = Buffer.from(JSON.stringify(q)).toString("base64url");
  const callbackUri = `${baseUrl(req)}/oauth/github/callback`;
  res.redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUri)}&scope=user:email&state=${mcpState}`);
});

router.get("/oauth/github/callback", async (req: Request, res: Response) => {
  try {
    const { code, state: mcpStateB64 } = req.query as Record<string, string>;
    if (!code || !mcpStateB64) {
      res.status(400).send(renderPage("Error", `<div class="error">GitHub callback is missing parameters.</div>`));
      return;
    }
    let mcp: Record<string, string>;
    try { mcp = JSON.parse(Buffer.from(mcpStateB64, "base64url").toString("utf8")); }
    catch { res.status(400).send(renderPage("Error", `<div class="error">Invalid state parameter.</div>`)); return; }

    const backToLogin = (msg: string) => {
      const p = new URLSearchParams({ ...mcp, login_error: msg });
      res.redirect(`/authorize?${p.toString()}`);
    };

    let userId: string;
    try {
      const user = await authService.githubLogin(code);
      userId = (user as any)._id.toString();
    } catch (err: any) {
      return backToLogin(err?.message || "GitHub authentication failed");
    }

    const authCode = storeAuthCode({
      userId,
      clientId: mcp.client_id!,
      redirectUri: mcp.redirect_uri!,
      codeChallenge: mcp.code_challenge!,
      codeChallengeMethod: mcp.code_challenge_method || "S256",
      scope: mcp.scope || "mcp",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    res.redirect(appendQueryParams(mcp.redirect_uri!, { code: authCode, ...(mcp.state ? { state: mcp.state } : {}) }));
  } catch (err) {
    console.error("[OAuth] GitHub callback error:", err);
    res.status(500).send(renderPage("Error", `<div class="error">An unexpected error occurred.</div>`));
  }
});

export const oauthRouter = router;
