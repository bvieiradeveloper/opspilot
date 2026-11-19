import assert from "node:assert/strict";
import test from "node:test";
import { createOpsStore } from "./store.js";

test("seed creates six services and six alerts with stable relationships", () => {
    const store = createOpsStore();
    const services = store.listServices();
    const alerts = store.listAlerts();

    assert.equal(services.length, 6);
    assert.ok(services.every(({ tier }) => ["sev1", "sev2", "sev3"].includes(tier)));
    assert.equal(new Set(services.map(({ id }) => id)).size, 6);
    assert.equal(new Set(services.map(({ name }) => name)).size, 6);
    assert.ok(services.some(({ name }) => name === "catalog-api"));
    assert.equal(alerts.length, 6);
    assert.equal(alerts.filter(({ status }) => status === "firing").length, 3);
    assert.equal(alerts.filter(({ status }) => status === "resolved").length, 3);
    assert.ok(alerts.every(({ serviceId }) => services.some(({ id }) => id === serviceId)));
});

test("seeded records are deterministic across independent stores", () => {
    const firstStore = createOpsStore();
    const secondStore = createOpsStore();

    assert.deepEqual(firstStore.listServices(), secondStore.listServices());
    assert.deepEqual(firstStore.listAlerts(), secondStore.listAlerts());
});

test("incident mutations validate references and transition open incidents once", () => {
    const store = createOpsStore({ clock: () => new Date("2026-09-30T12:00:00.000Z") });
    const incident = store.openIncident({
        title: "  Payment latency  ",
        service: "payments-api",
        severity: "  sev2  ",
    });

    assert.equal(incident.title, "Payment latency");
    assert.equal(incident.severity, "sev2");
    assert.equal(incident.status, "open");
    assert.equal(incident.resolvedAt, null);
    assert.equal(incident.summary, null);
    assert.equal(incident.createdAt, "2026-09-30T12:00:00.000Z");
    assert.equal(store.resolveIncident(incident.id).status, "resolved");
    assert.throws(() => store.resolveIncident(incident.id));
    assert.throws(() => store.openIncident({ title: "", service: "payments-api", severity: "sev2" }));
    assert.throws(() => store.openIncident({ title: "Incident", service: "missing-service", severity: "sev2" }));
    assert.throws(() => store.openIncident({ title: "Incident", service: "payments-api", severity: "critical" as never }));
    assert.equal(store.listRunbooks("checkout-api").length, 1);
    assert.equal(store.listRunbooks("svc-checkout").length, 1);
    assert.deepEqual(store.listRunbooks("inventory-worker"), []);
    const incidentByServiceId = store.openIncident({
        title: "Checkout latency",
        service: "svc-checkout",
        severity: "sev2",
    });
    assert.equal(incidentByServiceId.serviceId, "svc-checkout");
});