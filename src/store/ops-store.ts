import type {
    Alert,
    AlertStatus,
    Incident,
    IncidentFilter,
    OpenIncidentInput,
    Runbook,
    Service,
} from "../agents/domain.js";

export interface OpsStore {
    listServices(): Service[];
    listAlerts(status?: AlertStatus | "all"): Alert[];
    listIncidents(filter?: IncidentFilter): Incident[];
    listRunbooks(service: string): Runbook[];
    openIncident(input: OpenIncidentInput): Incident;
    resolveIncident(id: string): Incident;
    close(): void;
}

export type { AlertStatus, IncidentFilter };
