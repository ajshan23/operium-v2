import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-do-not-use-in-prod";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password"];
// Publicly viewable content — no auth, no logged-in redirect
const OPEN_PATHS = ["/shared"];
const ONBOARDING_PATH = "/public-onboarding";

async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public content (e.g. shared notes) — always accessible
  if (OPEN_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Auth pages — redirect to dashboard if already logged in
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const token = req.cookies.get("auth-token")?.value;
    const isAuthenticated = token ? await verifyToken(token) : false;
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  const token = req.cookies.get("auth-token")?.value;
  const isAuthenticated = token ? await verifyToken(token) : false;

  // Onboarding requires auth
  if (pathname === ONBOARDING_PATH) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // All other routes require auth — redirect to login if not
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files, AND backend API proxy routes
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
