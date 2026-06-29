import { Request, Response } from "express";
import { authService } from "../services/auth.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

export class AuthController {
  private setCookie(res: Response, token: string) {
    res.cookie("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86400 * 1000,
      path: "/",
    });
  }

  async registerUser(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json(new ApiError(400, "Email and password are required"));
        return;
      }

      await authService.registerUser(email, password);
      // Do NOT set cookie yet, they need to verify OTP.
      res.status(201).json(new ApiResponse(201, null, "Verification code sent to your email."));
    } catch (error: any) {
      console.error("Register Error:", error);
      const statusCode = error.message === "User already exists" ? 400 : 500;
      res.status(statusCode).json(new ApiError(statusCode, error.message));
    }
  }

  async verifyOtp(req: Request, res: Response): Promise<void> {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        res.status(400).json(new ApiError(400, "Email and OTP are required"));
        return;
      }

      const user = await authService.verifyEmailOtp(email, otp);
      const token = authService.generateToken(user);

      this.setCookie(res, token);
      res.status(200).json(new ApiResponse(200, {
        userId: user.id,
        token,
        name:   (user as any).name   || null,
        avatar: (user as any).avatar || null,
        email:  user.email,
      }, "Email verified successfully"));
    } catch (error: any) {
      console.error("OTP Verify Error:", error);
      res.status(400).json(new ApiError(400, error.message));
    }
  }

  async resendOtp(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json(new ApiError(400, "Email is required"));
        return;
      }

      await authService.generateAndSendOTP(email);
      res.status(200).json(new ApiResponse(200, null, "A new code has been sent to your email."));
    } catch (error: any) {
      console.error("Resend OTP Error:", error);
      res.status(500).json(new ApiError(500, error.message));
    }
  }

  async loginUser(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json(new ApiError(400, "Email and password are required"));
        return;
      }

      const user = await authService.loginUser(email, password);
      
      if (!user.isVerified) {
        res.status(403).json(new ApiError(403, "Please verify your email before logging in."));
        return;
      }

      const token = authService.generateToken(user);

      this.setCookie(res, token);
      res.status(200).json(new ApiResponse(200, {
        userId: user.id,
        token,
        name:   (user as any).name   || null,
        avatar: (user as any).avatar || null,
        email:  user.email,
      }, "Login successful"));
    } catch (error: any) {
      console.error("Login Error:", error);
      const statusCode = error.message.includes("Invalid credentials") ? 401 : 500;
      res.status(statusCode).json(new ApiError(statusCode, error.message));
    }
  }

  logoutUser(_req: Request, res: Response): void {
    res.cookie("auth-token", "", {
      httpOnly: true,
      expires: new Date(0),
      path: "/",
    });
    res.status(200).json(new ApiResponse(200, null, "Logged out successfully"));
  }

  async googleOAuth(req: Request, res: Response): Promise<void> {
    try {
      const { idToken } = req.body;
      if (!idToken) {
        res.status(400).json(new ApiError(400, "Missing Firebase ID token"));
        return;
      }

      const user = await authService.googleLogin(idToken);
      const token = authService.generateToken(user);

      this.setCookie(res, token);
      res.status(200).json(new ApiResponse(200, {
        userId: user.id,
        token,
        name:   (user as any).name   || null,
        avatar: (user as any).avatar || null,
        email:  user.email,
      }, "Google login successful"));
    } catch (error: any) {
      console.error("Google Auth Error:", error?.message || error);
      res.status(401).json(new ApiError(401, error?.message || "Google authentication failed"));
    }
  }

  githubOAuth(_req: Request, res: Response): void {
    if (!GITHUB_CLIENT_ID) {
      res.status(500).json(new ApiError(500, "GitHub Client ID not configured"));
      return;
    }

    const redirectUri = `${APP_URL}/api/auth/github/callback`;
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=user:email`;
    res.redirect(githubAuthUrl);
  }

  async githubOAuthCallback(req: Request, res: Response): Promise<void> {
    try {
      const code = req.query.code as string;
      if (!code) {
        res.redirect(`${APP_URL}/login?error=Invalid GitHub OAuth Code`);
        return;
      }

      const user = await authService.githubLogin(code);
      const token = authService.generateToken(user);
      
      this.setCookie(res, token);
      res.redirect(APP_URL);
    } catch (error: any) {
      console.error("GitHub OAuth Error:", error);
      res.redirect(`${APP_URL}/login?error=${encodeURIComponent(error.message)}`);
    }
  }
}

export const authController = new AuthController();

// ── Standalone profile handlers (require auth) ────────────────────────────────

import { requireAuth } from "../middlewares/auth.middleware.js";
import { User } from "@operium/db";

const handle = (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response) => {
    try { await fn(req, res); }
    catch (err: any) {
      res.status(err instanceof ApiError ? err.statusCode : 500)
        .json(err instanceof ApiError ? err.toJSON() : { message: err.message });
    }
  };

export const getMe = [requireAuth, handle(async (req, res) => {
  const uid  = (req as any).user.userId as string;
  const user = await User.findById(uid).select("-passwordHash -githubToken -azureDevOpsToken +geminiApiKey").lean() as any;
  if (!user) { res.status(404).json(new ApiError(404, "User not found").toJSON()); return; }
  // Return only a preview of the key, never the raw value
  const geminiApiKey = user.geminiApiKey
    ? `${String(user.geminiApiKey).slice(0, 7)}...${String(user.geminiApiKey).slice(-4)}`
    : undefined;
  const { geminiApiKey: _raw, ...safeUser } = user;
  res.json(new ApiResponse(200, { ...safeUser, geminiApiKey }, "User profile"));
})];

export const updateMe = [requireAuth, handle(async (req, res) => {
  const uid = (req as any).user.userId as string;
  const { name, avatar, geminiApiKey } = req.body as Record<string, string | undefined>;

  const upd: any = {};
  if (name         !== undefined) upd.name         = name;
  if (avatar       !== undefined) upd.avatar       = avatar;
  if (geminiApiKey !== undefined) {
    if (geminiApiKey === "") {
      upd.$unset = { geminiApiKey: "" };
    } else {
      upd.geminiApiKey = geminiApiKey;
    }
  }

  const user = await User.findByIdAndUpdate(uid, upd, { new: true })
    .select("-passwordHash -githubToken -azureDevOpsToken -geminiApiKey")
    .lean();
  if (!user) { res.status(404).json(new ApiError(404, "User not found").toJSON()); return; }
  res.json(new ApiResponse(200, user, "Profile updated"));
})];
