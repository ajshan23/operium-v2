export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-primary)]">
      <div className="flex flex-col items-center gap-6 text-center">
        {/* Logo mark */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
          <span className="text-2xl font-bold text-white">O</span>
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-[var(--text-primary)]">
          Operium
        </h1>

        <p className="max-w-md text-lg text-[var(--text-secondary)]">
          Persistent memory for your AI coding assistant&mdash;for you and your
          team.
        </p>

        {/* Status badge */}
        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--text-muted)]">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          v2 — Building in public
        </div>
      </div>
    </main>
  );
}
