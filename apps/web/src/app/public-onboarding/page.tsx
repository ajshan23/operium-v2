"use client";

import { useState, useEffect } from "react";
import { orgApi } from "@/api/org.api";
import { setActiveOrgId } from "@/lib/org";

// ─── Icons ──────────────────────────────────────────────────────────────────
function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 0.75s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PublicOnboardingPage() {
  const [view, setView] = useState<"choice" | "create" | "join">("choice");
  const [orgName, setOrgName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setIsLoaded(true);
    // Deep-link from an invite email: /public-onboarding?invite=<token>
    const params = new URLSearchParams(window.location.search);
    const t = params.get("invite");
    if (t) { setInviteToken(t); setView("join"); }
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const res: any = await orgApi.createOrg(orgName.trim());
      const orgId = res?.data?._id ?? res?.data?.id;
      if (orgId) setActiveOrgId(String(orgId));
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "Failed to create organization");
      setIsLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteToken.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const res: any = await orgApi.acceptInvite(inviteToken.trim());
      const orgId = res?.data?._id ?? res?.data?.id;
      if (orgId) setActiveOrgId(String(orgId));
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "This invite is invalid or has expired");
      setIsLoading(false);
    }
  }

  function goBack() {
    setView("choice");
    setError("");
  }

  return (
    <div className="min-h-screen bg-surface-page text-content-primary flex flex-col font-sans relative overflow-hidden selection:bg-status-info/30">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Background */}
      <div className="absolute inset-0 z-0 opacity-20 db-radial-grid" />
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-status-info/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Nav */}
      <header className={`p-8 flex justify-between items-center z-10 transition-all duration-1000 ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-accent text-content-inverse font-bold flex items-center justify-center rounded-xl shadow-soft">O</div>
          <span className="font-semibold text-xl tracking-tight">Operium</span>
        </div>
        <a href="/login" className="text-sm font-medium text-content-muted hover:text-content-primary transition-colors flex items-center gap-2 px-4 py-2 rounded-full hover:bg-surface-raised border border-transparent hover:border-line-subtle">
          Sign out
        </a>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center p-6 z-10 w-full">
        <div className={`w-full max-w-3xl transition-all duration-700 delay-100 ${isLoaded ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-95"}`}>
          <div className="relative rounded-[2rem] border border-line-subtle bg-surface-panel/90 backdrop-blur-2xl shadow-soft overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-accent-text/30 to-transparent" />

            <div className="p-10 md:p-14">

              {/* CHOICE */}
              {view === "choice" && (
                <div>
                  <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-status-info/10 border border-status-info/20 text-status-info text-xs font-semibold uppercase tracking-widest mb-6">
                      Step 1 of 2
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-content-primary">
                      Welcome to Operium
                    </h1>
                    <p className="text-content-muted text-lg max-w-md mx-auto">
                      Set up your workspace. Create a new organization or join an existing one.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5 max-w-2xl mx-auto">
                    <button
                      onClick={() => { setView("create"); setError(""); }}
                      className="group relative flex flex-col p-8 rounded-2xl bg-surface-panel/60 border border-line-subtle hover:border-status-info/50 transition-all duration-300 text-left overflow-hidden hover:shadow-[0_0_30px_rgba(59,130,246,0.1)]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-14 h-14 rounded-2xl bg-surface-raised border border-line-subtle flex items-center justify-center text-status-info mb-6 group-hover:scale-105 transition-transform duration-300">
                        <PlusIcon />
                      </div>
                      <h3 className="text-xl font-semibold mb-3 text-content-primary">Create Organization</h3>
                      <p className="text-content-muted text-sm leading-relaxed mb-6">
                        Start a new workspace for your company. You will be the owner.
                      </p>
                      <div className="mt-auto w-8 h-8 rounded-full border border-line-subtle flex items-center justify-center text-content-muted group-hover:bg-blue-500 group-hover:text-content-inverse group-hover:border-blue-500 transition-all duration-300">
                        <ArrowRightIcon />
                      </div>
                    </button>

                    <button
                      onClick={() => { setView("join"); setError(""); }}
                      className="group relative flex flex-col p-8 rounded-2xl bg-surface-panel/60 border border-line-subtle hover:border-accent/50 transition-all duration-300 text-left overflow-hidden hover:shadow-[0_0_30px_rgba(168,85,247,0.1)]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-14 h-14 rounded-2xl bg-surface-raised border border-line-subtle flex items-center justify-center text-accent-text mb-6 group-hover:scale-105 transition-transform duration-300">
                        <UsersIcon />
                      </div>
                      <h3 className="text-xl font-semibold mb-3 text-content-primary">Join Organization</h3>
                      <p className="text-content-muted text-sm leading-relaxed mb-6">
                        Have an invite code? Join an existing workspace and collaborate with your team.
                      </p>
                      <div className="mt-auto w-8 h-8 rounded-full border border-line-subtle flex items-center justify-center text-content-muted group-hover:bg-purple-500 group-hover:text-content-inverse group-hover:border-purple-500 transition-all duration-300">
                        <ArrowRightIcon />
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* CREATE */}
              {view === "create" && (
                <div className="max-w-md mx-auto">
                  <button onClick={goBack} className="group text-sm font-medium text-content-muted hover:text-content-primary mb-10 flex items-center gap-2 transition-colors">
                    <ArrowLeftIcon /> Back
                  </button>

                  <div className="w-16 h-16 rounded-3xl bg-surface-raised border border-line-subtle flex items-center justify-center text-status-info mb-8">
                    <PlusIcon />
                  </div>

                  <h2 className="text-3xl font-bold tracking-tight mb-3">Name your workspace</h2>
                  <p className="text-content-muted mb-10 text-lg leading-relaxed">
                    This is the name of your company or team. You can change it later in settings.
                  </p>

                  {error && (
                    <p className="text-status-error text-sm mb-6 px-4 py-3 bg-status-error/10 border border-status-error/25 rounded-xl">{error}</p>
                  )}

                  <form className="space-y-6" onSubmit={handleCreate}>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-content-secondary pl-1">Organization Name</label>
                      <input
                        type="text"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="e.g. Acme Corp"
                        disabled={isLoading}
                        className="w-full bg-surface-raised border border-line-control rounded-2xl px-5 py-4 text-content-primary placeholder:text-content-muted focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)] transition-colors text-base disabled:opacity-50"
                        autoFocus
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!orgName.trim() || isLoading}
                      className="w-full bg-accent text-content-inverse hover:bg-accent-hover disabled:bg-surface-hover disabled:text-content-muted disabled:cursor-not-allowed font-semibold rounded-2xl px-5 py-4 transition-colors flex justify-center items-center gap-2 text-base"
                    >
                      {isLoading ? <><SpinnerIcon /><span>Creating…</span></> : <><span>Create Organization</span><ArrowRightIcon /></>}
                    </button>
                  </form>
                </div>
              )}

              {/* JOIN */}
              {view === "join" && (
                <div className="max-w-md mx-auto">
                  <button onClick={goBack} className="group text-sm font-medium text-content-muted hover:text-content-primary mb-10 flex items-center gap-2 transition-colors">
                    <ArrowLeftIcon /> Back
                  </button>

                  <div className="w-16 h-16 rounded-3xl bg-surface-raised border border-line-subtle flex items-center justify-center text-accent-text mb-8">
                    <UsersIcon />
                  </div>

                  <h2 className="text-3xl font-bold tracking-tight mb-3">Join a workspace</h2>
                  <p className="text-content-muted mb-10 text-lg leading-relaxed">
                    Paste the invite link (or token) sent to your email. Invites are tied to your address and expire after 7 days.
                  </p>

                  {error && (
                    <p className="text-status-error text-sm mb-6 px-4 py-3 bg-status-error/10 border border-status-error/25 rounded-xl">{error}</p>
                  )}

                  <form className="space-y-6" onSubmit={handleJoin}>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-content-secondary pl-1">Invite token</label>
                      <input
                        type="text"
                        value={inviteToken}
                        onChange={(e) => {
                          // Accept a pasted full link too — pull the token out of it
                          const v = e.target.value.trim();
                          const m = v.match(/[?&]invite=([^&\s]+)/);
                          setInviteToken(m ? m[1]! : v);
                        }}
                        placeholder="Paste your invite link or token"
                        disabled={isLoading}
                        className="w-full bg-surface-raised border border-line-control rounded-2xl px-5 py-4 text-content-primary placeholder:text-content-muted focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)] transition-colors text-base font-mono disabled:opacity-50"
                        autoFocus
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!inviteToken.trim() || isLoading}
                      className="w-full bg-accent hover:bg-accent-hover disabled:bg-surface-hover disabled:text-content-muted disabled:cursor-not-allowed font-semibold text-content-inverse rounded-2xl px-5 py-4 transition-colors flex justify-center items-center gap-2 text-base disabled:shadow-none"
                    >
                      {isLoading ? <><SpinnerIcon /><span>Joining…</span></> : <><span>Join Organization</span><ArrowRightIcon /></>}
                    </button>
                  </form>
                </div>
              )}

            </div>
          </div>

          <p className="text-center text-content-muted text-sm mt-8">
            Need help? <a href="#" className="text-content-muted hover:text-content-primary underline underline-offset-4 decoration-gray-600 transition-colors">Contact Support</a>
          </p>
        </div>
      </main>
    </div>
  );
}
