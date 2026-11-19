import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createStrategyRegistry, createWarRoomStrategyRegistry } from "./agents/index.js";
import { startChatServer } from "./http/server.js";
import { createConfiguredSqliteOpsStore } from "./store/sqlite-ops-store.js";
import { createConfiguredSqliteConversationStore } from "./store/sqlite-conversation-store.js";
import { readOptionalWarRoomConfig } from "./config.js";
import { createConfiguredSqliteApprovalStore } from "./store/sqlite-approval-store.js";
import { ApprovalService } from "./services/approval-service.js";

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryUrl) {
    const store = createConfiguredSqliteOpsStore();
    const conversationStore = createConfiguredSqliteConversationStore();
    const warRoomConfig = readOptionalWarRoomConfig(process.env);
    const approvalStore = warRoomConfig ? createConfiguredSqliteApprovalStore() : undefined;
    const approvalService = approvalStore
        ? new ApprovalService({ store: approvalStore, operations: store })
        : undefined;
    const server = startChatServer({
        strategies: createStrategyRegistry(store),
        conversationStore,
        warRoomConfig,
        approvalService,
        warRoomStrategiesFactory: warRoomConfig
            ? (onProposal) => createWarRoomStrategyRegistry(store, onProposal)
            : undefined,
    });
    server.on("close", () => {
        store.close();
        conversationStore.close();
        approvalStore?.close();
    });
}
