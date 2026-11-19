import {
    alertSchema,
    incidentSchema,
    runbookSchema,
    serviceSchema,
    severitySchema,
    type Alert,
    type AlertStatus,
    type Incident,
    type IncidentFilter,
    type OpenIncidentInput,
    type Runbook,
    type Service,
} from "./domain.js";
import {
    IncidentAlreadyResolvedError,
    InvalidDomainInputError,
    UnknownIncidentError,
    UnknownServiceError,
} from "./errors.js";
import type { OpsStore } from "../store/ops-store.js";
import { seedAlerts, seedRunbooks, seedServices } from "../store/seed-data.js";

const benchmarkServices: Service[] = [
    ...seedServices,
    { id: "svc-catalog", name: "catalog-api", description: "Product catalog API", tier: "sev2" },
].map((service) => serviceSchema.parse(service));

export type StoreOptions = {
    clock?: () => Date;
};

export function createOpsStore(options: StoreOptions = {}): OpsStore {
    const clock = options.clock ?? (() => new Date());
    const services = benchmarkServices.map((service) => ({ ...service }));
    const alerts = seedAlerts.map((alert) => alertSchema.parse(alert));
    const runbooks = seedRunbooks.map((runbook) => runbookSchema.parse(runbook));
    const incidents: Incident[] = [];
    let nextIncidentId = 1;

    function listServices(): Service[] {
        return services.map((service) => ({ ...service }));
    }

    function listAlerts(status?: AlertStatus | "all"): Alert[] {
        return alerts
            .filter((alert) => status === undefined || status === "all" || alert.status === status)
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((alert) => ({ ...alert }));
    }

    function listIncidents(filter?: IncidentFilter): Incident[] {
        return incidents
            .filter((incident) => filter === undefined || filter === "all" || incident.status === filter)
            .map((incident) => ({ ...incident }));
    }

    function listRunbooks(service: string): Runbook[] {
        const serviceIdentifier = service.trim();
        const matchingService = services.find(({ id, name }) => name === serviceIdentifier || id === serviceIdentifier);
        if (!matchingService) {
            return [];
        }
        return runbooks
            .filter(({ serviceId }) => serviceId === matchingService.id)
            .map((runbook) => ({ ...runbook }));
    }

    function openIncident(input: OpenIncidentInput): Incident {
        const title = input.title.trim();
        const serviceName = input.service.trim();
        const severity = severitySchema.safeParse(input.severity.trim());
        if (!title || !serviceName || !severity.success) {
            throw new InvalidDomainInputError(
                "Incident title, service, and severity (sev1, sev2, or sev3) are required.",
            );
        }
        const service = services.find(({ id, name }) => name === serviceName || id === serviceName);
        if (!service) {
            throw new UnknownServiceError("The requested service does not exist.");
        }
        const incident = incidentSchema.parse({
            id: `incident-${String(nextIncidentId++).padStart(3, "0")}`,
            title,
            serviceId: service.id,
            severity: severity.data,
            status: "open",
            createdAt: clock().toISOString(),
            resolvedAt: null,
            summary: null,
        });
        incidents.push(incident);
        return { ...incident };
    }

    function resolveIncident(id: string): Incident {
        const normalizedId = id.trim();
        if (!normalizedId) {
            throw new InvalidDomainInputError("Incident id is required.");
        }
        const incidentIndex = incidents.findIndex(({ id: incidentId }) => incidentId === normalizedId);
        if (incidentIndex < 0) {
            throw new UnknownIncidentError("The requested incident does not exist.");
        }
        const incident = incidents[incidentIndex];
        if (incident.status === "resolved") {
            throw new IncidentAlreadyResolvedError("The incident is already resolved.");
        }
        const resolvedIncident = incidentSchema.parse({
            ...incident,
            status: "resolved",
            resolvedAt: clock().toISOString(),
        });
        incidents[incidentIndex] = resolvedIncident;
        return { ...resolvedIncident };
    }

    return {
        listServices,
        listAlerts,
        listIncidents,
        listRunbooks,
        openIncident,
        resolveIncident,
        close() {},
    };
}

export const store = createOpsStore();
