import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));

const VALID_TOPICS = new Set(["delivery", "pricing", "other"]);
const AI_TIMEOUT_MS = 300;

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function manualReview(response) {
  return json(response, 200, {
    status: "manual_review",
    topic: null,
    draft: null,
  });
}

async function handleTriage(request, response) {
  // 1. Parse and validate input
  let body;

  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);

    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json(response, 400, { status: "invalid_input" });
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.text !== "string" ||
    !body.text.trim()
  ) {
    return json(response, 400, { status: "invalid_input" });
  }

  // 2. Call AI with a strict timeout
  const controller = new AbortController();
  let timeout;

  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("AI request timed out"));
      }, AI_TIMEOUT_MS);
    });

    const modelPromise = classify(body.text, {
      signal: controller.signal,
    });

    const output = await Promise.race([
      modelPromise,
      timeoutPromise,
    ]);

    // 3. Validate AI output
    if (typeof output !== "string") {
      return manualReview(response);
    }

    const result = JSON.parse(output);

    if (
      !result ||
      typeof result !== "object" ||
      !VALID_TOPICS.has(result.topic) ||
      typeof result.draft !== "string" ||
      !result.draft.trim()
    ) {
      return manualReview(response);
    }

    return json(response, 200, {
      status: "ready",
      topic: result.topic,
      draft: result.draft,
    });
  } catch {
    return manualReview(response);
  } finally {
    clearTimeout(timeout);
  }
}

export function createAppServer() {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(html);
      return;
    }

    if (
      request.method !== "POST" ||
      request.url !== "/api/triage"
    ) {
      return json(response, 404, { status: "not_found" });
    }

    try {
      await handleTriage(request, response);
    } catch {
      if (!response.headersSent) {
        json(response, 500, { status: "server_error" });
      }
    }
  });
}

// Start only when executed directly, not when imported by tests.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  createAppServer().listen(
    Number(process.env.PORT || 3000),
    "127.0.0.1",
    () => console.log("Server running at http://127.0.0.1:3000"),
  );
}
