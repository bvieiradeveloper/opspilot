import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { OpsStore } from "../store/ops-store.js";
import { createConfiguredSqliteOpsStore } from "../store/sqlite-ops-store.js";

export function getSeedSummary(store: OpsStore) {
    const alerts = store.listAlerts();
    return {
        services: store.listServices().length,
        alerts: alerts.length,
        firing: alerts.filter(({ status }) => status === "firing").length,
        resolved: alerts.filter(({ status }) => status === "resolved").length,
    };
}

export function runSeed(): void {
    const store = createConfiguredSqliteOpsStore();
    try {
        const summary = getSeedSummary(store);
        console.log(`Seed ready: ${summary.services} services, ${summary.alerts} alerts (${summary.firing} firing, ${summary.resolved} resolved).`);
    } finally {
        store.close();
    }
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryUrl) {
    runSeed();
}