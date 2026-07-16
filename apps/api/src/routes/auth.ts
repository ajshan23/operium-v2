import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authController, getMe, updateMe } from "../controllers/auth.controller.js";

export const authRouter: Router = Router();

// General ceiling for all auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: "Too many requests, try again later", success: false, data: null, errors: [] },
});

// Tight limit for credential/OTP guessing surfaces
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: "Too many attempts, try again later", success: false, data: null, errors: [] },
});

authRouter.use(authLimiter);

authRouter.post("/register", credentialLimiter, authController.registerUser.bind(authController));
authRouter.post("/verify-otp", credentialLimiter, authController.verifyOtp.bind(authController));
authRouter.post("/resend-otp", credentialLimiter, authController.resendOtp.bind(authController));
authRouter.post("/login", credentialLimiter, authController.loginUser.bind(authController));
authRouter.post("/logout", authController.logoutUser.bind(authController));
authRouter.post("/google", authController.googleOAuth.bind(authController));
authRouter.get("/github", authController.githubOAuth.bind(authController));
authRouter.get("/github/callback", authController.githubOAuthCallback.bind(authController));
authRouter.get("/me",  getMe);
authRouter.put("/me",  updateMe);
