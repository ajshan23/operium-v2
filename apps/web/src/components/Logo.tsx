import React from "react";

export type LogoConcept = "a" | "b" | "c";

interface LogoProps {
  concept?: LogoConcept;
  variant?: "mark" | "full";
  size?: number;
  className?: string;
  showTagline?: boolean;
}

export function Logo({
  concept = "a",
  variant = "mark",
  size = 42,
  className = "",
  showTagline = true,
}: LogoProps) {
  // Concept A: The Synaptic Ring Monogram
  if (concept === "a") {
    if (variant === "mark") {
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`operium-logo-mark ${className}`}
        >
          <defs>
            <linearGradient id="optA-grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="50%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#4338ca" />
            </linearGradient>
            <linearGradient id="optA-grad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <rect width="200" height="200" rx="36" fill="#09090b" />
          <path d="M 100 36 A 64 64 0 1 1 36 100" fill="none" stroke="url(#optA-grad1)" strokeWidth="14" strokeLinecap="round" />
          <path d="M 100 164 A 64 64 0 1 1 164 100" fill="none" stroke="url(#optA-grad2)" strokeWidth="14" strokeLinecap="round" />
          <path d="M 52 70 C 80 70, 80 130, 148 130" fill="none" stroke="#38bdf8" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M 148 70 C 120 70, 120 130, 52 130" fill="none" stroke="#c084fc" strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="100" cy="100" r="7" fill="#ffffff" />
          <circle cx="52" cy="70" r="5" fill="#38bdf8" />
          <circle cx="148" cy="130" r="5" fill="#38bdf8" />
          <circle cx="148" cy="70" r="5" fill="#c084fc" />
          <circle cx="52" cy="130" r="5" fill="#c084fc" />
        </svg>
      );
    }
  }

  // Fallback to full logo lockup
  const width = showTagline ? size * 4.2 : size * 3.4;

  return (
    <div className={`flex items-center gap-3 ${className}`} style={{ height: size }}>
      <Logo concept={concept} variant="mark" size={size} />
      <div className="flex flex-col justify-center">
        <span
          className="font-extrabold tracking-wider text-white leading-none"
          style={{ fontSize: size * 0.42 }}
        >
          OPERIUM
        </span>
        {showTagline && (
          <span
            className="font-semibold tracking-widest text-purple-300 opacity-90 leading-tight mt-0.5"
            style={{ fontSize: size * 0.16 }}
          >
            PERSISTENT AI MEMORY
          </span>
        )}
      </div>
    </div>
  );
}

export default Logo;
