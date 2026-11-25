import { z } from "zod";
import type { TraceEvent } from "../agents/reasoning.js";

export const teamRoleSchema = z.enum(["analyst", "planner", "executor"]);
export type TeamRole = z.infer<typeof teamRoleSchema>;

export const supervisorNextSchema = z.enum([
    "analyst",
    "planner",
    "executor",
    "done",
    "out_of_scope",
]);
export type SupervisorNext = z.infer<typeof supervisorNextSchema>;

export const supervisorDecisionSchema = z.object({
    next: supervisorNextSchema,
    brief: z.string().trim().min(1),
});
export type SupervisorDecision = z.infer<typeof supervisorDecisionSchema>;

export const roleAssignmentSchema = z.object({
    role: teamRoleSchema,
    brief: z.string().trim().min(1),
});
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

export const incidentBlackboardSchema = z.object({
    request: z.string().trim().min(1),
    findings: z.array(z.string().trim().min(1)).default([]),
    plan: z.array(z.string().trim().min(1)).default([]),
    executionResults: z.array(z.object({
        tool: z.enum(["open_incident", "resolve_incident"]),
        status: z.enum(["approval_pending", "completed", "blocked"]),
        summary: z.string().trim().min(1),
    })).default([]),
    openQuestions: z.array(z.string().trim().min(1)).default([]),
});
export type IncidentBlackboard = z.infer<typeof incidentBlackboardSchema>;

export type TeamRoleResult = {
    findings?: string[];
    plan?: string[];
    executionResults?: IncidentBlackboard["executionResults"];
    openQuestions?: string[];
    trace?: TraceEvent[];
};

export const teamRunOutcomeSchema = z.enum([
    "running",
    "completed",
    "handoff_limit",
    "blocked",
    "out_of_scope",
]);
export type TeamRunOutcome = z.infer<typeof teamRunOutcomeSchema>;

export const teamRunStateSchema = z.object({
    request: z.string().trim().min(1),
    currentRole: teamRoleSchema.nullable(),
    handoffCount: z.number().int().min(0).max(8),
    blackboard: incidentBlackboardSchema,
    answer: z.string(),
    outcome: teamRunOutcomeSchema,
});
export type TeamRunState = z.infer<typeof teamRunStateSchema>;
