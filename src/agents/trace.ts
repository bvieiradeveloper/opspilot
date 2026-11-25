import type { TraceEvent } from "./reasoning.js";

function normalizeJson(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(normalizeJson);
    }
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
                .map(([key, nested]) => [key, normalizeJson(nested)]),
        );
    }
    return value;
}

function stableJson(value: unknown): string {
    if (value === undefined) return "undefined";
    try {
        return JSON.stringify(normalizeJson(value)) ?? String(value);
    } catch {
        return String(value);
    }
}

export function formatTrace(events: readonly TraceEvent[]): string {
    return events.map((event, index) => {
        switch (event.type) {
            case "fallback":
                return `${index + 1}. fallback@${event.node}: ${event.from} -> ${event.to}`;
            case "route":
                return `${index + 1}. route@${event.node}: ${event.route} — ${event.reason}`;
            case "thought":
                return `${index + 1}. thought@${event.node}: ${event.summary}`;
            case "plan":
                return `${index + 1}. plan@${event.node}: ${event.steps.join(" -> ")}`;
            case "action":
                return `${index + 1}. action@${event.node}: ${event.tool} ${stableJson(event.args)}`;
            case "observation":
                return `${index + 1}. observation@${event.node}: ${stableJson(event.result)}`;
            case "critique":
                return `${index + 1}. critique@${event.node}: ${event.summary}`;
            case "summarize":
                return `${index + 1}. summarize@${event.node}: ${event.summary}`;
            case "handoff":
                return `${index + 1}. handoff@${event.node}: ${event.from} -> ${event.to} — ${event.brief}`;
            case "answer":
                return `${index + 1}. answer@${event.node}: ${event.text}`;
        }
    }).join("\n");
}