import React from "react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { TraceEvent as TraceEventData } from "../models/trace.js";
import { TraceEvent } from "./TraceEvent.js";

export function TracePanel({
    events,
    onClose,
}: {
    events: TraceEventData[];
    onClose: () => void;
}) {
    const closeButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        closeButton.current?.focus();
    }, [onClose]);

    function trapDialogFocus(event: KeyboardEvent<HTMLElement>) {
        if (event.key === "Escape") {
            onClose();
            return;
        }
        if (event.key !== "Tab" || !event.currentTarget) return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, a[href], input, textarea, select, [tabindex]:not([tabindex='-1'])")];
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

    return (
        <section className="trace-panel" role="dialog" aria-modal="true" aria-labelledby="trace-title" onKeyDown={trapDialogFocus}>
            <header>
                <h2 id="trace-title">Auditoria da resposta</h2>
                <button ref={closeButton} type="button" onClick={onClose} aria-label="Fechar auditoria">Fechar</button>
            </header>
            {events.length === 0 ? (
                <p>Esta resposta não contém eventos de trace.</p>
            ) : (
                <ol>{events.map((event, index) => <TraceEvent key={`${event.type}-${index}`} event={event} index={index} />)}</ol>
            )}
        </section>
    );
}
