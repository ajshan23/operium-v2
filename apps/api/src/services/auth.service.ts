import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { adminAuth } from "../lib/firebase.js";
import { userRepository } from "../repositories/user.repository.js";
import { IUser, OTP } from "@operium/db";
import { TokenPayload } from "../types/auth.types.js";
import { emailService } from "./email.service.js";
import { JWT_SECRET } from "../utils/jwtSecret.js";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

export class AuthService {
  generateToken(user: IUser): string {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      isSuperUser: user.isSuperUser,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });
  }

  async generateAndSendOTP(email: string): Promise<void> {
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    
    // Clear any existing OTPs for this email to prevent spam
    await OTP.deleteMany({ email });
    
    // Save new OTP
    await OTP.create({ email, otp: otpCode });
    
    // Dispatch via email service
    await emailService.sendOTP(email, otpCode);
  }

  async verifyEmailOtp(email: string, otp: string): Promise<IUser> {
    const otpRecord = await OTP.findOne({ email, otp });
    
    if (!otpRecord) {
      throw new Error("Invalid or expired OTP");
    }

    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error("User not found");
    }

    user.isVerified = true;
    await userRepository.save(user);
    
    // Clean up OTP
    await OTP.deleteMany({ email });

    return user;
  }

  async registerUser(email: string, passwordHash: string): Promise<IUser> {
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error("User already exists");
    }

    const hashedPassword = await bcrypt.hash(passwordHash, 10);
    const user = await userRepository.create({
      email,
      passwordHash: hashedPassword,
      authProvider: "email",
      isBlocked: false,
      isVerified: false, // Must verify via OTP
    });

    await this.generateAndSendOTP(email);
    return user;
  }

  async loginUser(email: string, passwordHash: string): Promise<IUser> {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new Error("Invalid credentials");
    }

    const isMatch = await bcrypt.compare(passwordHash, user.passwordHash);
    if (!isMatch) {
      throw new Error("Invalid credentials");
    }

    if (user.isBlocked) {
      throw new Error("Your account has been blocked. Contact support.");
    }

    return user;
  }

  async googleLogin(idToken: string): Promise<IUser> {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    if (!email) {
      throw new Error("Google account must have an email associated");
    }

    let user = await userRepository.findByGoogleIdOrEmail(uid, email);

    if (!user) {
      user = await userRepository.create({
        email,
        name:         name  || email.split("@")[0],
        avatar:       picture || undefined,
        googleId:     uid,
        authProvider: "google",
        isBlocked:    false,
        isVerified:   true,
      });
    } else {
      // Fill in missing profile fields for existing accounts
      let dirty = false;
      if (!user.googleId) { user.googleId = uid; dirty = true; }
      if (!user.name && name)    { (user as any).name   = name;    dirty = true; }
      if (!user.avatar && picture) { (user as any).avatar = picture; dirty = true; }
      if (dirty) await userRepository.save(user);
    }

    if (user.isBlocked) {
      throw new Error("Your account has been blocked. Contact support.");
    }

    return user;
  }

  async githubLogin(code: string): Promise<IUser> {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      throw new Error("Server Configuration Error");
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = (await tokenResponse.json()) as any;
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error("GitHub Authentication Failed");
    }

    const profileRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userProfile = (await profileRes.json()) as any;

    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userEmails = (await emailsRes.json()) as any[];
    const primaryEmail = userEmails.find((e: any) => e.primary)?.email;

    if (!primaryEmail) {
      throw new Error("GitHub Email Required");
    }

    let user = await userRepository.findByGithubIdOrEmail(
      userProfile.id.toString(),
      primaryEmail
    );

    const ghName   = userProfile.name || userProfile.login || primaryEmail.split("@")[0];
    const ghAvatar = userProfile.avatar_url || undefined;

    if (!user) {
      user = await userRepository.create({
        email:        primaryEmail,
        name:         ghName,
        avatar:       ghAvatar,
        githubId:     userProfile.id.toString(),
        authProvider: "github",
        isBlocked:    false,
        isVerified:   true,
      });
    } else {
      let dirty = false;
      if (!user.githubId) { user.githubId = userProfile.id.toString(); dirty = true; }
      if (!user.name && ghName)     { (user as any).name   = ghName;   dirty = true; }
      if (!user.avatar && ghAvatar) { (user as any).avatar = ghAvatar; dirty = true; }
      if (dirty) await userRepository.save(user);
    }

    if (user.isBlocked) {
      throw new Error("Your account has been blocked. Contact support.");
    }

    return user;
  }
}

export const authService = new AuthService();
