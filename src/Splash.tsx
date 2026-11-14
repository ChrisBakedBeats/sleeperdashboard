import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

type Props = { initial: string; loading: boolean; error?: string; onSubmit: (name: string) => void };

export default function Splash({ initial, loading, error, onSubmit }: Props) {
  const [name, setName] = useState(initial);
  return (
    <main className="splash">
      <div className="splash-top"><ThemeToggle /></div>
      <div className="splash-card">
        <h1>Sleeper Dashboard</h1>
        <p className="lede">Waiver targets, rosters, and opportunity stats across all of your Sleeper leagues.</p>
        <form onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) onSubmit(n); }}>
          <label htmlFor="sleeper-user">Sleeper username (not your team name)</label>
          <input
            id="sleeper-user" value={name} onChange={(e) => setName(e.target.value)}
            autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={loading}
          />
          <button disabled={loading || !name.trim()}>{loading ? "Loading your leagues…" : "Load my leagues"}</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="note">Read-only. This only uses Sleeper's public data, and your username is saved in this browser only.</p>
      </div>
    </main>
  );
}
