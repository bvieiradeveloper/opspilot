import assert from "node:assert/strict";
import test from "node:test";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { createOpsTools } from "./tools.js";

test("list_alerts filters firing, resolved, or all SQLite alerts", async () => {
    const store = new SqliteOpsStore(":memory:");
    try {
        const [listAlerts] = createOpsTools(store);

        const firing = JSON.parse(String(await listAlerts.invoke({ status: "firing" })));
        const resolved = JSON.parse(String(await listAlerts.invoke({ status: "resolved" })));
        const all = JSON.parse(String(await listAlerts.invoke({ status: "all" })));

        assert.equal(firing.length, 3);
        assert.ok(firing.every((alert: { status: string }) => alert.status === "firing"));
        assert.equal(resolved.length, 3);
        assert.ok(resolved.every((alert: { status: string }) => alert.status === "resolved"));
        assert.equal(all.length, 6);
    } finally {
        store.close();
    }
});

test("incident tools validate, open, list, and resolve persisted incidents", async () => {
    const store = new SqliteOpsStore(":memory:");
    try {
        const [, openIncident, resolveIncident, listIncidents] = createOpsTools(store);

        await assert.rejects(() => openIncident.invoke({ title: "", service: "payments-api", severity: "sev2" }));
        await assert.rejects(() => openIncident.invoke({ title: "Incident", service: "missing", severity: "sev2" }));
        await assert.rejects(() => openIncident.invoke({
            title: "Incident",
            service: "payments-api",
            severity: "critical" as never,
        }));
        assert.equal(store.listIncidents().length, 0);

        const first = JSON.parse(String(await openIncident.invoke({
            title: "Payment latency",
            service: "payments-api",
            severity: "sev1",
        })));
        const second = JSON.parse(String(await openIncident.invoke({
            title: "Checkout failures",
            service: "svc-checkout",
            severity: "sev2",
        })));
        assert.equal(first.status, "open");
        assert.equal(first.resolvedAt, null);
        assert.equal(first.summary, null);

        const defaultOpen = JSON.parse(String(await listIncidents.invoke({})));
        assert.deepEqual(defaultOpen.map((incident: { id: string }) => incident.id), [first.id, second.id]);
        const resolved = JSON.parse(String(await resolveIncident.invoke({ id: first.id })));
        assert.equal(resolved.status, "resolved");
        assert.equal(resolved.summary, null);
        await assert.rejects(() => resolveIncident.invoke({ id: first.id }));
        await assert.rejects(() => resolveIncident.invoke({ id: "missing" }));

        assert.deepEqual(JSON.parse(String(await listIncidents.invoke({ status: "open" }))).map(
            (incident: { id: string }) => incident.id,
        ), [second.id]);
        assert.deepEqual(JSON.parse(String(await listIncidents.invoke({ status: "resolved" }))).map(
            (incident: { id: string }) => incident.id,
        ), [first.id]);
        assert.deepEqual(JSON.parse(String(await listIncidents.invoke({ status: "all" }))).map(
            (incident: { id: string }) => incident.id,
        ), [first.id, second.id]);
        assert.deepEqual(await listIncidents.invoke({ status: "mitigated" }), "[]");
        await assert.rejects(() => listIncidents.invoke({ status: "invalid" } as never));
    } finally {
        store.close();
    }
});

test("runbook tool returns only guidance for the requested service", async () => {
    const store = new SqliteOpsStore(":memory:");
    try {
        const [, , , , consultarRunbooks] = createOpsTools(store);
        for (const service of ["checkout-api", "svc-payments", "identity-service"]) {
            const runbooks = JSON.parse(String(await consultarRunbooks.invoke({ service })));
            assert.equal(runbooks.length, 1);
            const matchingService = store.listServices().find((item) => item.name === service || item.id === service);
            assert.equal(runbooks[0].serviceId, matchingService?.id);
        }
        assert.deepEqual(JSON.parse(String(await consultarRunbooks.invoke({ service: "inventory-worker" }))), []);
        assert.deepEqual(JSON.parse(String(await consultarRunbooks.invoke({ service: "missing" }))), []);
        await assert.rejects(() => consultarRunbooks.invoke({ service: "" }));
        assert.match(consultarRunbooks.description, /service/i);
    } finally {
        store.close();
    }
});

test("tool schemas reject invalid closed status and severity values", async () => {
    const store = new SqliteOpsStore(":memory:");
    try {
        const [listAlerts, openIncident, , listIncidents] = createOpsTools(store);
        await assert.rejects(() => listAlerts.invoke({ status: "invalid" } as never));
        await assert.rejects(() => listIncidents.invoke({ status: "invalid" } as never));
        await assert.rejects(() => openIncident.invoke({
            title: "Invalid severity",
            service: "payments-api",
            severity: "sev4",
        } as never));
    } finally {
        store.close();
    }
});

test("check_provider_status defaults to GitHub and returns a compact status observation", async () => {
    const store = new SqliteOpsStore(":memory:");
    const requests: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
        requests.push({ url: String(input), signal: init?.signal as AbortSignal | null | undefined });
        return new Response(JSON.stringify({
            status: { indicator: "none", description: "All systems\noperational" },
        }), { status: 200 });
    };

    try {
        const [, , , , , checkProviderStatus] = createOpsTools(store, fakeFetch);
        const result = await checkProviderStatus.invoke({});

        assert.equal(String(result), "github is none - All systems operational");
        assert.ok(!String(result).includes("\n"));
        assert.equal(requests.length, 1);
        assert.equal(requests[0]?.url, "https://www.githubstatus.com/api/v2/status.json");
        assert.ok(requests[0]?.signal instanceof AbortSignal);
        assert.match(checkProviderStatus.description, /external dependency|provider/i);
        assert.match(checkProviderStatus.description, /internal/i);
        assert.match(checkProviderStatus.description, /outage|unavailable|suspect/i);
    } finally {
        store.close();
    }
});

test("check_provider_status supports Cloudflare and rejects unsupported providers", async () => {
    const store = new SqliteOpsStore(":memory:");
    const requests: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
        requests.push(String(input));
        return new Response(JSON.stringify({
            status: { indicator: "minor", description: "Elevated errors" },
        }), { status: 200 });
    };

    try {
        const [, , , , , checkProviderStatus] = createOpsTools(store, fakeFetch);
        const result = await checkProviderStatus.invoke({ provider: "cloudflare" });

        assert.equal(String(result), "cloudflare is minor - Elevated errors");
        assert.deepEqual(requests, ["https://www.cloudflarestatus.com/api/v2/status.json"]);
        await assert.rejects(() => checkProviderStatus.invoke({ provider: "claudeflare" } as never));
    } finally {
        store.close();
    }
});

test("check_provider_status retries timeout, network, and server errors only once", async () => {
    const originalTimeout = AbortSignal.timeout;
    const timeoutDurations: number[] = [];
    AbortSignal.timeout = (milliseconds) => {
        timeoutDurations.push(milliseconds);
        return originalTimeout(milliseconds);
    };
    const transientFailures: Array<{
        name: string;
        fail: () => Response | never;
    }> = [
        { name: "timeout", fail: () => { throw new DOMException("timed out", "TimeoutError"); } },
        { name: "network", fail: () => { throw new TypeError("network unavailable"); } },
        { name: "server error", fail: () => new Response(null, { status: 503 }) },
    ];

    try {
        for (const failure of transientFailures) {
            const store = new SqliteOpsStore(":memory:");
            const signals: Array<AbortSignal | null | undefined> = [];
            let calls = 0;
            const fakeFetch: typeof fetch = async (_input, init) => {
                calls += 1;
                signals.push(init?.signal as AbortSignal | null | undefined);
                if (calls === 1) {
                    return failure.fail();
                }
                return new Response(JSON.stringify({
                    status: { indicator: "none", description: "All systems operational" },
                }), { status: 200 });
            };

            try {
                const [, , , , , checkProviderStatus] = createOpsTools(store, fakeFetch);
                assert.equal(
                    String(await checkProviderStatus.invoke({})),
                    "github is none - All systems operational",
                    failure.name,
                );
                assert.equal(calls, 2, failure.name);
                assert.ok(signals.every((signal) => signal instanceof AbortSignal), failure.name);
                assert.notEqual(signals[0], signals[1], failure.name);
            } finally {
                store.close();
            }
        }
        assert.deepEqual(timeoutDurations, Array.from({ length: 6 }, () => 5000));
    } finally {
        AbortSignal.timeout = originalTimeout;
    }
});

test("check_provider_status returns readable errors for final failures without retrying invalid data", async () => {
    const store = new SqliteOpsStore(":memory:");
    try {
        let retryCalls = 0;
        const retryFailureFetch: typeof fetch = async () => {
            retryCalls += 1;
            throw new TypeError("network unavailable");
        };
        const [, , , , , retryTool] = createOpsTools(store, retryFailureFetch);
        const retryResult = String(await retryTool.invoke({}));
        assert.match(retryResult, /could not retrieve github status/i);
        assert.match(retryResult, /network unavailable/i);
        assert.match(retryResult, /internal alerts/i);
        assert.equal(retryCalls, 2);

        let invalidCalls = 0;
        const invalidFetch: typeof fetch = async () => {
            invalidCalls += 1;
            return new Response(JSON.stringify({ status: { indicator: "none" } }), { status: 200 });
        };
        const [, , , , , invalidTool] = createOpsTools(store, invalidFetch);
        assert.match(String(await invalidTool.invoke({})), /invalid status response/i);
        assert.equal(invalidCalls, 1);

        let httpCalls = 0;
        const clientErrorFetch: typeof fetch = async () => {
            httpCalls += 1;
            return new Response(null, { status: 404 });
        };
        const [, , , , , httpErrorTool] = createOpsTools(store, clientErrorFetch);
        assert.match(String(await httpErrorTool.invoke({})), /HTTP 404/);
        assert.equal(httpCalls, 1);
    } finally {
        store.close();
    }
});
