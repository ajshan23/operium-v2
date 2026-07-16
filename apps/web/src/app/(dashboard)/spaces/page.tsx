"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Folder, User, Users, Plus, Search, FileText, Trash2, Edit2,
  Eye, X, BookOpen, Clock, Tag, Check, Star, Loader2, AlertTriangle,
  Share2, Copy, Globe,
} from "lucide-react";
import TipTapEditor from "./TipTapEditor";
import { spacesApi, notesApi } from "@/api/notes.api";
import type { Space, Note } from "@/api/notes.api";

// ── Icon helpers ──────────────────────────────────────────────────────────────

const SPACE_ICONS = [
  { id: "folder",   Icon: Folder, color: "text-amber-500" },
  { id: "personal", Icon: User,   color: "text-[#8b5cf6]" },
  { id: "team",     Icon: Users,  color: "text-[#3b82f6]" },
] as const;

function SpaceIcon({ icon, size = 15 }: { icon?: string; size?: number }) {
  const found = SPACE_ICONS.find(i => i.id === icon);
  const { Icon, color } = found ?? { Icon: Folder, color: "text-amber-500" };
  return <Icon size={size} className={color} />;
}

// ── Markdown preview (same renderer as before) ────────────────────────────────

function renderMarkdown(text: string) {
  if (!text.trim()) return <p className="text-[#55556a] italic">No content yet.</p>;
  return text.split("\n").map((line, idx) => {
    if (line.startsWith("# "))
      return <h1 key={idx} className="text-[22px] font-extrabold text-[#fafafa] tracking-tight mt-5 mb-3 border-b border-[#1a1a22] pb-1">{line.slice(2)}</h1>;
    if (line.startsWith("## "))
      return <h2 key={idx} className="text-[17px] font-bold text-[#fafafa] mt-4 mb-2">{line.slice(3)}</h2>;
    if (line.startsWith("### "))
      return <h3 key={idx} className="text-[14px] font-bold text-[#e1e1e6] mt-3 mb-1.5">{line.slice(4)}</h3>;
    if (line.startsWith("- [x] ") || line.startsWith("- [ ] ")) {
      const checked = line.startsWith("- [x] ");
      return (
        <div key={idx} className="flex items-center gap-2 my-1">
          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-[#22c55e]/20 border-[#22c55e] text-[#22c55e]" : "border-[#2a2a35] bg-[#141418]"}`}>
            {checked && <Check size={9} strokeWidth={3} />}
          </div>
          <span className={`text-[13px] ${checked ? "text-[#55556a] line-through" : "text-[#a1a1aa]"}`}>{line.slice(checked ? 6 : 6)}</span>
        </div>
      );
    }
    if (line.startsWith("- "))
      return <li key={idx} className="text-[13px] text-[#a1a1aa] list-disc pl-1 ml-5 my-0.5">{line.slice(2)}</li>;
    if (line.trim() === "")
      return <div key={idx} className="h-3" />;
    return <p key={idx} className="text-[13px] text-[#a1a1aa] leading-relaxed mb-1.5 whitespace-pre-wrap">{line}</p>;
  });
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function SpacesPage() {
  // ── API data ──
  const [spaces,        setSpaces]        = useState<Space[]>([]);
  const [notes,         setNotes]         = useState<Note[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string>("");
  const [activeNoteId,  setActiveNoteId]  = useState<string>("");

  // ── Loading / error ──
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [notesLoading,  setNotesLoading]  = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [saving,        setSaving]        = useState(false);

  // ── UI state ──
  const [searchQuery,   setSearchQuery]   = useState("");
  const [isEditMode,    setIsEditMode]    = useState(true);
  const [tagInput,      setTagInput]      = useState("");

  // ── Sharing ──
  const [shareOpen,  setShareOpen]  = useState(false);
  const [shareBusy,  setShareBusy]  = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // ── New Space modal ──
  const [showNewSpaceModal, setShowNewSpaceModal] = useState(false);
  const [newSpaceName,      setNewSpaceName]      = useState("");
  const [newSpaceDesc,      setNewSpaceDesc]      = useState("");
  const [newSpaceIcon,      setNewSpaceIcon]      = useState("folder");
  const [spaceCreating,     setSpaceCreating]     = useState(false);

  // ── Delete confirmation modal ──
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "space" | "note";
    id: string;
    name: string;
    noteCount?: number;
    noteNames?: string[];
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Note content (local draft while editing) ──
  const [draftContent, setDraftContent] = useState("");
  const [draftTitle,   setDraftTitle]   = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ────────────────────────────────────────────────────────────────────────────
  // Load spaces on mount

  const loadSpaces = useCallback(async () => {
    setSpacesLoading(true);
    setError(null);
    try {
      const res = await spacesApi.list();
      const list = (res as any).data as Space[];
      setSpaces(list);
      if (list.length > 0 && !activeSpaceId) {
        setActiveSpaceId(list[0]._id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load spaces");
    }
    setSpacesLoading(false);
  }, [activeSpaceId]);

  useEffect(() => { loadSpaces(); }, []);

  // Load notes when active space changes
  const loadNotes = useCallback(async (spaceId: string) => {
    if (!spaceId) return;
    setNotesLoading(true);
    try {
      const res = await notesApi.list(spaceId);
      const list = (res as any).data as Note[];
      setNotes(list);
      if (list.length > 0) {
        setActiveNoteId(list[0]._id);
      } else {
        setActiveNoteId("");
        setDraftContent("");
        setDraftTitle("");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load notes");
    }
    setNotesLoading(false);
  }, []);

  useEffect(() => {
    if (activeSpaceId) loadNotes(activeSpaceId);
  }, [activeSpaceId]);

  // Populate draft when active note changes
  useEffect(() => {
    const note = notes.find(n => n._id === activeNoteId);
    if (note) {
      setDraftTitle(note.title ?? "");
      setDraftContent(note.content ?? note.preview ?? "");
    }
  }, [activeNoteId, notes]);

  // Close the share panel when switching notes
  useEffect(() => {
    setShareOpen(false);
    setLinkCopied(false);
  }, [activeNoteId]);

  // ────────────────────────────────────────────────────────────────────────────
  // Derived

  const activeSpace = spaces.find(s => s._id === activeSpaceId);
  const filteredNotes = notes.filter(n =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (n.preview ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );
  const activeNote = notes.find(n => n._id === activeNoteId) ?? null;

  // ────────────────────────────────────────────────────────────────────────────
  // Auto-save draft

  const autoSave = useCallback(async (title: string, content: string, noteId: string) => {
    if (!noteId) return;
    setSaving(true);
    try {
      const res = await notesApi.update(noteId, { title, content });
      const updated = (res as any).data as Note;
      setNotes(prev => prev.map(n => n._id === noteId ? { ...n, ...updated, content } : n));
    } catch { /* ignore auto-save errors */ }
    setSaving(false);
  }, []);

  const scheduleAutoSave = (title: string, content: string, noteId: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autoSave(title, content, noteId), 1500);
  };

  const handleContentChange = (content: string) => {
    setDraftContent(content);
    // Auto-detect title from first # heading
    let title = draftTitle;
    const firstLine = content.split("\n")[0];
    if (firstLine.startsWith("# ")) title = firstLine.slice(2).trim();
    if (title !== draftTitle) setDraftTitle(title);
    scheduleAutoSave(title, content, activeNoteId);
  };

  const handleTitleChange = (title: string) => {
    setDraftTitle(title);
    scheduleAutoSave(title, draftContent, activeNoteId);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Spaces

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpaceName.trim()) return;
    setSpaceCreating(true);
    try {
      const res = await spacesApi.create({ name: newSpaceName, description: newSpaceDesc, icon: newSpaceIcon });
      const space = (res as any).data as Space;
      setSpaces(prev => [space, ...prev]);
      setActiveSpaceId(space._id);
      setNewSpaceName(""); setNewSpaceDesc(""); setNewSpaceIcon("folder");
      setShowNewSpaceModal(false);
    } catch (err: any) {
      setError(err.message || "Failed to create space");
    }
    setSpaceCreating(false);
  };

  const handleDeleteSpace = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (spaces.length <= 1) return;
    const space = spaces.find(s => s._id === id);
    if (!space) return;
    const spaceNotes = notes.filter(n => n.spaceId === id);
    setDeleteConfirm({
      type:      "space",
      id,
      name:      space.name,
      noteCount: spaceNotes.length,
      noteNames: spaceNotes.map(n => n.title || "Untitled"),
    });
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Notes

  const handleCreateNote = async () => {
    if (!activeSpaceId) return;
    try {
      const res = await notesApi.create({
        spaceId: activeSpaceId,
        title:   "Untitled Note",
        content: "# Untitled Note\n\nStart writing your note here...",
      });
      const note = (res as any).data as Note;
      setNotes(prev => [note, ...prev]);
      setActiveNoteId(note._id);
      setIsEditMode(true);
    } catch (err: any) {
      setError(err.message || "Failed to create note");
    }
  };

  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const note = notes.find(n => n._id === id);
    if (!note) return;
    setDeleteConfirm({ type: "note", id, name: note.title || "Untitled" });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm || deleting) return;
    setDeleting(true);
    try {
      if (deleteConfirm.type === "space") {
        await spacesApi.delete(deleteConfirm.id);
        const remaining = spaces.filter(s => s._id !== deleteConfirm.id);
        setSpaces(remaining);
        setNotes(prev => prev.filter(n => n.spaceId !== deleteConfirm.id));
        if (activeSpaceId === deleteConfirm.id && remaining.length > 0) setActiveSpaceId(remaining[0]._id);
      } else {
        await notesApi.delete(deleteConfirm.id);
        const remaining = notes.filter(n => n._id !== deleteConfirm.id);
        setNotes(remaining);
        if (activeNoteId === deleteConfirm.id) {
          const inSpace = remaining.filter(n => n.spaceId === activeSpaceId);
          setActiveNoteId(inSpace[0]?._id ?? "");
        }
      }
      setDeleteConfirm(null);
    } catch (err: any) {
      setError(err.message || "Failed to delete");
    }
    setDeleting(false);
  };

  const handleToggleStar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeNote) return;
    try {
      const res = await notesApi.toggleStar(activeNote._id);
      const { isStarred } = (res as any).data;
      setNotes(prev => prev.map(n => n._id === activeNote._id ? { ...n, isStarred } : n));
    } catch { /* ignore */ }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Sharing

  const shareUrl = activeNote?.shareId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/shared/${activeNote.shareId}`
    : "";

  const copyShareLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* clipboard unavailable — the link is still visible to select */ }
  };

  const handleSetSharing = async (isShared: boolean) => {
    if (!activeNote || shareBusy) return;
    setShareBusy(true);
    try {
      const res = await notesApi.setSharing(activeNote._id, isShared);
      const { isShared: nowShared, shareId } = (res as any).data;
      setNotes(prev => prev.map(n =>
        n._id === activeNote._id ? { ...n, isShared: nowShared, shareId: shareId ?? n.shareId } : n
      ));
      if (nowShared && shareId) {
        await copyShareLink(`${window.location.origin}/shared/${shareId}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to update sharing");
    }
    setShareBusy(false);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Tags

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNote || !tagInput.trim()) return;
    const tag = tagInput.trim();
    const tags = [...(activeNote.tags ?? [])];
    if (tags.includes(tag)) { setTagInput(""); return; }
    tags.push(tag);
    setTagInput("");
    setNotes(prev => prev.map(n => n._id === activeNote._id ? { ...n, tags } : n));
    await notesApi.update(activeNote._id, { tags }).catch(() => {});
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!activeNote) return;
    const tags = (activeNote.tags ?? []).filter(t => t !== tagToRemove);
    setNotes(prev => prev.map(n => n._id === activeNote._id ? { ...n, tags } : n));
    await notesApi.update(activeNote._id, { tags }).catch(() => {});
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Render

  return (
    <div className="flex h-full w-full overflow-hidden relative">

      {/* ── COLUMN 1: SPACES SIDEBAR ── */}
      <div className="w-[260px] border-r border-[#1a1a22] bg-[#070709] flex flex-col shrink-0 overflow-y-auto select-none">
        <div className="p-4 border-b border-[#1a1a22]">
          <button onClick={() => setShowNewSpaceModal(true)}
            className="w-full h-[40px] px-4 rounded-xl border border-[#2a2a35] hover:border-[#8b5cf6]/50 bg-[#120e20]/20 hover:bg-[#120e20]/40 text-[13px] font-semibold text-[#fafafa] flex items-center justify-between transition-all duration-300 group">
            <span>New Space</span>
            <Plus size={16} className="text-[#8b5cf6] group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-1.5 flex-1">
          <span className="text-[10px] font-bold text-[#63637a] tracking-wider uppercase px-2 mb-2 block">Spaces</span>

          {spacesLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-[#55556a] px-2 py-3">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : spaces.length === 0 ? (
            <div className="text-[11px] text-[#55556a] px-2 py-4 text-center">
              <Folder size={20} className="mx-auto mb-2 stroke-1" />
              <p>No spaces yet. Create one above.</p>
            </div>
          ) : (
            spaces.map(space => {
              const isActive = space._id === activeSpaceId;
              return (
                <div key={space._id}
                  onClick={() => { setActiveSpaceId(space._id); setSearchQuery(""); }}
                  className={`w-full h-[44px] px-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all group ${
                    isActive
                      ? "bg-[#120e20]/60 border-[#8b5cf6]/45 text-[#fafafa] shadow-[0_2px_12px_rgba(139,92,246,0.12)]"
                      : "border-transparent hover:border-[#1e1e24] hover:bg-[#141418]/40 text-[#63637a] hover:text-[#fafafa]"
                  }`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <SpaceIcon icon={space.icon} />
                    <div className="flex flex-col items-start min-w-0">
                      <span className="text-[13px] font-semibold truncate leading-none">{space.name}</span>
                      {space.description && (
                        <span className="text-[9px] text-[#55556a] truncate mt-0.5 max-w-[150px]">{space.description}</span>
                      )}
                    </div>
                  </div>
                  {spaces.length > 1 && (
                    <button onClick={(e) => handleDeleteSpace(space._id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 hover:bg-red-500/10 rounded transition-all shrink-0">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── COLUMN 2: NOTES LIST ── */}
      <div className="w-[300px] border-r border-[#1a1a22] bg-[#050505] flex flex-col shrink-0 overflow-hidden select-none">
        <div className="p-4 border-b border-[#1a1a22] flex items-center justify-between shrink-0">
          <div className="min-w-0 pr-2">
            <h3 className="text-[14px] font-extrabold text-[#fafafa] truncate">{activeSpace?.name ?? "Notes"}</h3>
            <span className="text-[10px] text-[#63637a]">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
          </div>
          <button onClick={handleCreateNote} disabled={!activeSpaceId}
            className="w-8 h-8 rounded-xl bg-[#120e20]/60 border border-[#8b5cf6]/40 hover:border-[#8b5cf6]/80 flex items-center justify-center text-[#8b5cf6] hover:text-white transition-all shadow-sm shrink-0 disabled:opacity-40">
            <Plus size={15} />
          </button>
        </div>

        <div className="p-3 border-b border-[#1a1a22]/50 shrink-0">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#55556a] group-focus-within:text-[#8b5cf6] transition-colors" size={13} />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full h-[32px] bg-[#0c0c0f]/80 border border-[#1e1e24] focus:border-[#8b5cf6]/40 rounded-lg pl-8 pr-3 text-[12px] text-[#fafafa] placeholder:text-[#55556a] focus:outline-none transition-all" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {notesLoading ? (
            <div className="flex items-center justify-center gap-2 text-[11px] text-[#55556a] py-10">
              <Loader2 size={13} className="animate-spin" /> Loading notes…
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#55556a] text-center px-4">
              <BookOpen size={24} className="stroke-1 mb-2" />
              <p className="text-[11px]">{searchQuery ? "No matches." : "No notes in this space yet."}</p>
            </div>
          ) : (
            filteredNotes.map(note => {
              const isActive = note._id === activeNoteId;
              return (
                <div key={note._id} onClick={() => setActiveNoteId(note._id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col gap-1.5 relative group ${
                    isActive
                      ? "bg-[#120e20]/40 border-[#8b5cf6]/40 shadow-[0_2px_12px_rgba(139,92,246,0.06)]"
                      : "bg-[#0c0c0f]/40 border-[#1e1e24] hover:border-[#2a2a35] hover:bg-[#0c0c0f]/75"
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-bold text-[#fafafa] line-clamp-1 truncate">{note.title || "Untitled"}</span>
                    <div className="flex items-center gap-1 shrink-0 -mt-0.5 opacity-0 group-hover:opacity-100 transition-all">
                      {note.isShared && <Globe size={10} className="text-[#22c55e]" />}
                      {note.isStarred && <Star size={10} className="text-amber-400 fill-amber-400" />}
                      <button onClick={(e) => handleDeleteNote(note._id, e)}
                        className="p-1 text-[#55556a] hover:text-red-400 hover:bg-red-500/10 rounded transition-all">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#63637a] line-clamp-2 leading-relaxed">
                    {note.preview?.replace(/^#\s*/gm, "").trim() || "Empty note"}
                  </p>
                  <div className="flex items-center justify-between text-[9px] text-[#55556a] mt-0.5 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock size={9} />{new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                    {note.tags?.[0] && (
                      <span className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#a855f7] border border-[#2a2a35]/40">{note.tags[0]}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── COLUMN 3: NOTE EDITOR / PREVIEW ── */}
      <div className="flex-1 bg-[#050505] flex flex-col overflow-hidden relative">
        <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(139,92,246,0.02),transparent_60%)] rounded-full pointer-events-none blur-3xl" />

        {activeNote ? (
          <>
            {/* Toolbar */}
            <div className="h-[52px] border-b border-[#1a1a22] px-6 flex items-center justify-between bg-[#050505] shrink-0 z-20 relative">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#55556a] uppercase">Active:</span>
                <span className="text-[11px] font-mono text-[#8b5cf6] truncate max-w-[200px]">{activeNote.title || "Untitled"}</span>
                {saving && <Loader2 size={11} className="animate-spin text-[#55556a] ml-1" />}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleToggleStar}
                  className={`h-[28px] px-2.5 rounded-lg text-[11px] border flex items-center gap-1.5 transition-all ${
                    activeNote.isStarred
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                      : "border-transparent text-[#63637a] hover:text-amber-400 hover:border-amber-500/30"
                  }`}>
                  <Star size={11} className={activeNote.isStarred ? "fill-amber-400" : ""} />
                </button>
                <button onClick={() => setShareOpen(o => !o)}
                  title={activeNote.isShared ? "Shared — manage link" : "Share this note"}
                  className={`h-[28px] px-2.5 rounded-lg text-[11px] border flex items-center gap-1.5 transition-all ${
                    activeNote.isShared
                      ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]"
                      : "border-transparent text-[#63637a] hover:text-[#8b5cf6] hover:border-[#8b5cf6]/30"
                  }`}>
                  <Share2 size={11} />
                  {activeNote.isShared && <span className="font-semibold">Shared</span>}
                </button>
                <button onClick={() => setIsEditMode(true)}
                  className={`h-[28px] px-3.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
                    isEditMode ? "bg-[#1d1630] border border-[#8b5cf6]/40 text-[#8b5cf6]" : "border border-transparent text-[#63637a] hover:text-[#fafafa]"
                  }`}>
                  <Edit2 size={11} /><span>Edit</span>
                </button>
                <button onClick={() => setIsEditMode(false)}
                  className={`h-[28px] px-3.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
                    !isEditMode ? "bg-[#1d1630] border border-[#8b5cf6]/40 text-[#8b5cf6]" : "border border-transparent text-[#63637a] hover:text-[#fafafa]"
                  }`}>
                  <Eye size={11} /><span>Preview</span>
                </button>
              </div>

              {/* Share panel */}
              {shareOpen && (
                <div className="absolute right-6 top-[50px] w-[340px] bg-[#0c0c0f] border border-[#2a2a35] rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.6),0_0_20px_rgba(139,92,246,0.08)] z-30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Globe size={13} className={activeNote.isShared ? "text-[#22c55e]" : "text-[#63637a]"} />
                      <span className="text-[12px] font-bold text-[#fafafa]">Share note</span>
                    </div>
                    <button onClick={() => setShareOpen(false)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[#63637a] hover:text-[#fafafa] hover:bg-[#1a1a22] transition-colors">
                      <X size={12} />
                    </button>
                  </div>

                  {activeNote.isShared && activeNote.shareId ? (
                    <>
                      <p className="text-[11px] text-[#63637a] mb-2.5">
                        Anyone with this link can view a read-only copy of this note.
                      </p>
                      <div className="flex items-center gap-2 mb-3">
                        <input readOnly value={shareUrl} onFocus={e => e.currentTarget.select()}
                          className="flex-1 h-[32px] bg-[#141418] border border-[#1e1e24] rounded-lg px-2.5 text-[11px] text-[#a1a1aa] font-mono focus:outline-none focus:border-[#8b5cf6]/40 min-w-0" />
                        <button onClick={() => copyShareLink(shareUrl)}
                          className={`h-[32px] px-3 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition-all shrink-0 ${
                            linkCopied
                              ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]"
                              : "border-[#2a2a35] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#8b5cf6]/40"
                          }`}>
                          {linkCopied ? <Check size={11} /> : <Copy size={11} />}
                          {linkCopied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <button onClick={() => handleSetSharing(false)} disabled={shareBusy}
                        className="w-full h-[32px] rounded-lg border border-red-500/25 text-red-400 hover:bg-red-500/10 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50">
                        {shareBusy ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                        Stop sharing
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] text-[#63637a] mb-3">
                        Create a public read-only link for this note. The link is copied to your clipboard automatically.
                      </p>
                      <button onClick={() => handleSetSharing(true)} disabled={shareBusy}
                        className="w-full h-[34px] rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#6366f1] text-white text-[12px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60">
                        {shareBusy ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}
                        Create share link
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col z-10 relative">

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
                <Tag size={12} className="text-[#55556a]" />
                {activeNote.tags?.map(tag => (
                  <span key={tag} className="h-5 px-2 rounded bg-[#120e20]/60 border border-[#8b5cf6]/25 text-[#a855f7] text-[10px] font-medium flex items-center gap-1">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-400 transition-colors ml-0.5 font-bold">×</button>
                  </span>
                ))}
                <form onSubmit={handleAddTag} className="inline-flex">
                  <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                    placeholder="+ tag"
                    className="h-5 px-2 bg-[#0c0c0f] border border-[#1e1e24] focus:border-[#8b5cf6]/35 rounded text-[10px] text-[#fafafa] focus:outline-none w-[60px] focus:w-[90px] transition-all" />
                </form>
              </div>

              {isEditMode ? (
                <div className="flex-1 flex flex-col gap-4">
                  <input type="text" value={draftTitle} onChange={e => handleTitleChange(e.target.value)}
                    placeholder="Note Title"
                    className="w-full bg-transparent text-[22px] font-extrabold text-[#fafafa] placeholder:text-[#333342] focus:outline-none border-b border-transparent focus:border-[#1a1a22] pb-2 transition-colors" />
                  <div className="flex-1 min-h-0 flex flex-col">
                    <TipTapEditor value={draftContent} onChange={handleContentChange} placeholder="Write your note here…" />
                  </div>
                </div>
              ) : (
                <div className="flex-1 prose prose-invert select-text max-w-none">
                  {renderMarkdown(draftContent)}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center text-[#55556a] z-10 relative">
            <FileText size={48} className="stroke-1 mb-4" />
            <h4 className="text-[14px] font-semibold text-[#fafafa] mb-1">No Note Selected</h4>
            <p className="text-[12px] text-[#63637a]">
              {activeSpaceId ? "Create a note or pick one from the list." : "Select a space first."}
            </p>
          </div>
        )}
      </div>

      {/* ── Error toast ── */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-500/10 border border-red-500/30 text-red-400 text-[12px] px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg">
          <AlertTriangle size={13} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:text-red-300"><X size={13} /></button>
        </div>
      )}

      {/* ── MODAL: DELETE CONFIRMATION ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-[#000000]/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0c0f] border border-[#2a2a35] w-full max-w-[420px] rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_24px_rgba(239,68,68,0.08)] relative overflow-hidden">
            <div className="absolute top-[-30%] left-[15%] w-[260px] h-[260px] bg-[radial-gradient(circle,rgba(239,68,68,0.07),transparent_70%)] rounded-full pointer-events-none blur-2xl" />

            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-[#fafafa]">
                  Delete {deleteConfirm.type === "space" ? "Space" : "Note"}
                </h3>
                <p className="text-[11px] text-[#63637a]">This action cannot be undone</p>
              </div>
            </div>

            <div className="bg-[#141418] border border-[#1e1e24] rounded-xl p-4 mb-4 relative z-10">
              <p className="text-[13px] text-[#a1a1aa] leading-relaxed">
                {deleteConfirm.type === "note" ? (
                  <>Are you sure you want to delete <span className="font-semibold text-[#fafafa]">&ldquo;{deleteConfirm.name}&rdquo;</span>?</>
                ) : (
                  <>Are you sure you want to delete the space <span className="font-semibold text-[#fafafa]">&ldquo;{deleteConfirm.name}&rdquo;</span>?</>
                )}
              </p>

              {deleteConfirm.type === "space" && deleteConfirm.noteCount !== undefined && deleteConfirm.noteCount > 0 && (
                <div className="mt-3 pt-3 border-t border-[#1e1e24]">
                  <p className="text-[12px] font-semibold text-amber-400 flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={12} />
                    This will also delete {deleteConfirm.noteCount} note{deleteConfirm.noteCount !== 1 ? "s" : ""} inside
                  </p>
                  {deleteConfirm.noteNames && deleteConfirm.noteNames.length > 0 && (
                    <ul className="flex flex-col gap-1 max-h-[120px] overflow-y-auto">
                      {deleteConfirm.noteNames.map((name, i) => (
                        <li key={i} className="text-[11px] text-[#63637a] flex items-center gap-1.5">
                          <FileText size={9} className="shrink-0 text-[#55556a]" />
                          <span className="truncate">{name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 relative z-10">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="flex-1 h-[40px] rounded-xl border border-[#2a2a35] text-[#a1a1aa] hover:text-[#fafafa] text-[13px] font-semibold transition-all disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 h-[40px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60">
                {deleting ? <><Loader2 size={14} className="animate-spin" />Deleting…</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE SPACE ── */}
      {showNewSpaceModal && (
        <div className="fixed inset-0 bg-[#000000]/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0c0f] border border-[#2a2a35] w-full max-w-[440px] rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_24px_rgba(139,92,246,0.1)] relative">
            <div className="absolute top-[-40%] left-[20%] w-[300px] h-[300px] bg-[radial-gradient(circle,rgba(139,92,246,0.12),transparent_70%)] rounded-full pointer-events-none blur-2xl" />

            <div className="flex items-center justify-between mb-5 relative z-10">
              <h3 className="text-[18px] font-bold text-[#fafafa]">Create New Space</h3>
              <button onClick={() => setShowNewSpaceModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#63637a] hover:text-[#fafafa] hover:bg-[#141418] transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSpace} className="flex flex-col gap-4 relative z-10">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#63637a] uppercase tracking-wider">Space Name</label>
                <input type="text" required value={newSpaceName} onChange={e => setNewSpaceName(e.target.value)}
                  placeholder="e.g. Personal notes, Research, ADRs"
                  className="w-full h-[40px] bg-[#141418] border border-[#2a2a35] focus:border-[#8b5cf6]/50 rounded-xl px-3.5 text-[13px] text-[#fafafa] placeholder:text-[#55556a] focus:outline-none transition-all" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#63637a] uppercase tracking-wider">Description</label>
                <input type="text" value={newSpaceDesc} onChange={e => setNewSpaceDesc(e.target.value)}
                  placeholder="What this space is for…"
                  className="w-full h-[40px] bg-[#141418] border border-[#2a2a35] focus:border-[#8b5cf6]/50 rounded-xl px-3.5 text-[13px] text-[#fafafa] placeholder:text-[#55556a] focus:outline-none transition-all" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#63637a] uppercase tracking-wider">Icon</label>
                <div className="grid grid-cols-3 gap-2">
                  {SPACE_ICONS.map(({ id, Icon, color }) => (
                    <button key={id} type="button" onClick={() => setNewSpaceIcon(id)}
                      className={`h-[36px] rounded-xl text-[12px] font-semibold border flex items-center justify-center gap-1.5 transition-all capitalize ${
                        newSpaceIcon === id
                          ? "bg-[#120e20]/65 border-[#8b5cf6] text-[#fafafa] shadow-[0_2px_8px_rgba(139,92,246,0.2)]"
                          : "bg-[#141418] border-[#2a2a35] text-[#63637a] hover:text-[#fafafa]"
                      }`}>
                      <Icon size={12} className={newSpaceIcon === id ? color : ""} />
                      <span>{id}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-2 border-t border-[#1e1e24]/40 pt-4">
                <button type="button" onClick={() => setShowNewSpaceModal(false)}
                  className="flex-1 h-[40px] rounded-xl border border-[#2a2a35] text-[#a1a1aa] hover:text-[#fafafa] text-[13px] font-semibold transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={spaceCreating}
                  className="flex-1 h-[40px] rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#6366f1] text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60">
                  {spaceCreating ? <><Loader2 size={14} className="animate-spin" />Creating…</> : "Create Space"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
