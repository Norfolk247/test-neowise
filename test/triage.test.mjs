
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../server.mjs";

describe("POST /api/triage", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createAppServer();

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it("returns manual_review when AI provider fails", async () => {
    const response = await fetch(`${baseUrl}/api/triage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "[error]",
      }),
    });

    assert.equal(response.status, 200);

    assert.deepEqual(await response.json(), {
      status: "manual_review",
      topic: null,
      draft: null,
    });
  });

  it("returns manual_review when AI times out", async () => {
    const start = Date.now();

    const response = await fetch(`${baseUrl}/api/triage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "[timeout]",
      }),
    });

    const elapsed = Date.now() - start;

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "manual_review",
      topic: null,
      draft: null,
    });

    assert.ok(elapsed < 1000, `Request took ${elapsed}ms`);
  });

  it("rejects empty input", async () => {
    const response = await fetch(`${baseUrl}/api/triage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "   " }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      status: "invalid_input",
    });
  });
});
