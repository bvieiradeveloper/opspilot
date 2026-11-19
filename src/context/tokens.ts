export const CONTEXT_SOURCES = ["request", "summary", "history", "memories", "toolResults", "reflection"] as const;
export type ContextSource = typeof CONTEXT_SOURCES[number];
export type ContextBreakdown = Partial<Record<ContextSource, number>>;

export function estimateTokens(charsOrText: string | number): number {
    const chars = typeof charsOrText === "number" ? charsOrText : charsOrText.length;
    return Number.isFinite(chars) ? Math.max(0, Math.floor(chars / 4)) : 0;
}

export function estimateContextSource(source: ContextSource, text: string, breakdown: ContextBreakdown = {}): ContextBreakdown {
    if (!CONTEXT_SOURCES.includes(source)) {
        return breakdown;
    }
    const estimate = estimateTokens(text);
    if (estimate === 0) {
        return breakdown;
    }
    return { ...breakdown, [source]: (breakdown[source] ?? 0) + estimate };
}

export function mergeContextBreakdowns(...breakdowns: readonly (ContextBreakdown | undefined)[]): ContextBreakdown {
    const merged: ContextBreakdown = {};
    for (const breakdown of breakdowns) {
        if (!breakdown) continue;
        for (const source of CONTEXT_SOURCES) {
            const value = breakdown[source];
            if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value > 0) {
                merged[source] = (merged[source] ?? 0) + value;
            }
        }
    }
    return merged;
}

export function addContextEstimate(breakdown: ContextBreakdown, source: ContextSource, text: string): void {
    const estimate = estimateTokens(text);
    if (estimate === 0) return;
    breakdown[source] = (breakdown[source] ?? 0) + estimate;
}
