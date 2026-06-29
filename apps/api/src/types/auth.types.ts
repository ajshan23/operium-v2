

export interface CreateUserDTO {
  email: string;
  name?: string;
  avatar?: string;
  passwordHash?: string;
  authProvider: "email" | "google" | "github";
  googleId?: string;
  githubId?: string;
  isSuperUser?: boolean;
  isBlocked?: boolean;
  isVerified?: boolean;
}

export interface AuthResponse {
  success: boolean;
  userId?: string;
  error?: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  isSuperUser: boolean;
}

export interface OAuthLoginDTO {
  idToken?: string;
  code?: string;
}
