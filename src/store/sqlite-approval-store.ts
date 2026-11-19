import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
    approvalRecordSchema,
    approvalStatusSchema,
    pendingApprovalInputSchema,
    type ApprovalDecision,
    type ApprovalDecisionClaim,
    type ApprovalRecord,
    type ApprovalStore,
    type PendingApprovalInput,
} from "./approval-store.js";

const DEFAULT_DATABASE_PATH = "./data/opspilot.db";
type SqliteRow = Record<string, unknown>;

function text(row: SqliteRow, column: string): string {
    const value = row[column];
    if (typeof value !== "string") throw new Error(`SQLite returned invalid ${column} data.`);
    return value;
}

function nullableText(row: SqliteRow, column: string): string | null {
    const value = row[column];
    if (value === null) return null;
    return text(row, column);
}

function json(row: SqliteRow, column: string): unknown {
    const value = nullableText(row, column);
    return value === null ? null : JSON.parse(value) as unknown;
}

function toApproval(row: SqliteRow): ApprovalRecord {
    return approvalRecordSchema.parse({
        id: text(row, "id"),
        requestId: text(row, "request_id"),
        conversationId: text(row, "conversation_id"),
        userId: text(row, "user_id"),
        tool: text(row, "tool"),
        arguments: JSON.parse(text(row, "arguments_json")) as unknown,
        description: text(row, "description"),
        status: text(row, "status"),
        decision: row.decision,
        createdAt: text(row, "created_at"),
        decidedAt: nullableText(row, "decided_at"),
        completedAt: nullableText(row, "completed_at"),
        result: json(row, "result_json"),
        errorCode: nullableText(row, "error_code"),
    });
}

export class SqliteApprovalStore implements ApprovalStore {
    private readonly db: DatabaseSync;

    constructor(path = process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH) {
        if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
        this.db = new DatabaseSync(path);
        this.db.exec(`
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS approvals (
                id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
                request_id TEXT NOT NULL CHECK (length(trim(request_id)) > 0),
                conversation_id TEXT NOT NULL CHECK (length(trim(conversation_id)) > 0),
                user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
                tool TEXT NOT NULL CHECK (tool IN ('open_incident', 'resolve_incident')),
                arguments_json TEXT NOT NULL CHECK (json_valid(arguments_json)),
                description TEXT NOT NULL CHECK (length(trim(description)) > 0),
                status TEXT NOT NULL CHECK (status IN ('pending', 'executing', 'executed', 'rejected', 'failed')),
                decision TEXT CHECK (decision IS NULL OR decision IN ('approve', 'reject')),
                created_at TEXT NOT NULL,
                decided_at TEXT,
                completed_at TEXT,
                result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
                error_code TEXT,
                CHECK (
                    (status = 'pending' AND decision IS NULL AND decided_at IS NULL AND completed_at IS NULL)
                    OR (status = 'executing' AND decision = 'approve' AND decided_at IS NOT NULL AND completed_at IS NULL)
                    OR (status = 'rejected' AND decision = 'reject' AND decided_at IS NOT NULL AND completed_at IS NULL)
                    OR (status IN ('executed', 'failed') AND decision = 'approve' AND decided_at IS NOT NULL AND completed_at IS NOT NULL)
                )
            );
            CREATE INDEX IF NOT EXISTS idx_approvals_user_status ON approvals(user_id, status);
        `);
    }

    createPending(input: PendingApprovalInput): ApprovalRecord {
        const proposal = pendingApprovalInputSchema.parse(input);
        this.db.prepare(`
            INSERT INTO approvals (
                id, request_id, conversation_id, user_id, tool, arguments_json, description,
                status, decision, created_at, decided_at, completed_at, result_json, error_code
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL, NULL, NULL, NULL)
        `).run(
            proposal.id,
            proposal.requestId,
            proposal.conversationId,
            proposal.userId,
            proposal.tool,
            JSON.stringify(proposal.arguments),
            proposal.description,
            proposal.createdAt,
        );
        const saved = this.get(proposal.id);
        if (!saved) throw new Error("The new approval record could not be read.");
        return saved;
    }

    get(id: string): ApprovalRecord | null {
        const parsedId = z.string().trim().min(1).parse(id);
        const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(parsedId) as SqliteRow | undefined;
        return row ? toApproval(row) : null;
    }

    claimDecision(id: string, userId: string, decision: ApprovalDecision, now: Date): ApprovalDecisionClaim {
        const parsed = z.object({
            id: z.string().trim().min(1),
            userId: z.string().trim().min(1),
            decision: z.enum(["approve", "reject"]),
            now: z.date(),
        }).parse({ id, userId, decision, now });
        const current = this.get(parsed.id);
        if (!current || current.userId !== parsed.userId) return { kind: "not_found" };
        if (current.status !== "pending") {
            return current.decision === parsed.decision
                ? { kind: "existing", approval: current }
                : { kind: "conflict", approval: current };
        }

        const status = parsed.decision === "approve" ? "executing" : "rejected";
        const update = this.db.prepare(`
            UPDATE approvals
            SET status = ?, decision = ?, decided_at = ?
            WHERE id = ? AND user_id = ? AND status = 'pending'
        `).run(status, parsed.decision, parsed.now.toISOString(), parsed.id, parsed.userId);
        const changed = this.get(parsed.id);
        if (!changed || changed.userId !== parsed.userId) return { kind: "not_found" };
        if (update.changes === 1) return { kind: "claimed", approval: changed };
        return changed.decision === parsed.decision
            ? { kind: "existing", approval: changed }
            : { kind: "conflict", approval: changed };
    }

    complete(
        id: string,
        status: "executed" | "failed",
        result: unknown,
        errorCode: string | null,
        completedAt: Date,
    ): ApprovalRecord {
        const parsed = z.object({
            id: z.string().trim().min(1),
            status: approvalStatusSchema.extract(["executed", "failed"]),
            errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).nullable(),
            completedAt: z.date(),
        }).parse({ id, status, errorCode, completedAt });
        const encodedResult = JSON.stringify(result);
        if (encodedResult === undefined) throw new Error("Approval outcomes must be JSON serializable.");
        const update = this.db.prepare(`
            UPDATE approvals
            SET status = ?, result_json = ?, error_code = ?, completed_at = ?
            WHERE id = ? AND status = 'executing' AND decision = 'approve'
        `).run(parsed.status, encodedResult, parsed.errorCode, parsed.completedAt.toISOString(), parsed.id);
        if (update.changes !== 1) {
            throw new Error("Only an executing approval can receive a terminal execution result.");
        }
        const saved = this.get(parsed.id);
        if (!saved) throw new Error("The completed approval could not be read.");
        return saved;
    }

    close(): void {
        this.db.close();
    }
}

export function createConfiguredSqliteApprovalStore(): SqliteApprovalStore {
    return new SqliteApprovalStore();
}
