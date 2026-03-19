import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

const improveInstructions =
  "You are an invisible writing assistant. Rewrite the user's sentence so it reads cleaner, sharper, and more polished without changing the meaning, point of view, tone, or sentence count. Return exactly one sentence and nothing else.";

const humanizeInstructions =
  "You are an AI humanizer. Make the sentence sound more natural, warm, and human while keeping the original meaning intact. Avoid cliches, corporate filler, em dashes, and obviously AI-sounding phrasing. Return exactly one sentence and nothing else.";

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/rewrite") {
      await handleRewrite(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }

    respondJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    respondJson(response, 500, { error: "Unexpected server error." });
  }
}).listen(port, host, () => {
  console.log(`Ghostline running at http://${host}:${port}`);
});

async function handleRewrite(request, response) {
  let body;

  try {
    body = await readJsonBody(request);
  } catch {
    respondJson(response, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const sentence = typeof body?.sentence === "string" ? body.sentence.trim() : "";

  if (!sentence) {
    respondJson(response, 400, { error: "A sentence is required." });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    respondJson(response, 500, {
      error: "OPENAI_API_KEY is missing. Add it to your shell before starting Ghostline."
    });
    return;
  }

  const improvedText = await createResponse({
    instructions: improveInstructions,
    input: sentence
  });

  const finalText = await createResponse({
    instructions: humanizeInstructions,
    input: `Original sentence:\n${sentence}\n\nImproved sentence:\n${improvedText}`
  });

  respondJson(response, 200, {
    improvedText,
    finalText
  });
}

async function createResponse({ instructions, input }) {
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      max_output_tokens: 120,
      reasoning: {
        effort: "minimal"
      }
    })
  });

  const payload = await apiResponse.json();

  if (!apiResponse.ok) {
    const message =
      payload?.error?.message || "OpenAI request failed while rewriting the sentence.";
    throw new Error(message);
  }

  return cleanSentence(extractOutputText(payload));
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload?.output)) {
    throw new Error("OpenAI returned no output.");
  }

  const text = payload.output
    .flatMap((item) => item?.content || [])
    .filter((item) => typeof item?.text === "string")
    .map((item) => item.text)
    .join(" ")
    .trim();

  if (!text) {
    throw new Error("OpenAI returned an empty sentence.");
  }

  return text;
}

function cleanSentence(value) {
  return value
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

async function serveStatic(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolvedPath = path.resolve(publicDir, `.${pathname}`);

  if (!resolvedPath.startsWith(publicDir)) {
    respondText(response, 403, "Forbidden");
    return;
  }

  try {
    const file = await readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : file);
  } catch {
    respondText(response, 404, "Not found");
  }
}

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function respondText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(message);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
