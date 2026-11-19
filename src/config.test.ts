import assert from "node:assert/strict";
import test from "node:test";
import { parseWarRoomConfig, readOptionalWarRoomConfig } from "./config.js";

test("War Room configuration requires a non-empty operator and exact HTTP origins", () => {
    const config = parseWarRoomConfig({
        OPSPILOT_USER_ID: "  on-call  ",
        OPSPILOT_WEB_ORIGINS: "http://localhost:5173, https://console.example.com",
    });

    assert.deepEqual(config, {
        userId: "on-call",
        webOrigins: ["http://localhost:5173", "https://console.example.com"],
    });
});

test("War Room configuration rejects missing or invalid values explicitly", () => {
    assert.throws(() => parseWarRoomConfig({ OPSPILOT_WEB_ORIGINS: "http://localhost:5173" }), /OPSPILOT_USER_ID/);
    assert.throws(() => parseWarRoomConfig({ OPSPILOT_USER_ID: "  ", OPSPILOT_WEB_ORIGINS: "http://localhost:5173" }), /OPSPILOT_USER_ID/);
    assert.throws(() => parseWarRoomConfig({ OPSPILOT_USER_ID: "on-call", OPSPILOT_WEB_ORIGINS: "http://localhost:5173/path" }), /origin/);
    assert.throws(() => parseWarRoomConfig({ OPSPILOT_USER_ID: "on-call", OPSPILOT_WEB_ORIGINS: "file://console.example.com" }), /origin/);
    assert.throws(() => parseWarRoomConfig({ OPSPILOT_USER_ID: "on-call", OPSPILOT_WEB_ORIGINS: "" }), /OPSPILOT_WEB_ORIGINS/);
});

test("legacy mode remains available when no War Room configuration is supplied", () => {
    assert.equal(readOptionalWarRoomConfig({}), undefined);
    assert.throws(() => readOptionalWarRoomConfig({ OPSPILOT_USER_ID: "on-call" }), /OPSPILOT_WEB_ORIGINS/);
});
