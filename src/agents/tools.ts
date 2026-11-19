import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { severitySchema } from "./domain.js";
import { store as defaultStore } from "./store.js";
import type { OpsStore } from "../store/ops-store.js";

export const listAlertsInputSchema = z.object({
    status: z.enum(["firing", "resolved", "all"])
        .default("firing")
        .describe("Which alert states to return: firing, resolved, or all. Defaults to firing."),
});

export const openIncidentInputSchema = z.object({
    title: z.string().trim().min(1)
        .describe("Short, specific summary of the incident to track."),
    service: z.string().trim().min(1)
        .describe("Name or ID of an existing monitored service affected by the incident; alert records expose the service ID."),
    severity: severitySchema
        .describe("Operational impact level: sev1 (highest), sev2, or sev3 (lowest)."),
});

export const resolveIncidentInputSchema = z.object({
    id: z.string().trim().min(1)
        .describe("Identifier of the existing incident to resolve."),
});

export type IncidentToolProposal =
    | { tool: "open_incident"; args: z.infer<typeof openIncidentInputSchema> }
    | { tool: "resolve_incident"; args: z.infer<typeof resolveIncidentInputSchema> };

const providerStatusSchema = z.object({
    status: z.object({
        indicator: z.string(),
        description: z.string(),
    }),
});

const providerStatusUrls = {
    github: "https://www.githubstatus.com/api/v2/status.json",
    cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json",
} as const;

type Provider = keyof typeof providerStatusUrls;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message.replace(/[\r\n]+/g, " ") : "unknown error";
}

export async function fetchProviderStatus(provider: Provider, doFetch: typeof fetch = fetch): Promise<string> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        let response: Response;
        try {
            response = await doFetch(providerStatusUrls[provider], {
                signal: AbortSignal.timeout(5000),
            });
        } catch (error) {
            if (attempt === 1) {
                continue;
            }
            return `Could not retrieve ${provider} status after ${attempt} attempts (${errorMessage(error)}). Use internal alerts and inform the on-call responder about this limitation.`;
        }

        if (response.status >= 500) {
            if (attempt === 1) {
                continue;
            }
            return `Could not retrieve ${provider} status after ${attempt} attempts (status page returned HTTP ${response.status}). Use internal alerts and inform the on-call responder about this limitation.`;
        }

        if (!response.ok) {
            return `Status page for ${provider} returned HTTP ${response.status}.`;
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch (error) {
            if (error instanceof SyntaxError) {
                return `Could not retrieve ${provider} status: invalid status response (invalid JSON).`;
            }
            if (attempt === 1) {
                continue;
            }
            return `Could not retrieve ${provider} status after ${attempt} attempts (${errorMessage(error)}). Use internal alerts and inform the on-call responder about this limitation.`;
        }

        const parsed = providerStatusSchema.safeParse(payload);
        if (!parsed.success) {
            return `Could not retrieve ${provider} status: invalid status response.`;
        }

        const indicator = parsed.data.status.indicator.replace(/[\r\n]+/g, " ");
        const description = parsed.data.status.description.replace(/[\r\n]+/g, " ");
        return `${provider} is ${indicator} - ${description}`;
    }

    return `Could not retrieve ${provider} status. Use internal alerts and inform the on-call responder about this limitation.`;
}

export function createOpsTools(
    store: OpsStore = defaultStore,
    doFetch: typeof fetch = fetch,
    options: { onIncidentProposal?: (proposal: IncidentToolProposal) => void } = {},
) {
    const listAlerts = tool(
        async ({ status }) => JSON.stringify(store.listAlerts(status)),
        {
            name: "list_alerts",
            description: "Inspect monitor alerts. Use this for current or historical alert state; do not use it to create or change an incident.",
            schema: listAlertsInputSchema,
        },
    );

    const openIncident = tool(
        async ({ title, service, severity }) => {
            const args = openIncidentInputSchema.parse({ title, service, severity });
            if (options.onIncidentProposal) {
                options.onIncidentProposal({ tool: "open_incident", args });
                return JSON.stringify({ status: "approval_required", tool: "open_incident", args });
            }
            return JSON.stringify(store.openIncident(args));
        },
        {
            name: "open_incident",
            description: "Create a tracked incident only when an alert or operational condition requires investigation or coordinated response. Do not use for informational questions, duplicate tracking, or conditions with no actionable response. Opening an incident changes operational state.",
            schema: openIncidentInputSchema,
        },
    );

    const resolveIncident = tool(
        async ({ id }) => {
            const args = resolveIncidentInputSchema.parse({ id });
            if (options.onIncidentProposal) {
                options.onIncidentProposal({ tool: "resolve_incident", args });
                return JSON.stringify({ status: "approval_required", tool: "resolve_incident", args });
            }
            return JSON.stringify(store.resolveIncident(args.id));
        },
        {
            name: "resolve_incident",
            description: "Resolve an existing open or mitigated incident after its actionable impact has been addressed and verified. This changes incident state and fails for unknown or already resolved IDs.",
            schema: resolveIncidentInputSchema,
        },
    );

    const listIncidents = tool(
        async ({ status }) => JSON.stringify(store.listIncidents(status)),
        {
            name: "list_incidents",
            description: "Inspect tracked incidents. Use the default open filter for active response work; choose mitigated or resolved to review those states, or all for the complete incident list. This tool does not change state.",
            schema: z.object({
                status: z.enum(["open", "mitigated", "resolved", "all"])
                    .default("open")
                    .describe("Incident state to return: open, mitigated, resolved, or all. Defaults to open."),
            }),
        },
    );

    const consultarRunbooks = tool(
        async ({ service }) => JSON.stringify(store.listRunbooks(service)),
        {
            name: "consultar_runbooks",
            description: "Retrieve operational instructions for one monitored service before or during its response. The result contains only that service's runbooks and is empty when no runbook is available. This tool does not change state.",
            schema: z.object({
                service: z.string().trim().min(1)
                    .describe("Name or ID of the monitored service whose runbook guidance is needed; alert records expose the service ID."),
            }),
        },
    );

    const checkProviderStatus = tool(
        async ({ provider }) => fetchProviderStatus(provider, doFetch),
        {
            name: "check_provider_status",
            description: "Check a provider's public status when an external dependency may be unavailable or you suspect an outage. Use this to help determine whether an incident is internal or caused by GitHub or Cloudflare; a lookup failure is not evidence of provider health.",
            schema: z.object({
                provider: z.enum(["github", "cloudflare"])
                    .default("github")
                    .describe("External provider whose status to check when you suspect its service may be affecting an incident; choose github or cloudflare. Defaults to github."),
            }),
        },
    );

    return [listAlerts, openIncident, resolveIncident, listIncidents, consultarRunbooks, checkProviderStatus] as const;
}

export const opsTools = createOpsTools();
export const [listAlerts, openIncident, resolveIncident, listIncidents, consultarRunbooks, checkProviderStatus] = opsTools;
