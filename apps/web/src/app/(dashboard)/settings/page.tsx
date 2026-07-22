"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Settings, Database, PenTool, Webhook,
  Sparkles, Clock, Plus, Trash2, Key, Check, Copy, Eye, EyeOff,
  Loader2, AlertTriangle, User, RefreshCw, Bot,
  Users, Mail, LogOut, X, Shield, GitBranch
} from "lucide-react";
import { historyApi } from "@/api/history.api";
import { orgApi } from "@/api/org.api";
import { coworkApi, type CoworkRepoPref } from "@/api/cowork.api";
import { getUser } from "@/lib/auth";
import { getActiveOrgId } from "@/lib/org";
import { MCP_TOOL_NAMES, MCP_TOOL_COUNT, MCP_TOOL_GROUPS } from "@operium/shared";

// Grouped tool list for display; anything not in a group renders under "Other"
// so newly added tools never silently disappear from this screen.
const mcpToolGroups = (() => {
  const grouped = new Set(MCP_TOOL_GROUPS.flatMap(g => g.tools as readonly string[]));
  const other = MCP_TOOL_NAMES.filter(t => !grouped.has(t));
  return other.length ? [...MCP_TOOL_GROUPS, { label: "Other", tools: other }] : MCP_TOOL_GROUPS;
})();

const GithubIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const AzureIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v15.12l-5.624 4.453-10.18-3.58v3.58L3.16 18.283l14.166 1.86V4.18z" />
  </svg>
);

interface GeminiKey { id: string; name: string; keyPreview: string; isActive: boolean; }
interface ExtensionKey { id: string; name: string; keyPreview: string; createdAt: string; }
interface WebhookItem { id: string; name: string; url: string; isActive: boolean; }

function formatSyncDate(d: string | null): string {
  if (!d) return "Never";
  const dt = new Date(d);
  const diff = Date.now() - dt.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SettingsPage() {

  // ── Profile ──────────────────────────────────────────────────────────────
  const [profileName,   setProfileName]   = useState("User");
  const [profileEmail,  setProfileEmail]  = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) return;
    setProfileName(u.name || u.email?.split("@")[0] || "User");
    setProfileEmail(u.email || "");
    setProfileAvatar(u.avatar || null);

    // Load existing Gemini key preview from backend
    const token = typeof window !== "undefined" ? localStorage.getItem("operium_token") : null;
    if (token) {
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          if (d.data?.geminiApiKey) {
            setGeminiKeys([{ id: "saved", name: "Gemini Key", keyPreview: d.data.geminiApiKey as string, isActive: true }]);
          }
          // Preference is shared unless explicitly set to false
          setShareCowork(d.data?.preferences?.shareCoworkByDefault !== false);
        })
        .catch(() => {});
    }
  }, []);

  // ── Integration state (from API) ──────────────────────────────────────
  const [intLoading, setIntLoading] = useState(true);
  const [intError,   setIntError]   = useState<string | null>(null);

  const [githubConnected,  setGithubConnected]  = useState(false);
  const [githubLastSync,   setGithubLastSync]   = useState<string | null>(null);
  const [githubToken,      setGithubToken]      = useState("");
  const [showGithubToken,  setShowGithubToken]  = useState(false);
  const [githubSaving,     setGithubSaving]     = useState(false);
  const [githubError,      setGithubError]      = useState<string | null>(null);
  const [githubSuccess,    setGithubSuccess]    = useState(false);

  const [azureConnected,   setAzureConnected]   = useState(false);
  const [azureOrg,         setAzureOrg]         = useState("");
  const [azureOrgInput,    setAzureOrgInput]    = useState("");
  const [azureToken,       setAzureToken]       = useState("");
  const [showAzureToken,   setShowAzureToken]   = useState(false);
  const [azureLastSync,    setAzureLastSync]    = useState<string | null>(null);
  const [azureSaving,      setAzureSaving]      = useState(false);
  const [azureError,       setAzureError]       = useState<string | null>(null);
  const [azureSuccess,     setAzureSuccess]     = useState(false);

  const [editWindowHours,      setEditWindowHours]      = useState(48);
  const [historySaving,        setHistorySaving]        = useState(false);
  const [historySaveSuccess,   setHistorySaveSuccess]   = useState(false);
  const [historyError,         setHistoryError]         = useState<string | null>(null);

  const [showReplaceGithub,    setShowReplaceGithub]    = useState(false);
  const [showReplaceAzure,     setShowReplaceAzure]     = useState(false);

  // ── Gemini key state ─────────────────────────────────────────────────
  const [geminiKeys,    setGeminiKeys]    = useState<GeminiKey[]>([]);
  const [newKeyName,    setNewKeyName]    = useState("");
  const [newKeyValue,   setNewKeyValue]   = useState("");
  const [showKeyText,   setShowKeyText]   = useState(false);

  const [extensionKeys, setExtensionKeys] = useState<ExtensionKey[]>([]);
  const [newExtName,    setNewExtName]    = useState("");
  const [copiedKeyId,   setCopiedKeyId]   = useState<string | null>(null);

  const [gridSnapping,  setGridSnapping]  = useState(true);
  const [defaultStroke, setDefaultStroke] = useState("#8b5cf6");

  // Cowork sharing preference (default: shared with org)
  const [shareCowork,   setShareCowork]   = useState(true);
  const [shareSaving,   setShareSaving]   = useState(false);

  // Per-repo (project) sharing overrides
  const [repoPrefs,   setRepoPrefs]   = useState<CoworkRepoPref[]>([]);
  const [repoLoading, setRepoLoading] = useState(true);
  const [repoBusy,    setRepoBusy]    = useState<string | null>(null);

  // ── Team / organization management ──
  const [members,     setMembers]     = useState<any[]>([]);
  const [invites,     setInvites]     = useState<any[]>([]);
  const [myRole,      setMyRole]      = useState<string>("member");
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError,   setTeamError]   = useState<string | null>(null);
  // Set only after mount so reading localStorage can't cause a hydration mismatch.
  const [hasOrg,      setHasOrg]      = useState(false);
  const [orgName,     setOrgName]     = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole,  setInviteRole]  = useState<"member" | "admin">("member");
  const [inviteBusy,  setInviteBusy]  = useState(false);
  const [inviteMsg,   setInviteMsg]   = useState<string | null>(null);
  const canManage = myRole === "owner" || myRole === "admin";
  const [exportQuality, setExportQuality] = useState("high");
  const [canvasSaveSuccess, setCanvasSaveSuccess] = useState(false);

  const [webhooks,          setWebhooks]          = useState<WebhookItem[]>([]);
  const [newWebhookName,    setNewWebhookName]    = useState("");
  const [newWebhookUrl,     setNewWebhookUrl]     = useState("");
  const [webhookSaving,     setWebhookSaving]     = useState(false);
  const [webhookSyncing,    setWebhookSyncing]    = useState(false);
  const [webhookMsg,        setWebhookMsg]        = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ── Load integrations ─────────────────────────────────────────────────
  const loadIntegrations = useCallback(async () => {
    setIntLoading(true);
    setIntError(null);
    try {
      const [intRes, customRes] = await Promise.all([
        historyApi.getIntegrations(),
        historyApi.getCustomIntegrations(),
      ]);
      const data = (intRes as any).data;
      setGithubConnected(data.githubConnected);
      setGithubLastSync(data.githubLastSync || null);
      setAzureConnected(data.azureConnected);
      setAzureOrg(data.azureOrg || "");
      setAzureOrgInput(data.azureOrg || "");
      setAzureLastSync(data.azureLastSync || null);
      setEditWindowHours(data.editWindowHours ?? 48);

      const customItems = (customRes as any).data || [];
      setWebhooks(customItems.map((ci: any) => ({
        id:       ci.id,
        name:     ci.name,
        url:      ci.url,
        isActive: ci.isActive ?? true,
      })));
    } catch (err: any) {
      setIntError(err.message || "Failed to load integration settings");
    }
    setIntLoading(false);
  }, []);

  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  // ── GitHub handlers ───────────────────────────────────────────────────
  const handleConnectGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubToken.trim()) return;
    setGithubSaving(true);
    setGithubError(null);
    try {
      await historyApi.updateIntegrations({ githubToken });
      setGithubToken("");
      setGithubSuccess(true);
      setTimeout(() => setGithubSuccess(false), 3000);
      await loadIntegrations();
    } catch (err: any) {
      setGithubError(err.message || "Failed to save GitHub token");
    }
    setGithubSaving(false);
  };

  const handleDisconnectGithub = async () => {
    setGithubSaving(true);
    setGithubError(null);
    try {
      await historyApi.updateIntegrations({ githubToken: "" });
      await loadIntegrations();
    } catch (err: any) {
      setGithubError(err.message || "Failed to disconnect GitHub");
    }
    setGithubSaving(false);
  };

  // ── Azure handlers ────────────────────────────────────────────────────
  const handleConnectAzure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!azureToken.trim() || !azureOrgInput.trim()) return;
    setAzureSaving(true);
    setAzureError(null);
    try {
      await historyApi.updateIntegrations({ azureDevOpsToken: azureToken, azureDevOpsOrg: azureOrgInput });
      setAzureToken("");
      setAzureSuccess(true);
      setTimeout(() => setAzureSuccess(false), 3000);
      await loadIntegrations();
    } catch (err: any) {
      setAzureError(err.message || "Failed to save Azure credentials");
    }
    setAzureSaving(false);
  };

  const handleDisconnectAzure = async () => {
    setAzureSaving(true);
    setAzureError(null);
    try {
      await historyApi.updateIntegrations({ azureDevOpsToken: "", azureDevOpsOrg: "" });
      await loadIntegrations();
    } catch (err: any) {
      setAzureError(err.message || "Failed to disconnect Azure");
    }
    setAzureSaving(false);
  };

  // ── History prefs handler ─────────────────────────────────────────────
  const handleSaveHistoryPrefs = async () => {
    setHistorySaving(true);
    setHistoryError(null);
    try {
      await historyApi.updateIntegrations({ editWindowHours });
      setHistorySaveSuccess(true);
      setTimeout(() => setHistorySaveSuccess(false), 3000);
    } catch (err: any) {
      setHistoryError(err.message || "Failed to save preferences");
    }
    setHistorySaving(false);
  };

  // ── Gemini key handlers ───────────────────────────────────────────────
  const [geminiSaving,  setGeminiSaving]  = useState(false);
  const [geminiSuccess, setGeminiSuccess] = useState(false);
  const [geminiError,   setGeminiError]   = useState<string | null>(null);

  const handleAddGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyValue.trim()) return;
    setGeminiSaving(true);
    setGeminiError(null);
    try {
      await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("operium_token") ?? "" : ""}` },
        body: JSON.stringify({ geminiApiKey: newKeyValue.trim() }),
      });
      setGeminiKeys([{ id: "saved", name: newKeyName || "Gemini Key", keyPreview: `${newKeyValue.slice(0, 7)}...${newKeyValue.slice(-4)}`, isActive: true }]);
      setNewKeyName(""); setNewKeyValue("");
      setGeminiSuccess(true);
      setTimeout(() => setGeminiSuccess(false), 3000);
    } catch (err: any) {
      setGeminiError(err.message ?? "Failed to save Gemini key");
    }
    setGeminiSaving(false);
  };

  const handleGenerateExtKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExtName.trim()) return;
    setExtensionKeys([...extensionKeys, {
      id: `ext-${Date.now()}`,
      name: newExtName,
      keyPreview: `op_ext_live_${Math.random().toString(36).slice(2, 8)}...`,
      createdAt: new Date().toISOString().split("T")[0],
    }]);
    setNewExtName("");
  };

  const handleCopyKey = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const persistWebhooks = async (updated: WebhookItem[]) => {
    setWebhookSaving(true);
    setWebhookMsg(null);
    try {
      await historyApi.saveCustomIntegrations(updated.map(w => ({ name: w.name, url: w.url })));
      setWebhookMsg({ type: "ok", text: "Saved" });
      setTimeout(() => setWebhookMsg(null), 3000);
    } catch (err: any) {
      setWebhookMsg({ type: "err", text: err.message || "Failed to save" });
    }
    setWebhookSaving(false);
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookName.trim() || !newWebhookUrl.trim()) return;
    const updated = [...webhooks, { id: `web-${Date.now()}`, name: newWebhookName, url: newWebhookUrl, isActive: true }];
    setWebhooks(updated);
    setNewWebhookName(""); setNewWebhookUrl("");
    await persistWebhooks(updated);
  };

  const handleDeleteWebhook = async (id: string) => {
    const updated = webhooks.filter(w => w.id !== id);
    setWebhooks(updated);
    await persistWebhooks(updated);
  };

  const handleSyncCustom = async () => {
    setWebhookSyncing(true);
    setWebhookMsg(null);
    try {
      const res = await historyApi.syncCustom();
      const { synced } = (res as any).data;
      setWebhookMsg({ type: "ok", text: `Synced ${synced} item${synced !== 1 ? "s" : ""}` });
      setTimeout(() => setWebhookMsg(null), 4000);
    } catch (err: any) {
      setWebhookMsg({ type: "err", text: err.message || "Sync failed" });
    }
    setWebhookSyncing(false);
  };

  // Persist the cowork sharing preference. Optimistic: flip immediately,
  // revert if the request fails.
  const toggleShareCowork = async () => {
    const next = !shareCowork;
    setShareCowork(next);
    setShareSaving(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("operium_token") : null;
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ shareCoworkByDefault: next }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setShareCowork(!next); // revert
    } finally {
      setShareSaving(false);
    }
  };

  // ── Per-repo sharing ──────────────────────────────────────────────────
  const loadRepos = useCallback(async () => {
    setRepoLoading(true);
    try {
      const res = await coworkApi.listRepos();
      setRepoPrefs(res.data ?? []);
    } catch { /* non-fatal */ }
    setRepoLoading(false);
  }, []);

  useEffect(() => { void loadRepos(); }, [loadRepos]);

  // Toggle a repo's visibility. Optimistic; also re-applies to existing sessions
  // server-side, so the count of shared sessions changes immediately.
  const toggleRepoShare = async (repoKey: string, current: boolean) => {
    const next = !current;
    setRepoBusy(repoKey);
    setRepoPrefs(prev => prev.map(r => r.repoKey === repoKey ? { ...r, shared: next } : r));
    try {
      await coworkApi.setRepoVisibility(repoKey, next);
    } catch {
      setRepoPrefs(prev => prev.map(r => r.repoKey === repoKey ? { ...r, shared: current } : r)); // revert
    } finally {
      setRepoBusy(null);
    }
  };

  // ── Team management ───────────────────────────────────────────────────
  const loadTeam = useCallback(async () => {
    const activeOrgId = getActiveOrgId();
    if (!activeOrgId) { setHasOrg(false); setTeamLoading(false); return; }
    setHasOrg(true);
    setTeamLoading(true);
    setTeamError(null);
    try {
      const res: any = await orgApi.getMembers();
      const list = res?.data ?? [];
      setMembers(list);
      // Resolve the active org's display name (getOrgs populates orgId).
      try {
        const orgsRes: any = await orgApi.getOrgs();
        const mine = (orgsRes?.data ?? []).find(
          (m: any) => String(m.orgId?._id ?? m.orgId) === String(activeOrgId),
        );
        setOrgName(mine?.orgId?.name ?? "");
      } catch { /* non-fatal — heading falls back to "Team" */ }
      const me = getUser();
      const mine = list.find((m: any) => String(m.userId?._id) === String(me?.userId));
      const role = mine?.role ?? "member";
      setMyRole(role);
      if (role === "owner" || role === "admin") {
        try { const ir: any = await orgApi.listInvites(); setInvites(ir?.data ?? []); } catch { /* non-fatal */ }
      }
    } catch (err: any) {
      setTeamError(err.message || "Failed to load team");
    }
    setTeamLoading(false);
  }, []);

  useEffect(() => { void loadTeam(); }, [loadTeam]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteBusy(true); setInviteMsg(null); setTeamError(null);
    try {
      await orgApi.createInvite(inviteEmail.trim(), inviteRole);
      const invited = inviteEmail.trim();
      setInviteEmail("");
      setInviteMsg(`Invite created for ${invited} — use "Link" below to copy & send it, or they'll get an email.`);
      await loadTeam();
    } catch (err: any) {
      setTeamError(err.message || "Failed to send invite");
    }
    setInviteBusy(false);
  };

  const handleRevokeInvite = async (id: string) => {
    setTeamError(null);
    try { await orgApi.revokeInvite(id); await loadTeam(); }
    catch (err: any) { setTeamError(err.message || "Failed to revoke invite"); }
  };

  const handleRemoveMember = async (userId: string, label: string) => {
    if (!window.confirm(`Remove ${label} from the organization? They lose access to shared memory. Their own sessions stay intact.`)) return;
    setTeamError(null);
    try { await orgApi.removeMember(userId); await loadTeam(); }
    catch (err: any) { setTeamError(err.message || "Failed to remove member"); }
  };

  const handleLeaveOrg = async () => {
    if (!window.confirm("Leave this organization? You'll lose access to its shared memory until re-invited.")) return;
    setTeamError(null);
    try { await orgApi.leaveOrg(); window.location.href = "/public-onboarding"; }
    catch (err: any) { setTeamError(err.message || "Failed to leave organization"); }
  };

  // ── Shared UI helpers ─────────────────────────────────────────────────
  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <div onClick={onChange} className={`w-9 h-[22px] rounded-full p-0.5 cursor-pointer transition-colors duration-300 flex items-center ${value ? "bg-[#8b5cf6]" : "bg-[#1e1e24]"}`}>
      <div className={`w-[18px] h-[18px] rounded-full bg-white shadow-md transform transition-transform duration-300 ${value ? "translate-x-[14px]" : "translate-x-0"}`} />
    </div>
  );

  const inputCls = "w-full bg-[#0c0c0f] border border-[#1e1e24] focus:border-[#8b5cf6]/40 rounded-xl px-3.5 py-2 text-[12px] text-[#fafafa] focus:outline-none transition-all placeholder:text-[#55556a]";
  const cardCls  = "bg-[#0c0c0f]/40 border border-[#1e1e24] rounded-2xl p-6 flex flex-col gap-6";

  return (
    <div className="flex-1 bg-[#050505] overflow-y-auto relative select-none">
      <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(139,92,246,0.02),transparent_60%)] rounded-full pointer-events-none blur-3xl" />

      <div className="max-w-4xl mx-auto w-full p-6 md:p-8 flex flex-col gap-8 relative z-10">

        {/* Title */}
        <div>
          <h1 className="text-xl font-bold text-[#fafafa] tracking-tight flex items-center gap-2">
            <Settings className="text-[#8b5cf6]" size={22} />
            <span>Settings</span>
          </h1>
          <p className="text-[12px] text-[#63637a] mt-1">
            Manage your account, integrations, and workspace preferences.
          </p>
        </div>

        {/* Global integration loading error */}
        {intError && (
          <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{intError}</span>
            <button onClick={loadIntegrations} className="ml-auto text-red-300 hover:text-red-200 font-semibold text-[11px]">Retry</button>
          </div>
        )}

        {/* ── 0. PROFILE ── */}
        <div className={cardCls}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-[#8b5cf6]/25 bg-[#8b5cf6]/10 text-[#8b5cf6] flex items-center justify-center shrink-0">
              <User size={16} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white leading-tight">Account</h2>
              <p className="text-[11px] text-[#63637a] mt-0.5">Your logged-in identity.</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 rounded-xl border border-[#1e1e24] bg-[#0c0c0f]/20">
            {profileAvatar
              ? <img src={profileAvatar} alt={profileName} referrerPolicy="no-referrer" className="w-12 h-12 rounded-full border border-[#2a2a35] object-cover shrink-0" />
              : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#6366f1] border border-[#2a2a35] flex items-center justify-center shrink-0">
                  <User size={20} className="text-white" />
                </div>
            }
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-[#fafafa] truncate">{profileName}</p>
              <p className="text-[12px] text-[#63637a] truncate mt-0.5">{profileEmail}</p>
            </div>
          </div>
        </div>

        {/* ── 1. GEMINI AI KEYS ── */}
        <div className={cardCls}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-purple-500/25 bg-purple-500/10 text-[#a855f7] flex items-center justify-center shrink-0">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white leading-tight">Gemini AI Keys</h2>
              <p className="text-[11px] text-[#63637a] mt-0.5">Add your own keys to bypass shared rate limits.</p>
            </div>
          </div>
          <form onSubmit={handleAddGeminiKey} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="text" required value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key label (e.g. Work Key)" className={inputCls} />
            <div className="relative flex items-center">
              <input type={showKeyText ? "text" : "password"} required value={newKeyValue} onChange={e => setNewKeyValue(e.target.value)} placeholder="AIzaSy..." className={`${inputCls} pr-10`} />
              <button type="button" onClick={() => setShowKeyText(!showKeyText)} className="absolute right-3 text-[#55556a] hover:text-[#fafafa] transition-colors">
                {showKeyText ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button type="submit" className="h-[38px] bg-gradient-to-r from-[#7c3aed] to-[#6366f1] text-white text-[12px] font-semibold rounded-xl flex items-center justify-center gap-1.5 hover:opacity-95 transition-all active:scale-[0.98]">
              <Plus size={14} /><span>Add API Key</span>
            </button>
          </form>
          {geminiKeys.length > 0 && (
            <div className="flex flex-col gap-2.5 border-t border-[#1e1e24]/40 pt-4">
              <span className="text-[10px] font-bold text-[#55556a] uppercase tracking-wider">Registered Keys</span>
              <div className="flex flex-col gap-2">
                {geminiKeys.map(key => (
                  <div key={key.id} className="flex items-center justify-between p-3.5 rounded-xl border border-[#1e1e24] bg-[#0c0c0f]/20">
                    <div className="flex items-center gap-3">
                      <div onClick={() => setGeminiKeys(prev => prev.map(k => ({ ...k, isActive: k.id === key.id })))}
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center cursor-pointer transition-all ${key.isActive ? "border-[#8b5cf6] bg-[#8b5cf6]/20" : "border-[#2a2a35] hover:border-[#8b5cf6]"}`}>
                        {key.isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6]" />}
                      </div>
                      <div>
                        <span className="text-[12px] font-bold text-[#fafafa]">{key.name}</span>
                        <p className="text-[10px] font-mono text-[#55556a] mt-0.5">{key.keyPreview}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${key.isActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-[#1e1e24] text-[#63637a]"}`}>
                        {key.isActive ? "Active" : "Standby"}
                      </span>
                      <button onClick={() => setGeminiKeys(prev => prev.filter(k => k.id !== key.id))} className="p-1.5 text-[#55556a] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── MCP SETUP INSTRUCTIONS ── */}
        <div className={cardCls}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C12 2 17 8.5 17 12.5C17 15.26 14.76 17.5 12 17.5C9.24 17.5 7 15.26 7 12.5C7 8.5 12 2 12 2Z"/></svg>
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white leading-tight">MCP Server Setup</h2>
              <p className="text-[11px] text-[#63637a] mt-0.5">Connect Operium to Claude Code, Cursor, or any MCP-compatible AI tool.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-[#0d0b16] rounded-xl border border-[#1e1e24] p-4 space-y-3">
              <p className="text-[12px] font-semibold text-[#fafafa]">Add to your <code className="text-[#8b5cf6] bg-[#8b5cf6]/10 px-1.5 py-0.5 rounded text-[11px]">claude_desktop_config.json</code> or MCP settings:</p>
              <pre className="text-[11px] font-mono text-[#c4b5fd] leading-relaxed overflow-x-auto bg-[#050505] rounded-lg p-3 border border-[#1a1a22]">{`{
  "mcpServers": {
    "operium": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:4000/mcp"],
      "env": {}
    }
  }
}`}</pre>
              <p className="text-[10px] text-[#63637a]">Authentication uses your session token automatically. Make sure Operium API is running on port 4000.</p>
            </div>
            <div className="bg-[#0d0b16] rounded-xl border border-[#1e1e24] p-4">
              <p className="text-[12px] font-semibold text-[#fafafa] mb-3">
                Available MCP Tools
                <span className="ml-2 text-[10px] font-mono text-[#63637a] bg-[#1a1a22] px-1.5 py-0.5 rounded">{MCP_TOOL_COUNT}</span>
              </p>
              <div className="space-y-3">
                {mcpToolGroups.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] font-bold text-[#63637a] uppercase tracking-wider mb-1.5">{group.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.tools.map(tool => (
                        <span key={tool} className="text-[10px] font-mono text-[#8b5cf6] bg-[#8b5cf6]/5 px-2 py-0.5 rounded border border-[#8b5cf6]/10">{tool}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#63637a] mt-3">
                Sessions are repo-aware: agents register every git repo in the workspace at startup, and saved
                sessions, rules, and recall are scoped/boosted by repo. Azure Boards tools read and write live
                work items when a DevOps token is configured below.
              </p>
            </div>
          </div>
        </div>

        {/* ── 2. API INTEGRATIONS (Extension tokens) ── */}
        <div className={cardCls}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-blue-500/25 bg-blue-500/10 text-[#3b82f6] flex items-center justify-center shrink-0">
              <Key size={16} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white leading-tight">API Integrations</h2>
              <p className="text-[11px] text-[#63637a] mt-0.5">Generate tokens to connect external dev tools like the VS Code Extension or CLI.</p>
            </div>
          </div>
          <form onSubmit={handleGenerateExtKey} className="flex gap-3">
            <input type="text" required value={newExtName} onChange={e => setNewExtName(e.target.value)} placeholder="Token label (e.g. VS Code)" className={`flex-1 ${inputCls}`} />
            <button type="submit" className="h-[38px] px-6 bg-[#120e20] border border-[#8b5cf6]/40 hover:border-[#8b5cf6] text-[#8b5cf6] hover:text-white text-[12px] font-semibold rounded-xl transition-all active:scale-[0.98] shrink-0">
              Generate Token
            </button>
          </form>
          {extensionKeys.length > 0 && (
            <div className="flex flex-col gap-2.5 border-t border-[#1e1e24]/40 pt-4">
              <span className="text-[10px] font-bold text-[#55556a] uppercase tracking-wider">Access Tokens</span>
              <div className="flex flex-col gap-2">
                {extensionKeys.map(token => (
                  <div key={token.id} className="flex items-center justify-between p-3.5 rounded-xl border border-[#1e1e24] bg-[#0c0c0f]/20">
                    <div className="min-w-0">
                      <span className="text-[12px] font-bold text-[#fafafa]">{token.name}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-mono text-[#8b5cf6]">{token.keyPreview}</span>
                        <span className="text-[9px] text-[#55556a]">Created: {token.createdAt}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleCopyKey(token.id, token.keyPreview)} className="p-2 bg-[#120e20]/60 border border-[#8b5cf6]/20 text-[#8b5cf6] hover:text-white rounded-lg transition-colors flex items-center gap-1 text-[10px] font-semibold">
                        {copiedKeyId === token.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        <span>{copiedKeyId === token.id ? "Copied" : "Copy"}</span>
                      </button>
                      <button onClick={() => setExtensionKeys(prev => prev.filter(k => k.id !== token.id))} className="p-1.5 text-[#55556a] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── COWORK PRIVACY ── */}
        <div className={cardCls}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-[rgba(var(--accent-rgb),0.25)] bg-[rgba(var(--accent-rgb),0.1)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Bot size={16} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-[var(--text-primary)] leading-tight">Cowork Sharing</h2>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Control whether the AI sessions you save are visible to your team.</p>
            </div>
          </div>
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--s2)]">
            <div className="pr-4">
              <span className="text-[12px] font-bold text-[var(--text-primary)]">Share new sessions with my team</span>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                {shareCowork
                  ? "On — new cowork sessions are added to your organization's shared knowledge base."
                  : "Off — new cowork sessions stay private to you. Existing sessions are unchanged."}
              </p>
            </div>
            <div className={shareSaving ? "opacity-50 pointer-events-none" : ""}>
              <Toggle value={shareCowork} onChange={toggleShareCowork} />
            </div>
          </div>

          {/* Per-repo overrides */}
          <div className="border-t border-[var(--border-subtle)] pt-4">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch size={13} className="text-[var(--text-muted)]" />
              <span className="text-[12px] font-bold text-[var(--text-primary)]">Share by project</span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">
              Override sharing per repository. Turning one off keeps that project&apos;s sessions private — and updates existing ones too. Sessions spanning a private repo stay private.
            </p>

            {repoLoading ? (
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] py-2">
                <Loader2 size={13} className="animate-spin" /> Loading projects…
              </div>
            ) : repoPrefs.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)] py-2">No projects yet — they appear here once you save cowork sessions with a repo.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {repoPrefs.map(r => (
                  <div key={r.repoKey} className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--s2)]">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate" title={r.repoKey}>{r.repoName}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {r.sessionCount} session{r.sessionCount === 1 ? "" : "s"} · {r.shared ? "shared with team" : "private"}
                      </p>
                    </div>
                    <div className={repoBusy === r.repoKey ? "opacity-50 pointer-events-none shrink-0" : "shrink-0"}>
                      <Toggle value={r.shared} onChange={() => toggleRepoShare(r.repoKey, r.shared)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── TEAM / ORGANIZATION ── */}
        {hasOrg && (
        <div className={cardCls}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Users size={16} />
            </div>
            <div className="flex-1">
              <h2 className="text-[14px] font-bold text-[var(--text-primary)] leading-tight">
                {orgName || "Team"}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {canManage ? "Invite teammates and manage who has access to your organization." : "Members of your organization. Contact an owner or admin to invite others."}
              </p>
            </div>
            <button onClick={() => void loadTeam()} disabled={teamLoading}
              className="p-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--s2)] transition-colors disabled:opacity-40">
              <RefreshCw size={13} className={teamLoading ? "animate-spin" : ""} />
            </button>
          </div>

          {teamError && (
            <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
              <AlertTriangle size={13} className="shrink-0" /><span>{teamError}</span>
            </div>
          )}

          {/* Invite form (owner/admin) */}
          {canManage && (
            <form onSubmit={handleInvite} className="flex flex-col gap-2">
              {inviteMsg && <p className="text-[11px] text-emerald-400">{inviteMsg}</p>}
              <div className="flex gap-2">
                <input
                  type="email" value={inviteEmail} onChange={e => { setInviteEmail(e.target.value); setInviteMsg(null); }}
                  placeholder="teammate@company.com" className={`flex-1 ${inputCls}`} disabled={inviteBusy}
                />
                {myRole === "owner" && (
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value as "member" | "admin")}
                    className="bg-[var(--s1)] border border-[var(--border-subtle)] rounded-xl px-3 text-[12px] text-[var(--text-primary)] focus:outline-none cursor-pointer">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
                <button type="submit" disabled={inviteBusy || !inviteEmail.trim()}
                  className="px-4 rounded-xl bg-[var(--accent)] text-white text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-40 transition-opacity">
                  {inviteBusy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                  <span>Invite</span>
                </button>
              </div>
            </form>
          )}

          {/* Member list */}
          <div className="flex flex-col gap-2">
            {teamLoading && members.length === 0 ? (
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-[12px] py-4 justify-center">
                <Loader2 size={14} className="animate-spin" /> Loading team…
              </div>
            ) : members.map(m => {
              const me = getUser();
              const isSelf = String(m.userId?._id) === String(me?.userId);
              const label = m.userId?.name || m.userId?.email || "Member";
              // Owner removes anyone (except last owner, server-enforced); admin removes only members
              const canRemove = !isSelf && (myRole === "owner" ? true : (myRole === "admin" && m.role === "member"));
              return (
                <div key={m._id} className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--s2)]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[var(--s3)] flex items-center justify-center text-[var(--text-secondary)] shrink-0">
                      <User size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                        {label}{isSelf && <span className="text-[var(--text-muted)] font-normal"> (you)</span>}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">{m.userId?.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1 ${
                      m.role === "owner" ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                      : m.role === "admin" ? "bg-[rgba(var(--accent-rgb),0.1)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.2)]"
                      : "bg-[var(--s3)] text-[var(--text-muted)] border border-[var(--border-subtle)]"}`}>
                      {(m.role === "owner" || m.role === "admin") && <Shield size={9} />}{m.role}
                    </span>
                    {canRemove && (
                      <button onClick={() => handleRemoveMember(String(m.userId?._id), label)}
                        title="Remove member"
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pending invites (owner/admin) */}
          {canManage && invites.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Pending Invites ({invites.length})</span>
              {invites.map(inv => (
                <div key={inv._id} className="flex flex-col gap-2 p-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--s1)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Mail size={13} className="text-[var(--text-muted)] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[12px] text-[var(--text-primary)] truncate">{inv.email}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <button onClick={() => handleRevokeInvite(inv._id)} title="Revoke invite"
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                      <X size={14} />
                    </button>
                  </div>

                  {/* Join code + shareable link — for manual sending. They can paste
                      either the code or the link on the join screen after signing up. */}
                  {inv.token && (
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 min-w-0 truncate select-all text-[10px] font-mono text-[var(--text-secondary)] bg-[var(--s2)] border border-[var(--border-subtle)] rounded-md px-2 py-1.5"
                        title="Invite code — they paste this on the join screen">
                        {inv.token}
                      </code>
                      <button
                        onClick={() => handleCopyKey(`${inv._id}:code`, inv.token!)}
                        title="Copy the join code"
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[rgba(var(--accent-rgb),0.1)] transition-colors flex items-center gap-1 text-[10px] font-semibold shrink-0">
                        {copiedKeyId === `${inv._id}:code` ? <><Check size={13} className="text-emerald-400" /> Copied</> : <><Copy size={13} /> Code</>}
                      </button>
                      <button
                        onClick={() => handleCopyKey(`${inv._id}:link`, `${window.location.origin}/public-onboarding?invite=${inv.token}`)}
                        title="Copy the invite link"
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[rgba(var(--accent-rgb),0.1)] transition-colors flex items-center gap-1 text-[10px] font-semibold shrink-0">
                        {copiedKeyId === `${inv._id}:link` ? <><Check size={13} className="text-emerald-400" /> Copied</> : <><Copy size={13} /> Link</>}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Leave org */}
          <div className="pt-1">
            <button onClick={handleLeaveOrg}
              className="text-[11px] font-semibold text-red-400 hover:text-red-300 flex items-center gap-1.5 transition-colors">
              <LogOut size={13} /> Leave this organization
            </button>
          </div>
        </div>
        )}

        {/* ── 3. CANVAS PREFERENCES ── */}
        <div className={cardCls}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <PenTool size={16} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white leading-tight">Canvas Preferences</h2>
              <p className="text-[11px] text-[#63637a] mt-0.5">Customize default settings for drawing whiteboards and visual layouts.</p>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#1e1e24] bg-[#0c0c0f]/20">
              <div>
                <span className="text-[12px] font-bold text-[#fafafa]">Snap to Grid</span>
                <p className="text-[10px] text-[#55556a] mt-0.5">Align whiteboard elements automatically.</p>
              </div>
              <Toggle value={gridSnapping} onChange={() => setGridSnapping(!gridSnapping)} />
            </div>
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#1e1e24] bg-[#0c0c0f]/20">
              <div>
                <span className="text-[12px] font-bold text-[#fafafa]">Default Stroke Color</span>
                <p className="text-[10px] text-[#55556a] mt-0.5">Initial color applied when starting a drawing session.</p>
              </div>
              <div className="flex items-center gap-1.5">
                {["#8b5cf6","#3b82f6","#10b981","#f59e0b","#f43f5e"].map(color => (
                  <div key={color} onClick={() => setDefaultStroke(color)} style={{ backgroundColor: color }}
                    className={`w-6 h-6 rounded-full cursor-pointer transition-all flex items-center justify-center border-2 ${defaultStroke === color ? "border-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.2)]" : "border-transparent opacity-70 hover:opacity-100"}`}>
                    {defaultStroke === color && <Check size={11} className="text-black" strokeWidth={3} />}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#1e1e24] bg-[#0c0c0f]/20">
              <div>
                <span className="text-[12px] font-bold text-[#fafafa]">Export Drawing Resolution</span>
                <p className="text-[10px] text-[#55556a] mt-0.5">File quality settings when downloading canvas whiteboards.</p>
              </div>
              <select value={exportQuality} onChange={e => setExportQuality(e.target.value)} className="h-[32px] px-3 bg-[#0c0c0f] border border-[#1e1e24] rounded-lg text-[11px] font-semibold text-white focus:outline-none cursor-pointer">
                <option value="standard">Standard (1x)</option>
                <option value="high">High Definition (2x)</option>
                <option value="ultra">Ultra-HQ Print (4x)</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end border-t border-[#1e1e24]/40 pt-4 gap-3">
            {canvasSaveSuccess && <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1"><Check size={12} /> Saved</span>}
            <button onClick={() => { setCanvasSaveSuccess(true); setTimeout(() => setCanvasSaveSuccess(false), 2500); }}
              className="h-[36px] px-6 bg-gradient-to-r from-[#7c3aed] to-[#6366f1] text-white text-[12px] font-semibold rounded-xl transition-all">
              Save Preferences
            </button>
          </div>
        </div>

        {/* ── 4. WORK HISTORY PREFERENCES ── */}
        <div className={cardCls}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <Clock size={16} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white leading-tight">Work History Preferences</h2>
              <p className="text-[11px] text-[#63637a] mt-0.5">Set edit/delete restrictions for timeline entries.</p>
            </div>
          </div>

          {intLoading ? (
            <div className="flex items-center gap-2 text-[12px] text-[#55556a]">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-[#1e1e24] bg-[#0c0c0f]/20">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-[#fafafa]">Edit &amp; Delete Window</span>
                <span className="text-[11px] font-mono text-[#8b5cf6] font-semibold">
                  {editWindowHours >= 720 ? "30 days" : editWindowHours >= 168 ? "7 days" : `${editWindowHours}h`}
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {([
                  { label: "2h",      value: 2   },
                  { label: "12h",     value: 12  },
                  { label: "24h",     value: 24  },
                  { label: "48h",     value: 48  },
                  { label: "7 days",  value: 168 },
                  { label: "30 days", value: 720 },
                ] as const).map(preset => (
                  <button key={preset.value} type="button"
                    onClick={() => setEditWindowHours(preset.value)}
                    className={`flex-1 min-w-[56px] h-[30px] text-[11px] font-semibold rounded-lg border transition-all ${
                      editWindowHours === preset.value
                        ? "border-[#8b5cf6] bg-[#8b5cf6]/15 text-[#c4b5fd]"
                        : "border-[#2a2a35] text-[#63637a] hover:border-[#8b5cf6]/40 hover:text-[#a1a1aa]"
                    }`}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <span className="text-[9px] text-[#55556a]">Entries cannot be edited or deleted once this window expires. Default: 48h.</span>
            </div>
          )}

          {historyError && (
            <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex items-center gap-1.5">
              <AlertTriangle size={12} /> {historyError}
            </div>
          )}

          <div className="flex items-center justify-end border-t border-[#1e1e24]/40 pt-4 gap-3">
            {historySaveSuccess && <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1"><Check size={12} /> Saved</span>}
            <button onClick={handleSaveHistoryPrefs} disabled={historySaving || intLoading}
              className="h-[36px] px-6 bg-gradient-to-r from-[#7c3aed] to-[#6366f1] text-white text-[12px] font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2">
              {historySaving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : "Save Preferences"}
            </button>
          </div>
        </div>

        {/* ── 5. GITHUB & AZURE DEVOPS ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* GitHub */}
          <div className="bg-[#0c0c0f]/40 border border-[#1e1e24] rounded-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${githubConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-[#2a2a35] bg-[#141418] text-[#63637a]"}`}>
                <GithubIcon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[13px] font-bold text-white leading-tight">GitHub</h2>
                <p className="text-[10px] text-[#63637a] mt-0.5">
                  {intLoading ? "Loading…" : githubConnected ? `Synced ${formatSyncDate(githubLastSync)}` : "Not connected"}
                </p>
              </div>
              {githubConnected && (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider shrink-0">
                  Connected
                </span>
              )}
            </div>

            {!githubConnected && !intLoading && (
              <form onSubmit={handleConnectGithub} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-bold text-[#55556a] uppercase tracking-wider">Personal Access Token</label>
                  <a href="https://github.com/settings/tokens/new?scopes=repo,read:user" target="_blank" rel="noreferrer"
                    className="text-[9px] text-[#8b5cf6] hover:text-[#c4b5fd] transition-colors">
                    Generate token ↗
                  </a>
                </div>
                <div className="relative flex items-center">
                  <input type={showGithubToken ? "text" : "password"} required value={githubToken} onChange={e => setGithubToken(e.target.value)}
                    placeholder="ghp_..." className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowGithubToken(!showGithubToken)} className="absolute right-3 text-[#55556a] hover:text-[#fafafa]">
                    {showGithubToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[9px] text-[#55556a]">Requires <code className="text-[#8b5cf6]">repo</code> and <code className="text-[#8b5cf6]">read:user</code> scopes.</p>
                {githubError && <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle size={11} />{githubError}</p>}
                {githubSuccess && <p className="text-[10px] text-emerald-400 flex items-center gap-1"><Check size={11} />Connected!</p>}
                <button type="submit" disabled={githubSaving}
                  className="h-[34px] bg-[#120e20] border border-[#8b5cf6]/40 hover:border-[#8b5cf6] text-[#8b5cf6] hover:text-white text-[12px] font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {githubSaving ? <><Loader2 size={13} className="animate-spin" />Connecting…</> : "Connect GitHub"}
                </button>
              </form>
            )}

            {githubConnected && !intLoading && (
              <div className="flex flex-col gap-2">
                {githubError && <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle size={11} />{githubError}</p>}
                <div className="flex items-center gap-2">
                  <button onClick={loadIntegrations} className="flex-1 h-[34px] text-[11px] font-semibold rounded-xl border border-[#2a2a35] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#8b5cf6]/40 transition-all flex items-center justify-center gap-1.5">
                    <RefreshCw size={12} />Re-sync status
                  </button>
                  <button onClick={handleDisconnectGithub} disabled={githubSaving}
                    className="flex-1 h-[34px] text-[11px] font-semibold rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {githubSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                    Disconnect
                  </button>
                </div>
                {!showReplaceGithub ? (
                  <button type="button" onClick={() => setShowReplaceGithub(true)}
                    className="text-[10px] text-[#55556a] hover:text-[#8b5cf6] transition-colors text-left">
                    Replace token →
                  </button>
                ) : (
                  <form onSubmit={async e => { await handleConnectGithub(e); setShowReplaceGithub(false); }} className="flex flex-col gap-2 pt-1 border-t border-[#1e1e24]/40 mt-1">
                    <div className="relative flex items-center">
                      <input type={showGithubToken ? "text" : "password"} required value={githubToken} onChange={e => setGithubToken(e.target.value)}
                        placeholder="New token (replaces existing)" className={`${inputCls} pr-10`} />
                      <button type="button" onClick={() => setShowGithubToken(!showGithubToken)} className="absolute right-3 text-[#55556a] hover:text-[#fafafa]">
                        {showGithubToken ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={githubSaving}
                        className="flex-1 h-[30px] bg-[#120e20] border border-[#8b5cf6]/40 hover:border-[#8b5cf6] text-[#8b5cf6] text-[11px] font-semibold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                        {githubSaving ? <Loader2 size={12} className="animate-spin" /> : "Save new token"}
                      </button>
                      <button type="button" onClick={() => { setShowReplaceGithub(false); setGithubToken(""); }}
                        className="h-[30px] px-3 border border-[#2a2a35] text-[#55556a] hover:text-[#a1a1aa] text-[11px] rounded-lg transition-all">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Azure DevOps */}
          <div className="bg-[#0c0c0f]/40 border border-[#1e1e24] rounded-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${azureConnected ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-[#2a2a35] bg-[#141418] text-[#63637a]"}`}>
                <AzureIcon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[13px] font-bold text-white leading-tight">Azure DevOps</h2>
                <p className="text-[10px] text-[#63637a] mt-0.5">
                  {intLoading ? "Loading…" : azureConnected ? `${azureOrg} · ${formatSyncDate(azureLastSync)}` : "Not connected"}
                </p>
              </div>
              {azureConnected && (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider shrink-0">
                  Connected
                </span>
              )}
            </div>

            {!azureConnected && !intLoading && (
              <form onSubmit={handleConnectAzure} className="flex flex-col gap-2">
                <label className="text-[9px] font-bold text-[#55556a] uppercase tracking-wider">Organization</label>
                <input type="text" required value={azureOrgInput} onChange={e => setAzureOrgInput(e.target.value)}
                  placeholder="my-org (from dev.azure.com/my-org)" className={inputCls} />
                <div className="flex items-center justify-between mt-1">
                  <label className="text-[9px] font-bold text-[#55556a] uppercase tracking-wider">Personal Access Token</label>
                  <a href="https://dev.azure.com/_usersSettings/tokens" target="_blank" rel="noreferrer"
                    className="text-[9px] text-[#8b5cf6] hover:text-[#c4b5fd] transition-colors">
                    Generate token ↗
                  </a>
                </div>
                <div className="relative flex items-center">
                  <input type={showAzureToken ? "text" : "password"} required value={azureToken} onChange={e => setAzureToken(e.target.value)}
                    placeholder="Azure PAT…" className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowAzureToken(!showAzureToken)} className="absolute right-3 text-[#55556a] hover:text-[#fafafa]">
                    {showAzureToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[9px] text-[#55556a]">Requires <code className="text-[#8b5cf6]">Code (Read)</code> and <code className="text-[#8b5cf6]">Work Items (Read)</code> scopes.</p>
                {azureError && <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle size={11} />{azureError}</p>}
                {azureSuccess && <p className="text-[10px] text-emerald-400 flex items-center gap-1"><Check size={11} />Connected!</p>}
                <button type="submit" disabled={azureSaving}
                  className="h-[34px] bg-[#120e20] border border-[#8b5cf6]/40 hover:border-[#8b5cf6] text-[#8b5cf6] hover:text-white text-[12px] font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {azureSaving ? <><Loader2 size={13} className="animate-spin" />Connecting…</> : "Connect Azure DevOps"}
                </button>
              </form>
            )}

            {azureConnected && !intLoading && (
              <div className="flex flex-col gap-2">
                {azureError && <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle size={11} />{azureError}</p>}
                <div className="flex items-center gap-2">
                  <button onClick={loadIntegrations} className="flex-1 h-[34px] text-[11px] font-semibold rounded-xl border border-[#2a2a35] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#8b5cf6]/40 transition-all flex items-center justify-center gap-1.5">
                    <RefreshCw size={12} />Re-sync status
                  </button>
                  <button onClick={handleDisconnectAzure} disabled={azureSaving}
                    className="flex-1 h-[34px] text-[11px] font-semibold rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {azureSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                    Disconnect
                  </button>
                </div>
                {!showReplaceAzure ? (
                  <button type="button" onClick={() => setShowReplaceAzure(true)}
                    className="text-[10px] text-[#55556a] hover:text-[#8b5cf6] transition-colors text-left">
                    Replace token →
                  </button>
                ) : (
                  <form onSubmit={async e => { await handleConnectAzure(e); setShowReplaceAzure(false); }} className="flex flex-col gap-2 pt-1 border-t border-[#1e1e24]/40 mt-1">
                    <input type="text" required value={azureOrgInput} onChange={e => setAzureOrgInput(e.target.value)}
                      placeholder={`Organization (current: ${azureOrg})`} className={inputCls} />
                    <div className="relative flex items-center">
                      <input type={showAzureToken ? "text" : "password"} required value={azureToken} onChange={e => setAzureToken(e.target.value)}
                        placeholder="New PAT (replaces existing)" className={`${inputCls} pr-10`} />
                      <button type="button" onClick={() => setShowAzureToken(!showAzureToken)} className="absolute right-3 text-[#55556a] hover:text-[#fafafa]">
                        {showAzureToken ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={azureSaving}
                        className="flex-1 h-[30px] bg-[#120e20] border border-[#8b5cf6]/40 hover:border-[#8b5cf6] text-[#8b5cf6] text-[11px] font-semibold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                        {azureSaving ? <Loader2 size={12} className="animate-spin" /> : "Save new token"}
                      </button>
                      <button type="button" onClick={() => { setShowReplaceAzure(false); setAzureToken(""); setAzureOrgInput(azureOrg); }}
                        className="h-[30px] px-3 border border-[#2a2a35] text-[#55556a] hover:text-[#a1a1aa] text-[11px] rounded-lg transition-all">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 6. WEBHOOK / CUSTOM API INTEGRATIONS ── */}
        <div className={`${cardCls} mb-8`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Webhook size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-bold text-white leading-tight">Custom API Integrations</h2>
              <p className="text-[11px] text-[#63637a] mt-0.5">Hook generic JSON APIs (Linear, Trello, Jira) to publish updates into the timeline.</p>
            </div>
            {webhooks.length > 0 && (
              <button onClick={handleSyncCustom} disabled={webhookSyncing}
                className="h-[32px] px-3.5 text-[11px] font-semibold border border-[#2a2a35] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#8b5cf6]/40 rounded-xl transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50">
                {webhookSyncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Sync all
              </button>
            )}
          </div>

          {webhookMsg && (
            <div className={`text-[11px] flex items-center gap-1.5 px-3 py-2 rounded-xl border ${
              webhookMsg.type === "ok"
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : "text-red-400 bg-red-500/10 border-red-500/20"
            }`}>
              {webhookMsg.type === "ok" ? <Check size={12} /> : <AlertTriangle size={12} />}
              {webhookMsg.text}
              {webhookSaving && <Loader2 size={11} className="animate-spin ml-1" />}
            </div>
          )}

          <form onSubmit={handleAddWebhook} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="text" required value={newWebhookName} onChange={e => setNewWebhookName(e.target.value)} placeholder="Service name (e.g. Jira Board)" className={inputCls} />
            <input type="url" required value={newWebhookUrl} onChange={e => setNewWebhookUrl(e.target.value)} placeholder="https://api.example.com/data" className={inputCls} />
            <button type="submit" disabled={webhookSaving}
              className="h-[38px] bg-[#120e20] border border-[#8b5cf6]/40 hover:border-[#8b5cf6] text-[#8b5cf6] hover:text-white text-[12px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50">
              <Plus size={14} /><span>Register</span>
            </button>
          </form>

          {webhooks.length > 0 && (
            <div className="flex flex-col gap-2.5 border-t border-[#1e1e24]/40 pt-4">
              <span className="text-[10px] font-bold text-[#55556a] uppercase tracking-wider">Registered Integrations</span>
              <div className="flex flex-col gap-2">
                {webhooks.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3.5 rounded-xl border border-[#1e1e24] bg-[#0c0c0f]/20">
                    <div className="min-w-0 pr-4">
                      <span className="text-[12px] font-bold text-[#fafafa]">{item.name}</span>
                      <p className="text-[10px] font-mono text-[#55556a] truncate mt-0.5">{item.url}</p>
                    </div>
                    <button onClick={() => handleDeleteWebhook(item.id)} className="p-1.5 text-[#55556a] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
