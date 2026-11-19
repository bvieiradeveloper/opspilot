import assert from "node:assert/strict";
import test from "node:test";
import { parseBenchmarkArguments, runBenchmark } from "./bench.js";
import type { ReasoningStrategy } from "./agents/reasoning.js";
import type { store as defaultStore } from "./agents/store.js";

type OpsStore = typeof defaultStore;

test("parses scenario filters and disables replanning", () => {
    assert.deepEqual(parseBenchmarkArguments(["--scenario", "C1,C3", "--no-replanner"]), {
        scenarios: ["C1", "C3"],
        useReplanner: false,
    });
    assert.deepEqual(parseBenchmarkArguments([]), {
        scenarios: ["C1", "C2", "C3"],
        useReplanner: true,
    });
    assert.throws(() => parseBenchmarkArguments(["--scenario", "C4"]), /Unknown scenario/);
});

test("runs all scenario-strategy pairs against isolated stores and prints one table", async () => {
    const stores: OpsStore[] = [];
    const replannerSettings: boolean[] = [];
    const output: string[] = [];
    const strategyFactory = (name: "react" | "plan-and-execute", store: OpsStore, useReplanner: boolean): ReasoningStrategy => {
        stores.push(store);
        replannerSettings.push(useReplanner);
        return {
            name,
            async run({ request }) {
                if (request.startsWith("Abra três incidentes")) {
                    const first = store.openIncident({ title: "Checkout", service: "checkout-api", severity: "sev2" });
                    store.openIncident({ title: "Payments", service: "payments-api", severity: "sev2" });
                    store.openIncident({ title: "Catalog", service: "catalog-api", severity: "sev2" });
                    store.resolveIncident(first.id);
                    return { answer: "Três incidentes abertos.", trace: [], metrics: { IICalls: 4, latencyMs: 12 } };
                }
                if (request.startsWith("Dos alertas")) {
                    const oldest = store.listAlerts("firing").sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
                    assert.ok(oldest);
                    const service = store.listServices().find(({ id }) => id === oldest.serviceId);
                    assert.ok(service);
                    store.openIncident({ title: "Oldest firing alert", service: service.name, severity: "sev2" });
                    return { answer: "Sobraram 2 alertas.", trace: [], metrics: { IICalls: 2, latencyMs: 8 } };
                }
                return { answer: "Há 1 alerta crítico disparando.", trace: [], metrics: { IICalls: 1, latencyMs: 4 } };
            },
        };
    };

    const exitCode = await runBenchmark([], {
        writeOut: (text) => output.push(text),
        writeError: (text) => output.push(text),
    }, strategyFactory);

    assert.equal(exitCode, 0);
    assert.equal(stores.length, 6);
    assert.equal(new Set(stores).size, 6);
    assert.deepEqual(replannerSettings, Array(6).fill(true));
    assert.match(output[0], /cenário\s+\| estratégia\s+\| acerto\s+\| IICalls\s+\| latencyMS/);
    assert.equal((output[0].match(/sim/g) ?? []).length, 6);
});

test("applies --scenario and --no-replanner to selected benchmark runs", async () => {
    const settings: Array<{ name: string; useReplanner: boolean }> = [];
    const output: string[] = [];
    const strategyFactory = (name: "react" | "plan-and-execute", _store: OpsStore, useReplanner: boolean): ReasoningStrategy => {
        settings.push({ name, useReplanner });
        return {
            name,
            async run() {
                return { answer: "Há 1 alerta crítico.", trace: [], metrics: { IICalls: 1, latencyMs: 1 } };
            },
        };
    };

    const exitCode = await runBenchmark(["--scenario=C1", "--no-replanner"], {
        writeOut: (text) => output.push(text),
        writeError: (text) => output.push(text),
    }, strategyFactory);

    assert.equal(exitCode, 0);
    assert.deepEqual(settings, [
        { name: "react", useReplanner: false },
        { name: "plan-and-execute", useReplanner: false },
    ]);
    assert.equal((output[0].match(/C1/g) ?? []).length, 2);
});