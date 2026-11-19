import { z } from "zod";
import { ApiRequestError } from "./chat-api.js";
import { getCurrentApiBaseUrl, joinApiEndpoint } from "./preferences.js";

const approvalDecisionSchema = z.object({
    approval: z.object({
        id: z.string().min(1),
        status: z.enum(["executing", "executed", "rejected", "failed"]),
        decision: z.enum(["approve", "reject"]),
        result: z.unknown().optional(),
        decidedAt: z.string().datetime(),
        completedAt: z.string().datetime().nullable().optional(),
        errorCode: z.string().min(1).optional(),
    }),
});

export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>["approval"];

export async function decideApproval(
    approvalId: string,
    decision: "approve" | "reject",
    apiBaseUrl?: string,
    doFetch: typeof fetch = fetch,
): Promise<ApprovalDecision> {
    const id = z.string().trim().min(1).parse(approvalId);
    const baseUrl = apiBaseUrl ?? getCurrentApiBaseUrl();
    let response: Response;
    try {
        response = await doFetch(joinApiEndpoint(baseUrl, `/approvals/${encodeURIComponent(id)}`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision }),
        });
    } catch {
        throw new ApiRequestError("Não foi possível conectar à API. A decisão continua pendente; tente novamente.");
    }
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new ApiRequestError("A API retornou uma resposta JSON inválida.", response.status);
    }
    if (response.status !== 200 && response.status !== 202) {
        throw new ApiRequestError(`A API respondeu com HTTP ${response.status}.`, response.status);
    }
    try {
        const approval = approvalDecisionSchema.parse(body).approval;
        if (approval.id !== id || approval.decision !== decision) {
            throw new Error("The returned approval does not match the requested decision.");
        }
        if (
            (response.status === 202 && approval.status !== "executing")
            || (response.status === 200 && approval.status === "executing")
            || (decision === "reject" && approval.status !== "rejected")
            || (decision === "approve" && !["executing", "executed", "failed"].includes(approval.status))
        ) {
            throw new Error("The API returned an inconsistent approval state.");
        }
        return approval;
    } catch {
        throw new ApiRequestError("A API retornou uma confirmação de decisão inválida.", response.status);
    }
}
