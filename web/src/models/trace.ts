import { z } from "zod";

const node = z.string().min(1);
const knownTraceEventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("fallback"), node, from: z.string(), to: z.string() }),
    z.object({ type: z.literal("handoff"), node: z.literal("team"), from: z.enum(["supervisor", "analyst", "planner", "executor"]), to: z.enum(["analyst", "planner", "executor"]), brief: z.string().min(1) }),
    z.object({ type: z.literal("route"), node: z.literal("router"), route: z.enum(["react", "plan-and-execute", "reflect:react", "team"]), reason: z.string() }),
    z.object({ type: z.literal("thought"), node, summary: z.string() }),
    z.object({ type: z.literal("plan"), node, steps: z.array(z.string()) }),
    z.object({
        type: z.literal("action"),
        node,
        tool: z.string().min(1),
        args: z.record(z.string(), z.unknown()),
    }),
    z.object({ type: z.literal("observation"), node, result: z.unknown() }),
    z.object({ type: z.literal("critique"), node, summary: z.string() }),
    z.object({
        type: z.literal("summarize"),
        node,
        conversationId: z.string().min(1),
        summary: z.string(),
        summarizedThroughSequence: z.number().int().positive(),
    }),
    z.object({ type: z.literal("answer"), node, text: z.string() }),
]);

const unknownTraceEventSchema = z.object({
    type: z.string().min(1),
}).passthrough();

export const traceEventSchema = z.union([knownTraceEventSchema, unknownTraceEventSchema]);
export const traceSchema = z.array(traceEventSchema);
export type TraceEvent = z.infer<typeof traceEventSchema>;
