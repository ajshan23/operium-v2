"use client";

import { authApi } from "@/api/auth.api";
import { orgApi } from "@/api/org.api";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

// ─── Icons ──────────────────────────────────────────────────────────────────

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function TriangleAlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 0.75s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

async function redirectAfterAuth() {
  try {
    const res = await orgApi.getOrgs();
    const orgs = res?.data ?? [];
    window.location.href = orgs.length > 0 ? "/" : "/public-onboarding";
  } catch {
    window.location.href = "/public-onboarding";
  }
}

export default function SignupPage() {
  const [step, setStep] = useState<"register" | "otp">("register");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"github" | "google" | null>(null);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; otp?: string; form?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Full name is required";
    if (!email) next.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Invalid email format";
    if (!password) next.password = "Password is required";
    else if (password.length < 8) next.password = "Password must be at least 8 characters";
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setIsLoading(true);

    try {
      await authApi.register(name, email, password);
      setStep("otp");
      setIsLoading(false);
    } catch (err: any) {
      setErrors({ form: err.message });
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim() || otp.length !== 6) {
      setErrors({ otp: "Please enter a valid 6-digit code" });
      return;
    }
    setErrors({});
    setIsLoading(true);

    try {
      await authApi.verifyOtp(email, otp);
      await redirectAfterAuth();
    } catch (err: any) {
      setErrors({ form: err.message });
      setIsLoading(false);
    }
  }

  async function handleOAuth(provider: "github" | "google") {
    setOauthLoading(provider);

    if (provider === "github") {
      window.location.href = authApi.getGithubLoginUrl();
      return;
    }

    if (provider === "google") {
      try {
        const { auth } = await import("@/lib/firebase");
        const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
        const providerObj = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, providerObj);
        const idToken = await result.user.getIdToken();

        await authApi.googleLogin(idToken);
        await redirectAfterAuth();
      } catch (error: any) {
        console.error("Google login error", error);
        setErrors({ form: error.message });
        setOauthLoading(null);
      }
    }
  }

  return (
    <>
      {/* Inline keyframes — avoids @tailwind dependency for animation */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="login-root">

        {/* ── LEFT — image panel ─────────────────────────────────── */}
        <div className="login-left">
          <Image
            src="/auth-bg.png"
            alt="Neural network visualization — Operium persistent AI memory"
            fill
            sizes="50vw"
            priority
            style={{ objectFit: "cover", objectPosition: "center" }}
          />
          {/* Dark vignette overlays */}
          <div className="login-left-vignette-top" />
          <div className="login-left-vignette-bottom" />
          {/* Tagline */}
          <p className="login-left-tagline">
            Start building with<br />persistent AI memory.
          </p>
        </div>

        {/* ── RIGHT — form panel ─────────────────────────────────── */}
        <div className="login-right">
          {/* Ambient glow blob */}
          <div className="login-glow" />

          <div className="login-form-wrap">

            {/* Logo */}
            <Image
              src="/image.png"
              alt="Operium"
              width={42}
              height={42}
              className="login-logo-mark"
              priority
            />

            {/* Heading */}
            <h1 className="login-heading">
              {step === "register" ? "Create your account" : "Check your email"}
            </h1>
            {step === "otp" && (
              <p className="text-gray-400 text-sm mb-6">
                We sent a 6-digit verification code to <strong>{email}</strong>
              </p>
            )}

            {/* Form-level error alert */}
            {errors.form && (
              <div className="login-alert" role="alert">
                <span className="login-alert-icon"><AlertIcon /></span>
                <div>
                  <p className="login-alert-title">{step === "register" ? "Registration failed" : "Verification failed"}</p>
                  <p className="login-alert-body">{errors.form}</p>
                </div>
              </div>
            )}

            {step === "register" && (
              <form onSubmit={handleSubmit} noValidate className="login-form">

                {/* Name */}
                <div className="lf-group">
                  <label htmlFor="name" className="lf-label">Full name</label>
                  <div className="lf-input-wrap">
                    <input
                      id="name"
                      type="text"
                      autoComplete="name"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isLoading}
                      className={`lf-input${errors.name ? " lf-input--err" : ""}`}
                    />
                    {errors.name && (
                      <span className="lf-input-icon lf-input-icon--err">
                        <TriangleAlertIcon />
                      </span>
                    )}
                  </div>
                  {errors.name && <p className="lf-err-msg">{errors.name}</p>}
                </div>

                {/* Email */}
                <div className="lf-group">
                  <label htmlFor="email" className="lf-label">Email address</label>
                  <div className="lf-input-wrap">
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      className={`lf-input${errors.email ? " lf-input--err" : ""}`}
                    />
                    {errors.email && (
                      <span className="lf-input-icon lf-input-icon--err">
                        <TriangleAlertIcon />
                      </span>
                    )}
                  </div>
                  {errors.email && <p className="lf-err-msg">{errors.email}</p>}
                </div>

                {/* Password */}
                <div className="lf-group">
                  <label htmlFor="password" className="lf-label">Password</label>
                  <div className="lf-input-wrap">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className={`lf-input lf-input--icon-right${errors.password ? " lf-input--err" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="lf-eye-btn"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                  {errors.password && <p className="lf-err-msg">{errors.password}</p>}
                </div>

                {/* Terms hint */}
                <p className="lf-footer" style={{ textAlign: "left", fontSize: "12px", marginTop: "4px" }}>
                  By signing up, you agree to our <Link href="/terms" className="lf-link">Terms</Link> and <Link href="/privacy" className="lf-link">Privacy Policy</Link>.
                </p>

                {/* Sign up button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="lf-btn-submit"
                  style={{ marginTop: "8px" }}
                >
                  {isLoading
                    ? <><SpinnerIcon /><span>Creating account…</span></>
                    : "Create account"}
                </button>

              </form>
            )}

            {step === "otp" && (
              <form onSubmit={handleVerifyOtp} noValidate className="login-form">
                <div className="lf-group">
                  <label htmlFor="otp" className="lf-label">6-Digit Code</label>
                  <div className="lf-input-wrap">
                    <input
                      id="otp"
                      type="text"
                      maxLength={6}
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      disabled={isLoading}
                      className={`lf-input tracking-widest text-center text-xl ${errors.otp ? " lf-input--err" : ""}`}
                      autoFocus
                    />
                  </div>
                  {errors.otp && <p className="lf-err-msg">{errors.otp}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otp.length !== 6}
                  className="lf-btn-submit"
                  style={{ marginTop: "8px" }}
                >
                  {isLoading
                    ? <><SpinnerIcon /><span>Verifying…</span></>
                    : "Verify & Continue"}
                </button>
              </form>
            )}

            {step === "register" && (
              <>
                {/* OR divider */}
                <div className="lf-divider">
                  <span className="lf-divider-line" />
                  <span className="lf-divider-text">OR</span>
                  <span className="lf-divider-line" />
                </div>

                {/* OAuth icon buttons */}
                <div className="lf-oauth-row">
                  <button
                    type="button"
                    onClick={() => handleOAuth("github")}
                    disabled={oauthLoading !== null || isLoading}
                    className={`lf-oauth-btn${oauthLoading === "google" ? " lf-oauth-btn--dim" : ""}`}
                    aria-label="Sign up with GitHub"
                  >
                    {oauthLoading === "github" ? <SpinnerIcon /> : <GitHubIcon />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOAuth("google")}
                    disabled={oauthLoading !== null || isLoading}
                    className={`lf-oauth-btn${oauthLoading === "github" ? " lf-oauth-btn--dim" : ""}`}
                    aria-label="Sign up with Google"
                  >
                    {oauthLoading === "google" ? <SpinnerIcon /> : <GoogleIcon />}
                  </button>
                </div>

                {/* Sign in link */}
                <p className="lf-footer">
                  Already have an account?{" "}
                  <Link href="/login" className="lf-link">Sign in</Link>
                </p>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
