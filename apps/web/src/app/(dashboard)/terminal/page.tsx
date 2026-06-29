"use client";

import React, { useState, useRef, useEffect } from "react";
import { Terminal as TerminalIcon, Maximize2, Minimize2, Circle, CircleDot } from "lucide-react";

interface CommandRecord {
  command: string;
  output: React.ReactNode;
  timestamp: Date;
}

function CheckCircle2(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return <CircleDot {...props} />;
}

function XCircle(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return <Circle {...props} />;
}

export default function TerminalPage() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<CommandRecord[]>([
    {
      command: "operium --version",
      output: (
        <div className="text-gray-400 mb-2">
          <span className="text-indigo-400 font-bold">Operium OS</span> v2.1.0-beta<br/>
          Type <span className="text-white">help</span> to see available commands.
        </div>
      ),
      timestamp: new Date()
    }
  ]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [theme, setTheme] = useState<"violet" | "blue">("violet");

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const cmd = input.trim().toLowerCase();

    setCommandHistory(prev => [...prev, input.trim()]);
    setHistoryIndex(-1);

    let output: React.ReactNode = null;

    switch (cmd) {
      case "help":
        output = (
          <div className="space-y-2 text-gray-300">
            <p className="text-white mb-2">Available Operium Commands:</p>
            <div className="grid grid-cols-[150px_1fr] gap-2">
              <span className="text-indigo-400">help</span><span>Lists all available commands</span>
              <span className="text-indigo-400">clear</span><span>Clears terminal output</span>
              <span className="text-indigo-400">status</span><span>Shows system health & integrations</span>
              <span className="text-indigo-400">history stats</span><span>Displays memory count & breakdown</span>
              <span className="text-indigo-400">cowork sessions</span><span>Lists recent cowork sessions</span>
              <span className="text-indigo-400">git summary</span><span>Shows git activity summary</span>
              <span className="text-indigo-400">notes list</span><span>Lists notes across spaces</span>
              <span className="text-indigo-400">settings check</span><span>Validates API integrations</span>
              <span className="text-indigo-400">whoami</span><span>Displays current user profile</span>
              <span className="text-indigo-400">theme</span><span>Toggles accent color (violet/blue)</span>
            </div>
          </div>
        );
        break;

      case "clear":
        setHistory([]);
        setInput("");
        return;

      case "status":
        output = (
          <div className="space-y-1">
            <div className="flex items-center space-x-2"><CircleDot className="w-3 h-3 text-emerald-400"/> <span className="text-emerald-400">MCP Server</span> <span className="text-gray-500">— Connected (v1.2.4)</span></div>
            <div className="flex items-center space-x-2"><CircleDot className="w-3 h-3 text-emerald-400"/> <span className="text-emerald-400">Vector DB</span> <span className="text-gray-500">— Healthy (12ms ping)</span></div>
            <div className="flex items-center space-x-2"><CircleDot className="w-3 h-3 text-amber-400"/> <span className="text-amber-400">GitHub API</span> <span className="text-gray-500">— Rate limit warning (450/5000 used)</span></div>
            <div className="flex items-center space-x-2"><CircleDot className="w-3 h-3 text-rose-400"/> <span className="text-rose-400">Azure DevOps</span> <span className="text-gray-500">— Disconnected (Token expired)</span></div>
          </div>
        );
        break;

      case "history stats":
        output = (
          <div className="border border-white/10 rounded-md p-3 bg-white/5 w-96">
            <p className="text-white font-medium mb-3 border-b border-white/10 pb-2">Memory Statistics</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Total Memories</span> <span className="font-mono text-indigo-400">1,248</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Storage Used</span> <span className="font-mono text-indigo-400">45.2 MB</span></div>
              <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                <div className="flex justify-between"><span className="text-gray-500 text-xs">Category: Tech</span> <span className="text-xs">45%</span></div>
                <div className="flex justify-between"><span className="text-gray-500 text-xs">Category: Design</span> <span className="text-xs">30%</span></div>
                <div className="flex justify-between"><span className="text-gray-500 text-xs">Category: Product</span> <span className="text-xs">25%</span></div>
              </div>
            </div>
          </div>
        );
        break;

      case "cowork sessions":
        output = (
          <div className="space-y-2">
            <div className="flex space-x-4 text-gray-300">
              <span className="text-emerald-400 font-mono">[2024-05-20]</span>
              <span>Auth Refactor Planning</span>
              <span className="text-gray-500 text-sm">Duration: 45m</span>
            </div>
            <div className="flex space-x-4 text-gray-300">
              <span className="text-emerald-400 font-mono">[2024-05-19]</span>
              <span>Sidebar UI Bugfix</span>
              <span className="text-gray-500 text-sm">Duration: 1h 20m</span>
            </div>
            <div className="flex space-x-4 text-gray-300">
              <span className="text-emerald-400 font-mono">[2024-05-18]</span>
              <span>API Rate Limit Discussion</span>
              <span className="text-gray-500 text-sm">Duration: 30m</span>
            </div>
          </div>
        );
        break;

      case "git summary":
        output = (
          <div className="space-y-1 font-mono text-sm">
            <p><span className="text-gray-500">Current Branch:</span> <span className="text-indigo-400">feature/auth-refactor</span></p>
            <p><span className="text-gray-500">Status:</span> <span className="text-amber-400">3 modified</span>, <span className="text-rose-400">1 deleted</span>, <span className="text-emerald-400">2 untracked</span></p>
            <p><span className="text-gray-500">Last Commit:</span> a1b2c3d - feat: implement git activity dashboard</p>
            <p className="mt-2 text-gray-400">Run <span className="text-white">git status</span> in standard terminal for details.</p>
          </div>
        );
        break;

      case "notes list":
        output = (
          <div className="grid grid-cols-[1fr_100px_100px] gap-2 text-sm max-w-2xl">
            <div className="text-gray-500 border-b border-white/10 pb-1">Title</div>
            <div className="text-gray-500 border-b border-white/10 pb-1">Space</div>
            <div className="text-gray-500 border-b border-white/10 pb-1">Words</div>

            <div className="text-gray-300">Q2 Roadmap Planning</div>
            <div className="text-indigo-400">Product</div>
            <div className="text-gray-400 text-right">1,240</div>

            <div className="text-gray-300">Weekly Sync Notes</div>
            <div className="text-indigo-400">Engineering</div>
            <div className="text-gray-400 text-right">450</div>

            <div className="text-gray-300">Onboarding Guide draft</div>
            <div className="text-indigo-400">General</div>
            <div className="text-gray-400 text-right">3,100</div>
          </div>
        );
        break;

      case "settings check":
        output = (
          <div className="space-y-2">
            <p className="text-gray-300">Running diagnostics...</p>
            <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> <span className="text-emerald-400">Database Connection</span></div>
            <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> <span className="text-emerald-400">Vector Search Engine</span></div>
            <div className="flex items-center space-x-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> <span className="text-emerald-400">Storage Bucket</span></div>
            <div className="flex items-center space-x-2"><XCircle className="w-4 h-4 text-rose-500" /> <span className="text-rose-400">SMTP Mail Server (Connection Refused)</span></div>
            <p className="text-amber-400 mt-2">Warning: Email notifications will not be delivered.</p>
          </div>
        );
        break;

      case "whoami":
        output = (
          <div className="flex items-center space-x-4 bg-white/5 p-4 rounded-lg w-fit border border-white/10">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-xl font-bold text-white">
              N
            </div>
            <div>
              <p className="text-white font-medium">Nikita</p>
              <p className="text-sm text-gray-400">Admin • experia/operium</p>
              <p className="text-xs text-indigo-400 mt-1">nikita@experia.dev</p>
            </div>
          </div>
        );
        break;

      case "theme": {
        const newTheme = theme === "violet" ? "blue" : "violet";
        setTheme(newTheme);
        output = <div className="text-gray-300">Theme updated to <span className={newTheme === "violet" ? "text-indigo-400" : "text-blue-400"}>{newTheme}</span>. (Easter egg applied!)</div>;
        break;
      }

      default:
        output = (
          <div className="text-rose-400">
            command not found: {cmd}<br/>
            <span className="text-gray-400">Type <span className="text-white">help</span> to see available commands.</span>
          </div>
        );
    }

    setHistory(prev => [...prev, { command: input, output, timestamp: new Date() }]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput("");
      }
    }
  };

  const promptColor = theme === "violet" ? "text-indigo-400" : "text-blue-400";

  return (
    <div className={`flex-1 flex flex-col h-full bg-[#030303] text-gray-100 p-6 ${isFullScreen ? "fixed inset-0 z-50 bg-[#030303]" : ""}`}>
      {/* Terminal Window */}
      <div className={`flex flex-col border border-white/10 rounded-xl overflow-hidden bg-[#0A0A0A] shadow-2xl ${isFullScreen ? "h-full" : "h-[calc(100vh-100px)]"} transition-all duration-300`}>

        {/* Terminal Header */}
        <div className="h-12 bg-white/5 border-b border-white/10 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
          </div>

          <div className="flex items-center space-x-2 text-gray-400 text-sm font-medium">
            <TerminalIcon className="w-4 h-4" />
            <span>operium-tty1</span>
          </div>

          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Terminal Content */}
        <div
          className="flex-1 overflow-y-auto p-4 font-mono text-sm scrollbar-thin scrollbar-thumb-white/10 cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {/* History */}
          <div className="space-y-4 mb-4">
            {history.map((record, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className={`${promptColor} font-bold`}>operium@experia</span>
                  <span className="text-gray-500">~</span>
                  <span className="text-gray-300">$</span>
                  <span className="text-white">{record.command}</span>
                </div>
                <div className="pl-2 border-l-2 border-white/5">
                  {record.output}
                </div>
              </div>
            ))}
          </div>

          {/* Current Input */}
          <div className="flex items-center space-x-2">
            <span className={`${promptColor} font-bold whitespace-nowrap`}>operium@experia</span>
            <span className="text-gray-500">~</span>
            <span className="text-gray-300">$</span>
            <form onSubmit={handleCommand} className="flex-1 flex">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent border-none outline-none text-white font-mono"
                spellCheck={false}
                autoComplete="off"
              />
            </form>
          </div>

          <div ref={endOfMessagesRef} />
        </div>

        {/* Terminal Footer StatusBar */}
        <div className="h-8 bg-white/[0.02] border-t border-white/5 flex items-center justify-between px-4 text-xs text-gray-500 font-mono shrink-0">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <Circle className="w-2 h-2 text-emerald-500 fill-emerald-500" />
              <span>System Online</span>
            </span>
            <span>OS: Darwin x64</span>
          </div>
          <div className="flex items-center space-x-3">
            <span>Encoding: UTF-8</span>
            <span>{history.length} cmds</span>
          </div>
        </div>
      </div>
    </div>
  );
}
