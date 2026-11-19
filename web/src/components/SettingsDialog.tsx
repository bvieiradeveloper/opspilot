import React from "react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Preferences } from "../services/preferences.js";
import { savePreferences } from "../services/preferences.js";

export function SettingsDialog({
    preferences,
    onSave,
    onClose,
}: {
    preferences: Preferences;
    onSave: (preferences: Preferences) => void;
    onClose: () => void;
}) {
    const [apiBaseUrl, setApiBaseUrl] = useState(preferences.apiBaseUrl);
    const [theme, setTheme] = useState(preferences.theme);
    const [error, setError] = useState("");
    const dialog = useRef<HTMLDivElement>(null);
    const field = useRef<HTMLInputElement>(null);

    useEffect(() => {
        field.current?.focus();
        const escape = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", escape);
        return () => window.removeEventListener("keydown", escape);
    }, [onClose]);

    function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key !== "Tab" || !dialog.current) return;
        const controls = [...dialog.current.querySelectorAll<HTMLElement>("button, input, select")];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    }

    function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        try {
            const saved = savePreferences({ apiBaseUrl, theme });
            onSave(saved);
            onClose();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível salvar as configurações.");
        }
    }

    return (
        <div className="dialog-backdrop">
            <div
                ref={dialog}
                className="settings-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-title"
                onKeyDown={trapFocus}
            >
                <form onSubmit={submit}>
                    <h2 id="settings-title">Configurações</h2>
                    <label htmlFor="api-base-url">URL base da API</label>
                    <input
                        ref={field}
                        id="api-base-url"
                        type="url"
                        value={apiBaseUrl}
                        onChange={(event) => setApiBaseUrl(event.currentTarget.value)}
                        required
                    />
                    <label htmlFor="theme">Tema</label>
                    <select id="theme" value={theme} onChange={(event) => setTheme(event.currentTarget.value as Preferences["theme"])}>
                        <option value="system">Sistema</option>
                        <option value="light">Claro</option>
                        <option value="dark">Escuro</option>
                    </select>
                    {error && <p role="alert">{error}</p>}
                    <div className="dialog-actions">
                        <button type="button" onClick={onClose}>Cancelar</button>
                        <button type="submit">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
