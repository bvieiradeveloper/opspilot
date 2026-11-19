import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";

test("the production build uses the configured /opspilot/ asset prefix", async () => {
    const html = await readFile(resolve("web/dist/index.html"), "utf8");
    assert.match(html, /\/opspilot\/assets\/.+\.js/);
    assert.match(html, /\/opspilot\/assets\/.+\.css/);
});
