import { Router } from "express";
import { authController, getMe, updateMe } from "../controllers/auth.controller.js";

export const authRouter: Router = Router();

authRouter.post("/register", authController.registerUser.bind(authController));
authRouter.post("/verify-otp", authController.verifyOtp.bind(authController));
authRouter.post("/resend-otp", authController.resendOtp.bind(authController));
authRouter.post("/login", authController.loginUser.bind(authController));
authRouter.post("/logout", authController.logoutUser.bind(authController));
authRouter.post("/google", authController.googleOAuth.bind(authController));
authRouter.get("/github", authController.githubOAuth.bind(authController));
authRouter.get("/github/callback", authController.githubOAuthCallback.bind(authController));
authRouter.get("/me",  getMe);
authRouter.put("/me",  updateMe);
