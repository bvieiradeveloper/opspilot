import type { Alert, Runbook, Service } from "../agents/domain.js";

export const seedServices: Service[] = [
    { id: "svc-payments", name: "payments-api", description: "Payment processing API", tier: "sev1" },
    { id: "svc-checkout", name: "checkout-api", description: "Customer checkout API", tier: "sev1" },
    { id: "svc-identity", name: "identity-service", description: "Authentication and identity", tier: "sev1" },
    { id: "svc-inventory", name: "inventory-worker", description: "Inventory background worker", tier: "sev2" },
    { id: "svc-notifications", name: "notification-service", description: "Customer notification delivery", tier: "sev3" },
];

export const seedAlerts: Alert[] = [
    { id: "alert-001", serviceId: "svc-payments", title: "Elevated payment latency", status: "firing", severity: "sev1", createdAt: "2026-09-30T08:00:00.000Z", resolvedAt: null },
    { id: "alert-002", serviceId: "svc-checkout", title: "Increased checkout failures", status: "firing", severity: "sev2", createdAt: "2026-09-30T08:05:00.000Z", resolvedAt: null },
    { id: "alert-003", serviceId: "svc-identity", title: "Authentication error rate", status: "firing", severity: "sev2", createdAt: "2026-09-30T08:10:00.000Z", resolvedAt: null },
    { id: "alert-004", serviceId: "svc-inventory", title: "Queue backlog", status: "resolved", severity: "sev3", createdAt: "2026-09-30T06:00:00.000Z", resolvedAt: "2026-09-30T07:00:00.000Z" },
    { id: "alert-005", serviceId: "svc-notifications", title: "Delayed notification delivery", status: "resolved", severity: "sev3", createdAt: "2026-09-30T05:00:00.000Z", resolvedAt: "2026-09-30T06:30:00.000Z" },
    { id: "alert-006", serviceId: "svc-payments", title: "Database connection saturation", status: "resolved", severity: "sev2", createdAt: "2026-09-30T04:00:00.000Z", resolvedAt: "2026-09-30T05:30:00.000Z" },
];

export const seedRunbooks: Runbook[] = [
    {
        id: "runbook-checkout",
        serviceId: "svc-checkout",
        title: "Checkout failures",
        content: "Check checkout-api health and recent deployments. Correlate failed requests with payment and identity dependencies, then roll back a recent faulty release if confirmed.",
    },
    {
        id: "runbook-payments",
        serviceId: "svc-payments",
        title: "Payment latency and failures",
        content: "Check payments-api latency, provider health, and connection saturation. Preserve transaction integrity; do not retry non-idempotent payment operations without verification.",
    },
    {
        id: "runbook-auth",
        serviceId: "svc-identity",
        title: "Authentication errors",
        content: "Check identity-service health, credential-provider availability, and recent configuration changes. Verify authentication recovery with a safe test account.",
    },
];
