import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const codexSchemaPath = path.join(__dirname, "codex-rewrite.schema.json");
const bundledCodexBinary = "/Applications/Codex.app/Contents/Resources/codex";
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const codexBinary =
  process.env.CODEX_BIN || (existsSync(bundledCodexBinary) ? bundledCodexBinary : "codex");
const codexModel = process.env.CODEX_MODEL || process.env.OPENAI_MODEL || "";
const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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
  const requestedProvider = normalizeProviderName(body?.provider);

  if (!sentence) {
    respondJson(response, 400, { error: "A sentence is required." });
    return;
  }

  if (body?.provider != null && requestedProvider == null) {
    respondJson(response, 400, {
      error: "Provider must be one of auto, codex, openai, claude, anthropic, or gemini."
    });
    return;
  }

  try {
    const rewrite = await rewriteSentence(sentence, requestedProvider);

    respondJson(response, 200, {
      provider: rewrite.provider,
      improvedText: rewrite.improvedText,
      finalText: rewrite.finalText
    });
  } catch (error) {
    console.error(error);
    respondJson(response, 500, {
      error: error instanceof Error ? error.message : "Rewrite failed."
    });
  }
}

async function rewriteSentence(sentence, requestedProvider) {
  const providers = resolveProviderOrder(requestedProvider);

  if (providers.length === 0) {
    throw new Error(
      "No rewrite backend is configured. Use Codex, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY."
    );
  }

  let lastError;

  for (const provider of providers) {
    try {
      const rewrite = await rewriteWithProvider(provider, sentence);

      return {
        provider,
        improvedText: rewrite.improvedText,
        finalText: rewrite.finalText
      };
    } catch (error) {
      lastError = error;
      console.warn(`${provider} rewrite failed.`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Rewrite failed.");
}

function resolveProviderOrder(requestedProvider) {
  const configuredProvider = normalizeProviderName(process.env.GHOSTLINE_PROVIDER);
  const preferredProvider = requestedProvider || configuredProvider || "auto";

  if (preferredProvider !== "auto") {
    return [preferredProvider];
  }

  const providers = [];

  if (isCodexConfigured()) {
    providers.push("codex");
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push("openai");
  }

  if (process.env.ANTHROPIC_API_KEY) {
    providers.push("anthropic");
  }

  if (process.env.GEMINI_API_KEY) {
    providers.push("gemini");
  }

  return providers;
}

function normalizeProviderName(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "auto") {
    return "auto";
  }

  if (normalized === "claude") {
    return "anthropic";
  }

  if (["codex", "openai", "anthropic", "gemini"].includes(normalized)) {
    return normalized;
  }

  return null;
}

function isCodexConfigured() {
  return Boolean(process.env.CODEX_BIN) || existsSync(bundledCodexBinary);
}

function rewriteWithProvider(provider, sentence) {
  if (provider === "codex") {
    return rewriteWithCodex(sentence);
  }

  if (provider === "openai") {
    return rewriteWithOpenAI(sentence);
  }

  if (provider === "anthropic") {
    return rewriteWithAnthropic(sentence);
  }

  if (provider === "gemini") {
    return rewriteWithGemini(sentence);
  }

  throw new Error("Unsupported rewrite provider.");
}

async function rewriteWithOpenAI(sentence) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const improvedText = await createOpenAIResponse({
    instructions: improveInstructions,
    input: sentence
  });

  const finalText = await createOpenAIResponse({
    instructions: humanizeInstructions,
    input: `Original sentence:\n${sentence}\n\nImproved sentence:\n${improvedText}`
  });

  return {
    improvedText,
    finalText
  };
}

async function createOpenAIResponse({ instructions, input }) {
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

async function rewriteWithAnthropic(sentence) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is missing.");
  }

  const improvedText = await createAnthropicResponse({
    instructions: improveInstructions,
    input: sentence
  });

  const finalText = await createAnthropicResponse({
    instructions: humanizeInstructions,
    input: `Original sentence:\n${sentence}\n\nImproved sentence:\n${improvedText}`
  });

  return {
    improvedText,
    finalText
  };
}

async function createAnthropicResponse({ instructions, input }) {
  const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 120,
      system: instructions,
      messages: [
        {
          role: "user",
          content: input
        }
      ]
    })
  });

  const payload = await apiResponse.json();

  if (!apiResponse.ok) {
    const message =
      payload?.error?.message || "Anthropic request failed while rewriting the sentence.";
    throw new Error(message);
  }

  return cleanSentence(extractAnthropicText(payload));
}

async function rewriteWithGemini(sentence) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const improvedText = await createGeminiResponse({
    instructions: improveInstructions,
    input: sentence
  });

  const finalText = await createGeminiResponse({
    instructions: humanizeInstructions,
    input: `Original sentence:\n${sentence}\n\nImproved sentence:\n${improvedText}`
  });

  return {
    improvedText,
    finalText
  };
}

async function createGeminiResponse({ instructions, input }) {
  const apiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: instructions
            }
          ]
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: input
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 120,
          temperature: 0.3
        }
      })
    }
  );

  const payload = await apiResponse.json();

  if (!apiResponse.ok) {
    const message =
      payload?.error?.message || "Gemini request failed while rewriting the sentence.";
    throw new Error(message);
  }

  return cleanSentence(extractGeminiText(payload));
}

async function rewriteWithCodex(sentence) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ghostline-codex-"));
  const outputPath = path.join(tempDir, "rewrite.json");
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--color",
    "never",
    "--output-schema",
    codexSchemaPath,
    "--output-last-message",
    outputPath
  ];

  if (codexModel) {
    args.push("--model", codexModel);
  }

  args.push("-");

  try {
    await runCodexExec({
      args,
      prompt: buildCodexPrompt(sentence)
    });

    const payload = JSON.parse(await readFile(outputPath, "utf8"));

    if (
      typeof payload?.improvedText !== "string" ||
      typeof payload?.finalText !== "string"
    ) {
      throw new Error("Codex returned an invalid rewrite payload.");
    }

    return {
      improvedText: cleanSentence(payload.improvedText),
      finalText: cleanSentence(payload.finalText)
    };
  } catch (error) {
    throw new Error(formatCodexError(error));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildCodexPrompt(sentence) {
  return [
    "You are Ghostline, a silent writing assistant.",
    "Return strict JSON that matches the provided schema.",
    "Do not use tools, commands, or file access.",
    "",
    "Produce two fields:",
    "1. improvedText: Rewrite the sentence so it reads cleaner, sharper, and more polished without changing the meaning, point of view, tone, or sentence count.",
    "2. finalText: Starting from improvedText, make it sound more natural, warm, and human while keeping the original meaning intact. Avoid cliches, corporate filler, em dashes, and obviously AI-sounding phrasing.",
    "",
    "Both fields must be exactly one sentence.",
    `Sentence: ${sentence}`
  ].join("\n");
}

function runCodexExec({ args, prompt }) {
  return new Promise((resolve, reject) => {
    const child = spawn(codexBinary, args, {
      cwd: __dirname,
      env: {
        ...process.env,
        NO_COLOR: "1"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const error = new Error(
        `Codex exited with code ${code || 1}.\n${[stdout, stderr].filter(Boolean).join("\n")}`
      );

      reject(error);
    });

    child.stdin.end(prompt);
  });
}

function formatCodexError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (/enoent|not found/i.test(message)) {
    return "Codex CLI is not installed. Install Codex or set CODEX_BIN before starting Ghostline.";
  }

  if (/codex login|sign in|authentication/i.test(message)) {
    return "Codex is not signed in. Run `codex login` first, then restart Ghostline.";
  }

  if (/lookup address information|websocket|network/i.test(message)) {
    return "Codex could not reach its service. Check your internet connection and try again.";
  }

  return "Codex rewrite failed. Make sure the Codex CLI is installed and logged in, then try again.";
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

function extractAnthropicText(payload) {
  if (!Array.isArray(payload?.content)) {
    throw new Error("Anthropic returned no output.");
  }

  const text = payload.content
    .filter((item) => item?.type === "text" && typeof item?.text === "string")
    .map((item) => item.text)
    .join(" ")
    .trim();

  if (!text) {
    throw new Error("Anthropic returned an empty sentence.");
  }

  return text;
}

function extractGeminiText(payload) {
  const text = payload?.candidates
    ?.flatMap((candidate) => candidate?.content?.parts || [])
    .filter((part) => typeof part?.text === "string")
    .map((part) => part.text)
    .join(" ")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty sentence.");
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
