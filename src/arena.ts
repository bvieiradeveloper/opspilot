import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { strategyRegistry } from "./agents/index.js";
import { ModelConfigurationError } from "./agents/model.js";
import type { ReasoningStrategy } from "./agents/reasoning.js";
import { withReflection } from "./agents/reflection.js";
import { formatTrace } from "./agents/trace.js";

const baseStrategies = [...strategyRegistry.values()];
const registeredStrategies: ReasoningStrategy[] = [
    ...baseStrategies,
    ...baseStrategies.map((strategy) => withReflection(strategy)),
];

const arenaOptionsSchema = z.object({
    request: z.string().trim().min(1, "A non-empty request is required."),
    strategies: z.array(z.string().trim().min(1)).optional(),
    maxIterations: z.number().int().min(1).max(8),
});

export type ArenaIO = {
    writeOut: (text: string) => void;
    writeError: (text: string) => void;
};

const consoleIO: ArenaIO = {
    writeOut: (text) => console.log(text),
    writeError: (text) => console.error(text),
};

function parseArguments(args: string[]) {
    const requestParts: string[] = [];
    let requestedStrategies: string[] | undefined;
    let maxIterations = 8;

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === "--strategies") {
            const value = args[index + 1];
            if (!value || value.startsWith("--")) {
                throw new Error("--strategies requires a comma-separated value.");
            }
            requestedStrategies = value.split(",").map((name) => name.trim());
            index += 1;
        } else if (argument.startsWith("--strategies=")) {
            requestedStrategies = argument.slice("--strategies=".length).split(",").map((name) => name.trim());
        } else if (argument === "--max-iterations") {
            const value = args[index + 1];
            if (!value || value.startsWith("--")) {
                throw new Error("--max-iterations requires an integer from 1 to 8.");
            }
            maxIterations = Number(value);
            index += 1;
        } else if (argument.startsWith("--max-iterations=")) {
            maxIterations = Number(argument.slice("--max-iterations=".length));
        } else if (argument.startsWith("--")) {
            throw new Error(`Unknown option: ${argument}`);
        } else {
            requestParts.push(argument);
        }
    }

    return arenaOptionsSchema.parse({
        request: requestParts.join(" "),
        strategies: requestedStrategies,
        maxIterations,
    });
}

export async function runArena(
    args: string[],
    strategies: readonly ReasoningStrategy[] = registeredStrategies,
    io: ArenaIO = consoleIO,
): Promise<number> {
    let options: ReturnType<typeof parseArguments>;
    try {
        options = parseArguments(args);
    } catch (error) {
        io.writeError(error instanceof z.ZodError
            ? error.issues.map(({ message }) => message).join(" ")
            : error instanceof Error ? error.message : "Invalid arena arguments.");
        return 1;
    }

    const selectedNames = options.strategies ?? strategies
        .filter(({ name }) => !name.startsWith("reflect:"))
        .map(({ name }) => name);
    const strategiesByName = new Map(strategies.map((strategy) => [strategy.name, strategy]));
    const unknown = selectedNames.filter((name) => !strategiesByName.has(name));
    if (unknown.length > 0) {
        io.writeError(`Unknown strategy: ${unknown.join(", ")}.`);
        return 1;
    }

    let exitCode = 0;
    for (const name of selectedNames) {
        const strategy = strategiesByName.get(name);
        if (!strategy) {
            continue;
        }
        try {
            const result = await strategy.run({
                request: options.request,
                maxIterations: options.maxIterations,
            });
            io.writeOut([
                `Strategy: ${strategy.name}`,
                `Answer: ${result.answer}`,
                "Trace:",
                formatTrace(result.trace),
                `Metrics: IICalls=${result.metrics.IICalls} latencyMs=${result.metrics.latencyMs.toFixed(2)}`,
            ].join("\n"));
        } catch (error) {
            exitCode = 1;
            io.writeError(error instanceof ModelConfigurationError
                ? `Strategy ${strategy.name} failed. ${error.message}`
                : `Strategy ${strategy.name} failed. Check its configuration and retry.`);
        }
    }
    return exitCode;
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryUrl) {
    process.exitCode = await runArena(process.argv.slice(2));
}