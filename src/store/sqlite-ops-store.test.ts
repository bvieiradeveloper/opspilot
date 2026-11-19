import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SqliteOpsStore } from "./sqlite-ops-store.js";

function withTemporaryDatabase(run: (databasePath: string) => void): void {
    const directory = mkdtempSync(join(tmpdir(), "opspilot-sqlite-"));
    try {
        run(join(directory, "nested", "opspilot.db"));
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

test("SQLite memory stores seed isolated canonical services, alerts, and runbooks", () => {
    const first = new SqliteOpsStore(":memory:");
    const second = new SqliteOpsStore(":memory:");
    try {
        assert.equal(first.listServices().length, 5);
        assert.equal(first.listAlerts().length, 6);
        assert.equal(first.listAlerts("firing").length, 3);
        assert.equal(first.listAlerts("resolved").length, 3);
        assert.equal(first.listRunbooks("checkout-api").length, 1);
        assert.equal(first.listRunbooks("payments-api").length, 1);
        assert.equal(first.listRunbooks("identity-service").length, 1);
        assert.equal(first.listRunbooks("inventory-worker").length, 0);
        assert.equal(second.listIncidents().length, 0);
    } finally {
        first.close();
        second.close();
    }
});

test("SQLite schema and seed initialization are idempotent across file-backed reopens", () => {
    withTemporaryDatabase((databasePath) => {
        const first = new SqliteOpsStore(databasePath);
        first.close();

        const second = new SqliteOpsStore(databasePath);
        try {
            const db = new DatabaseSync(databasePath);
            try {
                const tables = db.prepare(
                    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
                ).all().map((row) => row.name);
                assert.deepEqual(tables, ["alerts", "incidents", "runbooks", "services"]);
            } finally {
                db.close();
            }
            assert.equal(second.listServices().length, 5);
            assert.equal(second.listAlerts().length, 6);
            assert.equal(second.listRunbooks("checkout-api").length, 1);
        } finally {
            second.close();
        }
    });
});

test("incident state survives resolution and reopening the SQLite store", () => {
    withTemporaryDatabase((databasePath) => {
        const first = new SqliteOpsStore(databasePath, {
            clock: () => new Date("2026-10-13T12:00:00.000Z"),
        });
        const incident = first.openIncident({
            title: "Payment latency",
            service: "payments-api",
            severity: "sev2",
        });
        assert.equal(incident.status, "open");
        assert.equal(incident.resolvedAt, null);
        assert.equal(incident.summary, null);
        const resolved = first.resolveIncident(incident.id);
        assert.equal(resolved.status, "resolved");
        assert.equal(resolved.resolvedAt, "2026-10-13T12:00:00.000Z");
        assert.equal(resolved.summary, null);
        first.close();

        const reopened = new SqliteOpsStore(databasePath);
        try {
            assert.deepEqual(reopened.listIncidents(), [resolved]);
        } finally {
            reopened.close();
        }
    });
});

test("mitigated is a closed, filterable incident state without a transition tool", () => {
    withTemporaryDatabase((databasePath) => {
        const store = new SqliteOpsStore(databasePath);
        try {
            const db = new DatabaseSync(databasePath);
            try {
                db.prepare(`
                    INSERT INTO incidents
                        (id, title, service_id, severity, status, created_at, resolved_at, summary)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    "incident-mitigated",
                    "Checkout mitigated",
                    "svc-checkout",
                    "sev2",
                    "mitigated",
                    "2026-10-13T11:00:00.000Z",
                    null,
                    null,
                );
            } finally {
                db.close();
            }
            assert.equal(store.listIncidents("mitigated").length, 1);
            assert.equal(store.listIncidents("open").length, 0);
            assert.equal(store.listIncidents("all").length, 1);
        } finally {
            store.close();
        }
    });
});

test("SQLite CHECK constraints reject invalid closed domain values", () => {
    withTemporaryDatabase((databasePath) => {
        const store = new SqliteOpsStore(databasePath);
        try {
            const db = new DatabaseSync(databasePath);
            try {
                assert.throws(() => db.prepare(
                    "INSERT INTO services (id, name, description, tier) VALUES (?, ?, ?, ?)",
                ).run("bad-tier", "bad-tier-service", "", "sev4"));
                assert.throws(() => db.prepare(`
                    INSERT INTO alerts
                        (id, service_id, title, status, severity, created_at, resolved_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run("bad-alert-status", "svc-payments", "bad", "muted", "sev1", "2026-10-13T00:00:00.000Z", null));
                assert.throws(() => db.prepare(`
                    INSERT INTO alerts
                        (id, service_id, title, status, severity, created_at, resolved_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run("bad-alert-severity", "svc-payments", "bad", "firing", "critical", "2026-10-13T00:00:00.000Z", null));
                assert.throws(() => db.prepare(`
                    INSERT INTO incidents
                        (id, title, service_id, severity, status, created_at, resolved_at, summary)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run("bad-incident-severity", "bad", "svc-payments", "sev4", "open", "2026-10-13T00:00:00.000Z", null, null));
                assert.throws(() => db.prepare(`
                    INSERT INTO incidents
                        (id, title, service_id, severity, status, created_at, resolved_at, summary)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run("bad-incident-status", "bad", "svc-payments", "sev1", "closed", "2026-10-13T00:00:00.000Z", null, null));
            } finally {
                db.close();
            }
        } finally {
            store.close();
        }
    });
});
