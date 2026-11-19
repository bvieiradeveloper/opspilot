import React from "react";
import { useState } from "react";
import type { z } from "zod";
import { approvalProposalSchema } from "../models/chat.js";
import { decideApproval } from "../services/approval-api.js";
import type { ApprovalDecision } from "../services/approval-api.js";

type ApprovalProposal = z.infer<typeof approvalProposalSchema>;
type ApprovalStatus = ApprovalProposal["status"] | ApprovalDecision["status"];

function display(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
}

export function ApprovalCard({ proposal }: { proposal: ApprovalProposal }) {
    const [status, setStatus] = useState<ApprovalStatus>("pending");
    const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(nextDecision: "approve" | "reject") {
        setBusy(true);
        setError(null);
        try {
            const result = await decideApproval(proposal.id, nextDecision);
            setStatus(result.status);
            setDecision(result.decision);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível registrar a decisão.");
        } finally {
            setBusy(false);
        }
    }

    const isPending = status === "pending";
    const isExecuting = status === "executing";
    return (
        <section className="approval-card" aria-label={`Aprovação: ${proposal.description}`}>
            <h3>Ação aguardando aprovação</h3>
            <p>{proposal.description}</p>
            <p>Ferramenta: <strong>{proposal.tool}</strong></p>
            <pre><code>{display(proposal.arguments)}</code></pre>
            {isPending ? (
                <div className="approval-actions">
                    <button type="button" disabled={busy} onClick={() => void submit("approve")}>Aprovar</button>
                    <button type="button" disabled={busy} onClick={() => void submit("reject")}>Rejeitar</button>
                </div>
            ) : (
                <p role="status">
                    {isExecuting
                        ? "A ação aprovada está sendo executada."
                        : status === "executed"
                            ? "Ação aprovada e executada."
                            : status === "rejected"
                                ? "Ação rejeitada; nenhuma alteração foi executada."
                                : "A execução falhou. A ação não será repetida automaticamente."}
                </p>
            )}
            {isExecuting && decision && (
                <button type="button" disabled={busy} onClick={() => void submit(decision)}>Verificar execução</button>
            )}
            {error && <p role="alert">{error}</p>}
        </section>
    );
}
