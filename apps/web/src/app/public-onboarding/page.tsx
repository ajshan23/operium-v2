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
  const [inviteCode, setInviteCode] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setIsLoaded(true); }, []);

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
    if (!inviteCode.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const res: any = await orgApi.joinOrg(inviteCode.trim());
      const orgId = res?.data?._id ?? res?.data?.id;
      if (orgId) setActiveOrgId(String(orgId));
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "Invalid invite code");
      setIsLoading(false);
    }
  }

  function goBack() {
    setView("choice");
    setError("");
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans relative overflow-hidden selection:bg-blue-500/30">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Background */}
      <div className="absolute inset-0 z-0 opacity-20"
        style={{ backgroundImage: "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen" />

      {/* Nav */}
      <header className={`p-8 flex justify-between items-center z-10 transition-all duration-1000 ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-tr from-white to-gray-300 text-black font-bold flex items-center justify-center rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.2)]">O</div>
          <span className="font-semibold text-xl tracking-tight">Operium</span>
        </div>
        <a href="/login" className="text-sm font-medium text-gray-400 hover:text-white transition-colors flex items-center gap-2 px-4 py-2 rounded-full hover:bg-white/5 border border-transparent hover:border-white/10">
          Sign out
        </a>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center p-6 z-10 w-full">
        <div className={`w-full max-w-3xl transition-all duration-700 delay-100 ${isLoaded ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-95"}`}>
          <div className="relative rounded-[2rem] border border-white/[0.08] bg-[#0A0A0A]/80 backdrop-blur-2xl shadow-2xl overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <div className="p-10 md:p-14">

              {/* CHOICE */}
              {view === "choice" && (
                <div>
                  <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-widest mb-6">
                      Step 1 of 2
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                      Welcome to Operium
                    </h1>
                    <p className="text-gray-400 text-lg max-w-md mx-auto">
                      Set up your workspace. Create a new organization or join an existing one.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5 max-w-2xl mx-auto">
                    <button
                      onClick={() => { setView("create"); setError(""); }}
                      className="group relative flex flex-col p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-blue-500/50 transition-all duration-300 text-left overflow-hidden hover:shadow-[0_0_30px_rgba(59,130,246,0.1)]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border border-white/10 flex items-center justify-center text-blue-400 mb-6 group-hover:scale-110 transition-all duration-300">
                        <PlusIcon />
                      </div>
                      <h3 className="text-xl font-semibold mb-3 text-white">Create Organization</h3>
                      <p className="text-gray-400 text-sm leading-relaxed mb-6">
                        Start a new workspace for your company. You will be the owner.
                      </p>
                      <div className="mt-auto w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-gray-500 group-hover:bg-blue-500 group-hover:text-white group-hover:border-blue-500 transition-all duration-300">
                        <ArrowRightIcon />
                      </div>
                    </button>

                    <button
                      onClick={() => { setView("join"); setError(""); }}
                      className="group relative flex flex-col p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-purple-500/50 transition-all duration-300 text-left overflow-hidden hover:shadow-[0_0_30px_rgba(168,85,247,0.1)]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border border-white/10 flex items-center justify-center text-purple-400 mb-6 group-hover:scale-110 transition-all duration-300">
                        <UsersIcon />
                      </div>
                      <h3 className="text-xl font-semibold mb-3 text-white">Join Organization</h3>
                      <p className="text-gray-400 text-sm leading-relaxed mb-6">
                        Have an invite code? Join an existing workspace and collaborate with your team.
                      </p>
                      <div className="mt-auto w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-gray-500 group-hover:bg-purple-500 group-hover:text-white group-hover:border-purple-500 transition-all duration-300">
                        <ArrowRightIcon />
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* CREATE */}
              {view === "create" && (
                <div className="max-w-md mx-auto">
                  <button onClick={goBack} className="group text-sm font-medium text-gray-400 hover:text-white mb-10 flex items-center gap-2 transition-colors">
                    <ArrowLeftIcon /> Back
                  </button>

                  <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border border-white/10 flex items-center justify-center text-blue-400 mb-8">
                    <PlusIcon />
                  </div>

                  <h2 className="text-3xl font-bold tracking-tight mb-3">Name your workspace</h2>
                  <p className="text-gray-400 mb-10 text-lg leading-relaxed">
                    This is the name of your company or team. You can change it later in settings.
                  </p>

                  {error && (
                    <p className="text-red-400 text-sm mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</p>
                  )}

                  <form className="space-y-6" onSubmit={handleCreate}>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-300 pl-1">Organization Name</label>
                      <input
                        type="text"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="e.g. Acme Corp"
                        disabled={isLoading}
                        className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-lg shadow-inner disabled:opacity-50"
                        autoFocus
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!orgName.trim() || isLoading}
                      className="w-full bg-white text-black hover:bg-gray-100 disabled:bg-white/10 disabled:text-gray-500 disabled:cursor-not-allowed font-semibold rounded-2xl px-5 py-4 transition-all flex justify-center items-center gap-2 text-lg"
                    >
                      {isLoading ? <><SpinnerIcon /><span>Creating…</span></> : <><span>Create Organization</span><ArrowRightIcon /></>}
                    </button>
                  </form>
                </div>
              )}

              {/* JOIN */}
              {view === "join" && (
                <div className="max-w-md mx-auto">
                  <button onClick={goBack} className="group text-sm font-medium text-gray-400 hover:text-white mb-10 flex items-center gap-2 transition-colors">
                    <ArrowLeftIcon /> Back
                  </button>

                  <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border border-white/10 flex items-center justify-center text-purple-400 mb-8">
                    <UsersIcon />
                  </div>

                  <h2 className="text-3xl font-bold tracking-tight mb-3">Join a workspace</h2>
                  <p className="text-gray-400 mb-10 text-lg leading-relaxed">
                    Enter the invite code provided by your organization admin.
                  </p>

                  {error && (
                    <p className="text-red-400 text-sm mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</p>
                  )}

                  <form className="space-y-6" onSubmit={handleJoin}>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-300 pl-1">Invite Code</label>
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="OP-XXXX-XXXX"
                        disabled={isLoading}
                        className="w-full bg-black/50 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-lg font-mono tracking-widest uppercase shadow-inner disabled:opacity-50"
                        autoFocus
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!inviteCode.trim() || isLoading}
                      className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-white/10 disabled:text-gray-500 disabled:cursor-not-allowed font-semibold text-white rounded-2xl px-5 py-4 transition-all flex justify-center items-center gap-2 text-lg shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_30px_rgba(147,51,234,0.5)] disabled:shadow-none"
                    >
                      {isLoading ? <><SpinnerIcon /><span>Joining…</span></> : <><span>Join Organization</span><ArrowRightIcon /></>}
                    </button>
                  </form>
                </div>
              )}

            </div>
          </div>

          <p className="text-center text-gray-500 text-sm mt-8">
            Need help? <a href="#" className="text-gray-400 hover:text-white underline underline-offset-4 decoration-gray-600 transition-colors">Contact Support</a>
          </p>
        </div>
      </main>
    </div>
  );
}
