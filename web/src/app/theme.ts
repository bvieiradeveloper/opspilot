import type { Preferences } from "../services/preferences.js";

export function applyTheme(theme: Preferences["theme"]): void {
    const resolved = theme === "system"
        ? (globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
}
