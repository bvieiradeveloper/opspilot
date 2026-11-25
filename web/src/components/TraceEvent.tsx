import React from "react";
import type { TraceEvent as TraceEventData } from "../models/trace.js";

function literal(value: unknown): string {
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

function eventLabel(event: TraceEventData): string {
    if (event.type === "answer") return "Resposta";
    if (event.type === "handoff") return "Transferência";
    const labels: Record<string, string> = {
        thought: "Pensamento",
        action: "Ação",
        observation: "Observação",
    };
    return labels[event.type] ?? event.type;
}

type HandoffEvent = {
    type: "handoff";
    node: "team";
    from: "supervisor" | "analyst" | "planner" | "executor";
    to: "analyst" | "planner" | "executor";
    brief: string;
};

function isHandoffEvent(event: TraceEventData): event is HandoffEvent {
    const sources = new Set(["supervisor", "analyst", "planner", "executor"]);
    const destinations = new Set(["analyst", "planner", "executor"]);
    return event.type === "handoff"
        && event.node === "team"
        && typeof event.from === "string"
        && sources.has(event.from)
        && typeof event.to === "string"
        && destinations.has(event.to)
        && typeof event.brief === "string";
}

export function TraceEvent({ event, index }: { event: TraceEventData; index: number }) {
    const data = event as Record<string, unknown>;
    if (isHandoffEvent(event)) {
        const roleNames = {
            supervisor: "supervisor",
            analyst: "analista",
            planner: "planejador",
            executor: "executor",
        } as const;
        return (
            <li className={`trace-event trace-${event.type}`} data-event-type={event.type}>
                <h3>{index + 1}. {eventLabel(event)}</h3>
                <p className="trace-node">Etapa: equipe</p>
                <p>De <strong>{roleNames[event.from]}</strong> para <strong>{roleNames[event.to]}</strong></p>
                <p>{event.brief}</p>
            </li>
        );
    }
    return (
        <li className={`trace-event trace-${event.type}`} data-event-type={event.type}>
            <h3>{index + 1}. {eventLabel(event)}</h3>
            <p className="trace-node">Etapa: {String(data.node ?? "desconhecida")}</p>
            {event.type === "action" ? (
                <>
                    <p>Ferramenta: <strong>{String(data.tool)}</strong></p>
                    <pre><code>{literal(data.args)}</code></pre>
                </>
            ) : event.type === "observation" ? (
                <pre><code>{literal(data.result)}</code></pre>
            ) : (
                <pre><code>{literal(data.text ?? data.summary ?? data.steps ?? data.reason ?? data)}</code></pre>
            )}
        </li>
    );
}
