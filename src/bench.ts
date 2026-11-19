import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createPlanAndExecuteStrategy } from "./agents/plan-and-execute.js";
import type { ReasoningResult, ReasoningStrategy } from "./agents/reasoning.js";
import { createReactStrategy } from "./agents/react.js";
import { createOpsStore, type store as defaultStore } from "./agents/store.js";

type OpsStore = typeof defaultStore;
export type BenchmarkScenarioId = "C1" | "C2" | "C3";
export type BenchmarkStrategyName = "react" | "plan-and-execute";

type BenchmarkScenario = {
    id: BenchmarkScenarioId;
    request: string;
    isCorrect: (store: OpsStore, answer: string) => boolean;
};

type BenchmarkRow = {
    scenario: BenchmarkScenarioId;
    strategy: BenchmarkStrategyName;
    correct: boolean;
    IICalls: string;
    latencyMS: string;
};

type BenchmarkIO = {
    writeOut: (text: string) => void;
    writeError: (text: string) => void;
};

type BenchmarkOptions = {
    scenarios: BenchmarkScenarioId[];
    useReplanner: boolean;
};

type StrategyFactory = (
    name: BenchmarkStrategyName,
    store: OpsStore,
    useReplanner: boolean,
) => ReasoningStrategy;

const strategyNames: BenchmarkStrategyName[] = ["react", "plan-and-execute"];
const scenarioIds: BenchmarkScenarioId[] = ["C1", "C2", "C3"];

function answerIncludesCount(answer: string, count: number): boolean {
    if (new RegExp(`\\b${count}\\b`).test(answer)) {
        return true;
    }
    const words: Record<number, RegExp> = {
        1: /\b(um|uma|one)\b/i,
        2: /\b(dois|duas|two)\b/i,
    };
    return words[count]?.test(answer) ?? false;
}

const scenarios: BenchmarkScenario[] = [
    {
        id: "C1",
        request: "Quantos alertas críticos estão disparando?",
        isCorrect: (store, answer) => {
            const count = store.listAlerts("firing").filter(({ severity }) => severity === "sev1").length;
            return count === 1 && answerIncludesCount(answer, count);
        },
    },
    {
        id: "C2",
        request: "Abra três incidentes sev2 para checkout-api, payments-api e catalog-api, nessa mesma ordem, e resolva o primeiro.",
        isCorrect: (store) => {
            const servicesById = new Map(store.listServices().map(({ id, name }) => [id, name]));
            const incidents = store.listIncidents();
            const expectedServices = ["checkout-api", "payments-api", "catalog-api"];
            return incidents.length === expectedServices.length
                && incidents.every((incident, index) => (
                    servicesById.get(incident.serviceId) === expectedServices[index]
                    && incident.severity.toLowerCase() === "sev2"
                    && incident.status === (index === 0 ? "resolved" : "open")
                ));
        },
    },
    {
        id: "C3",
        request: "Dos alertas disparando, abra um incidente sev2 para o mais antigo e diga quantos alertas disparando sobraram sem incidente.",
        isCorrect: (store, answer) => {
            const firingAlerts = store.listAlerts("firing");
            const oldestAlert = [...firingAlerts].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
            const incidents = store.listIncidents();
            if (!oldestAlert || incidents.length !== 1) {
                return false;
            }
            const remaining = firingAlerts.filter(({ serviceId }) => (
                !incidents.some((incident) => incident.serviceId === serviceId)
            )).length;
            return incidents[0].serviceId === oldestAlert.serviceId
                && incidents[0].severity.toLowerCase() === "sev2"
                && incidents[0].status === "open"
                && answerIncludesCount(answer, remaining);
        },
    },
];

export function parseBenchmarkArguments(args: string[]): BenchmarkOptions {
    let selectedScenarios: BenchmarkScenarioId[] | undefined;
    let useReplanner = true;

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        let scenarioValue: string | undefined;
        if (argument === "--scenario") {
            scenarioValue = args[index + 1];
            if (!scenarioValue || scenarioValue.startsWith("--")) {
                throw new Error("--scenario requires C1, C2, or C3.");
            }
            index += 1;
        } else if (argument.startsWith("--scenario=")) {
            scenarioValue = argument.slice("--scenario=".length);
        } else if (argument === "--no-replanner") {
            useReplanner = false;
        } else if (argument.startsWith("--")) {
            throw new Error(`Unknown option: ${argument}`);
        } else {
            throw new Error(`Unexpected argument: ${argument}`);
        }

        if (scenarioValue !== undefined) {
            const parsed = scenarioValue.split(",").map((value) => value.trim().toUpperCase());
            const unknown = parsed.filter((value) => !scenarioIds.includes(value as BenchmarkScenarioId));
            if (unknown.length > 0) {
                throw new Error(`Unknown scenario: ${unknown.join(", ")}.`);
            }
            selectedScenarios = [...(selectedScenarios ?? []), ...parsed as BenchmarkScenarioId[]];
        }
    }

    return {
        scenarios: [...new Set(selectedScenarios ?? scenarioIds)],
        useReplanner,
    };
}

function createStrategy(name: BenchmarkStrategyName, store: OpsStore, useReplanner: boolean): ReasoningStrategy {
    if (name === "react") {
        return createReactStrategy({ store });
    }
    return createPlanAndExecuteStrategy({ store, useReplanner });
}

function formatTable(rows: BenchmarkRow[]): string {
    const headers = ["cenário", "estratégia", "acerto", "IICalls", "latencyMS"];
    const values = rows.map(({ scenario, strategy, correct, IICalls, latencyMS }) => [
        scenario,
        strategy,
        correct ? "sim" : "não",
        IICalls,
        latencyMS,
    ]);
    const widths = headers.map((header, index) => Math.max(header.length, ...values.map((row) => row[index].length)));
    const formatRow = (row: string[]) => row.map((value, index) => value.padEnd(widths[index])).join(" | ");
    const divider = widths.map((width) => "-".repeat(width)).join("-+-");
    return [formatRow(headers), divider, ...values.map(formatRow)].join("\n");
}

const consoleIO: BenchmarkIO = {
    writeOut: (text) => console.log(text),
    writeError: (text) => console.error(text),
};

export async function runBenchmark(
    args: string[],
    io: BenchmarkIO = consoleIO,
    strategyFactory: StrategyFactory = createStrategy,
): Promise<number> {
    let options: BenchmarkOptions;
    try {
        options = parseBenchmarkArguments(args);
    } catch (error) {
        io.writeError(error instanceof Error ? error.message : "Invalid benchmark arguments.");
        return 1;
    }

    const rows: BenchmarkRow[] = [];
    let exitCode = 0;
    for (const scenarioId of options.scenarios) {
        const scenario = scenarios.find(({ id }) => id === scenarioId);
        if (!scenario) {
            continue;
        }
        for (const strategyName of strategyNames) {
            const store = createOpsStore();
            try {
                const strategy = strategyFactory(strategyName, store, options.useReplanner);
                const result: ReasoningResult = await strategy.run({ request: scenario.request });
                rows.push({
                    scenario: scenario.id,
                    strategy: strategyName,
                    correct: scenario.isCorrect(store, result.answer),
                    IICalls: String(result.metrics.IICalls),
                    latencyMS: result.metrics.latencyMs.toFixed(2),
                });
            } catch (error) {
                exitCode = 1;
                io.writeError(`Scenario ${scenario.id} with ${strategyName} failed: ${error instanceof Error ? error.message : "strategy error"}`);
                rows.push({ scenario: scenario.id, strategy: strategyName, correct: false, IICalls: "-", latencyMS: "-" });
            }
            if (rows.at(-1)?.correct === false) {
                exitCode = 1;
            }
        }
    }

    io.writeOut(formatTable(rows));
    return exitCode;
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryUrl) {
    process.exitCode = await runBenchmark(process.argv.slice(2));
}