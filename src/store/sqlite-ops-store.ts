import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
    alertSchema,
    incidentSchema,
    runbookSchema,
    serviceSchema,
    severitySchema,
    type Alert,
    type AlertStatus,
    type Incident,
    type IncidentFilter,
    type OpenIncidentInput,
    type Runbook,
    type Service,
} from "../agents/domain.js";
import {
    IncidentAlreadyResolvedError,
    InvalidDomainInputError,
    UnknownIncidentError,
    UnknownServiceError,
} from "../agents/errors.js";
import type { OpsStore } from "./ops-store.js";
import { seedAlerts, seedRunbooks, seedServices } from "./seed-data.js";

type SqliteRow = Record<string, unknown>;

export type SqliteOpsStoreOptions = {
    clock?: () => Date;
};

const DEFAULT_DATABASE_PATH = "./data/opspilot.db";

function text(row: SqliteRow, column: string): string {
    const value = row[column];
    if (typeof value !== "string") {
        throw new Error(`SQLite returned a non-text value for ${column}.`);
    }
    return value;
}

function nullableText(row: SqliteRow, column: string): string | null {
    const value = row[column];
    if (value === null) {
        return null;
    }
    if (typeof value !== "string") {
        throw new Error(`SQLite returned an invalid nullable text value for ${column}.`);
    }
    return value;
}

function toService(row: SqliteRow): Service {
    return serviceSchema.parse({
        id: text(row, "id"),
        name: text(row, "name"),
        description: text(row, "description"),
        tier: text(row, "tier"),
    });
}

function toAlert(row: SqliteRow): Alert {
    return alertSchema.parse({
        id: text(row, "id"),
        serviceId: text(row, "service_id"),
        title: text(row, "title"),
        status: text(row, "status"),
        severity: text(row, "severity"),
        createdAt: text(row, "created_at"),
        resolvedAt: nullableText(row, "resolved_at"),
    });
}

function toIncident(row: SqliteRow): Incident {
    return incidentSchema.parse({
        id: text(row, "id"),
        title: text(row, "title"),
        serviceId: text(row, "service_id"),
        severity: text(row, "severity"),
        status: text(row, "status"),
        createdAt: text(row, "created_at"),
        resolvedAt: nullableText(row, "resolved_at"),
        summary: nullableText(row, "summary"),
    });
}

function toRunbook(row: SqliteRow): Runbook {
    return runbookSchema.parse({
        id: text(row, "id"),
        serviceId: text(row, "service_id"),
        title: text(row, "title"),
        content: text(row, "content"),
    });
}

export class SqliteOpsStore implements OpsStore {
    private readonly _db: DatabaseSync;
    private readonly clock: () => Date;

    constructor(
        path = process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH,
        options: SqliteOpsStoreOptions = {},
    ) {
        if (path !== ":memory:") {
            mkdirSync(dirname(resolve(path)), { recursive: true });
        }
        this._db = new DatabaseSync(path);
        this.clock = options.clock ?? (() => new Date());
        this._db.exec(`
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS services (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL,
                tier TEXT NOT NULL CHECK (tier IN ('sev1', 'sev2', 'sev3'))
            );
            CREATE TABLE IF NOT EXISTS alerts (
                id TEXT PRIMARY KEY,
                service_id TEXT NOT NULL REFERENCES services(id),
                title TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('firing', 'resolved')),
                severity TEXT NOT NULL CHECK (severity IN ('sev1', 'sev2', 'sev3')),
                created_at TEXT NOT NULL,
                resolved_at TEXT
            );
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                service_id TEXT NOT NULL REFERENCES services(id),
                severity TEXT NOT NULL CHECK (severity IN ('sev1', 'sev2', 'sev3')),
                status TEXT NOT NULL CHECK (status IN ('open', 'mitigated', 'resolved')),
                created_at TEXT NOT NULL,
                resolved_at TEXT,
                summary TEXT
            );
            CREATE TABLE IF NOT EXISTS runbooks (
                id TEXT PRIMARY KEY,
                service_id TEXT NOT NULL UNIQUE REFERENCES services(id),
                title TEXT NOT NULL,
                content TEXT NOT NULL
            );
        `);
        this.seed();
    }

    listServices(): Service[] {
        return this._db.prepare("SELECT id, name, description, tier FROM services ORDER BY id")
            .all()
            .map(toService);
    }

    listAlerts(status?: AlertStatus | "all"): Alert[] {
        const normalizedStatus = status ?? "all";
        return this._db.prepare(`
            SELECT id, service_id, title, status, severity, created_at, resolved_at
            FROM alerts
            WHERE (? = 'all' OR status = ?)
            ORDER BY id
        `).all(normalizedStatus, normalizedStatus).map(toAlert);
    }

    listIncidents(filter?: IncidentFilter): Incident[] {
        const normalizedFilter = filter ?? "all";
        return this._db.prepare(`
            SELECT id, title, service_id, severity, status, created_at, resolved_at, summary
            FROM incidents
            WHERE (? = 'all' OR status = ?)
            ORDER BY created_at, rowid
        `).all(normalizedFilter, normalizedFilter).map(toIncident);
    }

    listRunbooks(service: string): Runbook[] {
        return this._db.prepare(`
            SELECT runbooks.id, runbooks.service_id, runbooks.title, runbooks.content
            FROM runbooks
            INNER JOIN services ON services.id = runbooks.service_id
            WHERE services.name = ? OR services.id = ?
            ORDER BY runbooks.id
        `).all(service.trim(), service.trim()).map(toRunbook);
    }

    openIncident(input: OpenIncidentInput): Incident {
        const title = input.title.trim();
        const serviceName = input.service.trim();
        const severity = severitySchema.safeParse(input.severity.trim());
        if (!title || !serviceName || !severity.success) {
            throw new InvalidDomainInputError(
                "Incident title, service, and severity (sev1, sev2, or sev3) are required.",
            );
        }

        const serviceRow = this._db.prepare("SELECT id FROM services WHERE name = ? OR id = ?")
            .get(serviceName, serviceName);
        if (!serviceRow) {
            throw new UnknownServiceError("The requested service does not exist.");
        }

        const id = `incident-${randomUUID()}`;
        const createdAt = this.clock().toISOString();
        this._db.prepare(`
            INSERT INTO incidents
                (id, title, service_id, severity, status, created_at, resolved_at, summary)
            VALUES (?, ?, ?, ?, 'open', ?, NULL, NULL)
        `).run(id, title, text(serviceRow, "id"), severity.data, createdAt);
        return this.getIncident(id);
    }

    resolveIncident(id: string): Incident {
        const normalizedId = id.trim();
        if (!normalizedId) {
            throw new InvalidDomainInputError("Incident id is required.");
        }
        const incidentRow = this._db.prepare(`
            SELECT id, title, service_id, severity, status, created_at, resolved_at, summary
            FROM incidents
            WHERE id = ?
        `).get(normalizedId);
        if (!incidentRow) {
            throw new UnknownIncidentError("The requested incident does not exist.");
        }
        const incident = toIncident(incidentRow);
        if (incident.status === "resolved") {
            throw new IncidentAlreadyResolvedError("The incident is already resolved.");
        }
        this._db.prepare(`
            UPDATE incidents
            SET status = 'resolved', resolved_at = ?
            WHERE id = ?
        `).run(this.clock().toISOString(), normalizedId);
        return this.getIncident(normalizedId);
    }

    close(): void {
        this._db.close();
    }

    private seed(): void {
        this._db.exec("BEGIN");
        try {
            const insertService = this._db.prepare(`
                INSERT INTO services (id, name, description, tier)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING
            `);
            for (const service of seedServices) {
                insertService.run(service.id, service.name, service.description, service.tier);
            }

            const insertAlert = this._db.prepare(`
                INSERT INTO alerts
                    (id, service_id, title, status, severity, created_at, resolved_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING
            `);
            for (const alert of seedAlerts) {
                insertAlert.run(
                    alert.id,
                    alert.serviceId,
                    alert.title,
                    alert.status,
                    alert.severity,
                    alert.createdAt,
                    alert.resolvedAt ?? null,
                );
            }

            const insertRunbook = this._db.prepare(`
                INSERT INTO runbooks (id, service_id, title, content)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING
            `);
            for (const runbook of seedRunbooks) {
                insertRunbook.run(runbook.id, runbook.serviceId, runbook.title, runbook.content);
            }
            this._db.exec("COMMIT");
        } catch (error) {
            try {
                this._db.exec("ROLLBACK");
            } catch (rollbackError) {
                throw new AggregateError([error, rollbackError], "SQLite seed failed and rollback was unsuccessful.");
            }
            throw error;
        }
    }

    private getIncident(id: string): Incident {
        const row = this._db.prepare(`
            SELECT id, title, service_id, severity, status, created_at, resolved_at, summary
            FROM incidents
            WHERE id = ?
        `).get(id);
        if (!row) {
            throw new Error("The incident was not available after the SQLite operation.");
        }
        return toIncident(row);
    }
}

export function createConfiguredSqliteOpsStore(
    options: SqliteOpsStoreOptions = {},
): SqliteOpsStore {
    return new SqliteOpsStore(process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH, options);
}
