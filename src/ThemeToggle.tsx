import { useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
  const pick = (t: Theme) => {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch { /* ignore */ }
  };
  return (
    <div className="theme" role="group" aria-label="Color theme">
      <button aria-pressed={theme === "light"} onClick={() => pick("light")}>Light</button>
      <button aria-pressed={theme === "dark"} onClick={() => pick("dark")}>Dark</button>
    </div>
  );
}
