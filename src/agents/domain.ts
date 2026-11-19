import { z } from "zod";

export const serviceSchema = z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string(),
    tier: z.enum(["sev1", "sev2", "sev3"]),
});

export const alertStatusSchema = z.enum(["firing", "resolved"]);
export const severitySchema = z.enum(["sev1", "sev2", "sev3"]);

export const alertSchema = z.object({
    id: z.string().trim().min(1),
    serviceId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    status: alertStatusSchema,
    severity: severitySchema,
    createdAt: z.string().datetime(),
    resolvedAt: z.string().datetime().nullable().optional(),
});

export const incidentStatusSchema = z.enum(["open", "mitigated", "resolved"]);

export const incidentSchema = z.object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    serviceId: z.string().trim().min(1),
    severity: severitySchema,
    status: incidentStatusSchema,
    createdAt: z.string().datetime(),
    resolvedAt: z.string().datetime().nullable(),
    summary: z.string().nullable(),
});

export const runbookSchema = z.object({
    id: z.string().trim().min(1),
    serviceId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    content: z.string().trim().min(1),
});

export type Service = z.infer<typeof serviceSchema>;
export type ServiceTier = z.infer<typeof serviceSchema>["tier"];
export type Alert = z.infer<typeof alertSchema>;
export type AlertStatus = z.infer<typeof alertStatusSchema>;
export type Severity = z.infer<typeof severitySchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;
export type Runbook = z.infer<typeof runbookSchema>;
export type IncidentFilter = IncidentStatus | "all";

export type OpenIncidentInput = {
    title: string;
    service: string;
    severity: string;
};