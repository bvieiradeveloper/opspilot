import React from "react";
import { useEffect, useRef, useState } from "react";
import { Chat } from "../components/Chat.js";
import { SettingsDialog } from "../components/SettingsDialog.js";
import { getDefaultApiBaseUrl, readPreferences, type Preferences } from "../services/preferences.js";
import { applyTheme } from "./theme.js";

export function App() {
    const [initial] = useState(() => {
        try {
            return { preferences: readPreferences(), error: "" };
        } catch (reason) {
            return {
                preferences: { apiBaseUrl: getDefaultApiBaseUrl(), theme: "system" as const },
                error: reason instanceof Error ? reason.message : "Saved War Room settings are invalid.",
            };
        }
    });
    const [preferences, setPreferences] = useState<Preferences>(initial.preferences);
    const [configurationError, setConfigurationError] = useState(initial.error);
    const [settingsOpen, setSettingsOpen] = useState(Boolean(initial.error));
    const settingsButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        applyTheme(preferences.theme);
        if (preferences.theme !== "system") return;
        const colorScheme = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
        if (!colorScheme) return;
        const updateTheme = () => applyTheme("system");
        colorScheme.addEventListener("change", updateTheme);
        return () => colorScheme.removeEventListener("change", updateTheme);
    }, [preferences.theme]);

    function closeSettings() {
        setSettingsOpen(false);
        requestAnimationFrame(() => settingsButton.current?.focus());
    }

    return (
        <main className="app-shell">
            <div className="topbar">
                <a className="brand" href="/opspilot/">OpsPilot</a>
                <button
                    ref={settingsButton}
                    type="button"
                    aria-label="Abrir configurações"
                    onClick={() => setSettingsOpen(true)}
                >
                    ⚙ Configurações
                </button>
            </div>
            {configurationError
                ? <p role="alert">{configurationError} Save valid settings to continue.</p>
                : <Chat />}
            {settingsOpen && (
                <SettingsDialog
                    preferences={preferences}
                    onSave={(saved) => {
                        setPreferences(saved);
                        setConfigurationError("");
                    }}
                    onClose={closeSettings}
                />
            )}
        </main>
    );
}
