import assert from "node:assert/strict";
import test from "node:test";
import { apiBaseUrlSchema, joinApiEndpoint, readPreferences, savePreferences } from "./preferences.js";

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
}

test("API URL validation accepts absolute HTTP(S) origins and rejects unsafe URL components", () => {
    assert.equal(apiBaseUrlSchema.parse("https://api.example.com/"), "https://api.example.com");
    for (const value of ["", "ftp://api.example.com", "javascript:alert(1)", "https://u:p@api.example.com", "https://api.example.com?q=x", "https://api.example.com/#x"]) {
        assert.throws(() => apiBaseUrlSchema.parse(value));
    }
});

test("preferences persist only validated settings and invalid saves preserve prior values", () => {
    const storage = new MemoryStorage();
    const saved = savePreferences({ apiBaseUrl: "https://api.example.com/", theme: "dark" }, storage);
    assert.deepEqual(saved, { apiBaseUrl: "https://api.example.com", theme: "dark" });
    assert.deepEqual(readPreferences(storage), saved);
    assert.throws(() => savePreferences({ apiBaseUrl: "https://bad.example/?token=x", theme: "light" }, storage));
    assert.deepEqual(readPreferences(storage), saved);
});

test("malformed persisted preferences fail explicitly instead of switching API origins", () => {
    const storage = new MemoryStorage();
    storage.setItem("opspilot.war-room.preferences", JSON.stringify({
        apiBaseUrl: "https://api.example.com/?other=service",
        theme: "system",
    }));
    assert.throws(() => readPreferences(storage), /Saved War Room settings are invalid/);
});

test("endpoint joining normalizes the base path without query or fragment injection", () => {
    assert.equal(joinApiEndpoint("https://api.example.com/", "/chat"), "https://api.example.com/chat");
    assert.throws(() => joinApiEndpoint("https://api.example.com", "//evil.example"));
});
