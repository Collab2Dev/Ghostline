import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = process.env.PUBLIC_DIR || path.join(__dirname, "public");
const codexSchemaPath = path.join(__dirname, "codex-rewrite.schema.json");
const bundledCodexBinary = "/Applications/Codex.app/Contents/Resources/codex";
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const codexBinary =
  process.env.CODEX_BIN || (existsSync(bundledCodexBinary) ? bundledCodexBinary : "codex");
const codexModel = process.env.CODEX_MODEL || process.env.OPENAI_MODEL || "";

const providerPresets = {
  codex: {
    label: "Codex",
    defaultModel: codexModel
  },
  openai: {
    label: "OpenAI",
    defaultModel: process.env.OPENAI_MODEL || "gpt-5-mini",
    endpoint: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY"
  },
  claude: {
    label: "Claude",
    defaultModel: "claude-sonnet-4-0",
    endpoint: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY"
  },
  gemini: {
    label: "Gemini",
    defaultModel: "gemini-2.5-flash",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyEnv: "GEMINI_API_KEY"
  },
  kimi: {
    label: "Kimi",
    defaultModel: "kimi-k2-0711-preview",
    endpoint: "https://api.moonshot.cn/v1",
    apiKeyEnv: "MOONSHOT_API_KEY"
  },
  qwen: {
    label: "Qwen",
    defaultModel: "qwen-plus-latest",
    endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY"
  },
  openrouter: {
    label: "OpenRouter",
    defaultModel: "openai/gpt-5-mini",
    endpoint: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY"
  },
  groq: {
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    endpoint: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY"
  },
  deepseek: {
    label: "DeepSeek",
    defaultModel: "deepseek-chat",
    endpoint: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY"
  },
  ollama: {
    label: "Ollama",
    defaultModel: "llama3.1:8b",
    endpoint: "http://localhost:11434/v1"
  },
  custom: {
    label: "Custom",
    defaultModel: ""
  }
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

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
  const customModel = normalizeValue(body?.model) || null;
  const customApiKey = normalizeValue(body?.apiKey) || null;
  const customEndpoint = normalizeValue(body?.endpoint) || null;
  const tone = normalizeTone(body?.tone);

  if (!sentence) {
    respondJson(response, 400, { error: "A sentence is required." });
    return;
  }

  if (body?.provider != null && requestedProvider == null) {
    respondJson(response, 400, {
      error:
        "Provider must be one of auto, codex, openai, claude, anthropic, gemini, kimi, qwen, openrouter, groq, deepseek, ollama, or custom."
    });
    return;
  }

  try {
    const rewrite = await rewriteSentence(sentence, {
      provider: requestedProvider,
      model: customModel,
      apiKey: customApiKey,
      endpoint: customEndpoint,
      tone
    });

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

async function rewriteSentence(sentence, options = {}) {
  const requestedProvider = normalizeProviderName(options.provider);
  const configuredProvider = normalizeProviderName(process.env.GHOSTLINE_PROVIDER);
  const provider = requestedProvider || configuredProvider || "codex";

  if (provider === "auto") {
    return rewriteWithFallbackProviders(sentence, options);
  }

  return rewriteWithNamedProvider(sentence, options, provider);
}

async function rewriteWithFallbackProviders(sentence, options = {}) {
  const providers = resolveProviderOrder();
  if (providers.length === 0) {
    throw new Error(
      "No rewrite backend is configured. Use Codex, OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or another provider key."
    );
  }

  let lastError;
  for (const provider of providers) {
    try {
      return await rewriteWithNamedProvider(sentence, options, provider);
    } catch (error) {
      lastError = error;
      console.warn(`${provider} rewrite failed.`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Rewrite failed.");
}

async function rewriteWithNamedProvider(sentence, options, provider) {
  if (provider === "codex") {
    const rewrite = await rewriteWithCodex(sentence, { ...options, provider });
    return { provider, improvedText: rewrite.improvedText, finalText: rewrite.finalText };
  }

  const rewrite = await rewriteWithCompatibleProvider(sentence, { ...options, provider });
  return { provider, improvedText: rewrite.improvedText, finalText: rewrite.finalText };
}

function resolveProviderOrder() {
  const providers = [];
  if (isCodexConfigured()) {
    providers.push("codex");
  }

  for (const provider of ["openai", "claude", "gemini", "kimi", "qwen", "openrouter", "groq", "deepseek"]) {
    if (hasConfiguredCredential(provider)) {
      providers.push(provider);
    }
  }

  if (providerPresets.ollama.endpoint) {
    providers.push("ollama");
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
  if (normalized === "anthropic") {
    return "claude";
  }
  if (normalized === "auto") {
    return "auto";
  }

  return providerPresets[normalized] ? normalized : null;
}

function isCodexConfigured() {
  return Boolean(process.env.CODEX_BIN) || existsSync(bundledCodexBinary);
}

function hasConfiguredCredential(provider) {
  const preset = providerPresets[provider];
  return Boolean(preset?.apiKeyEnv && normalizeValue(process.env[preset.apiKeyEnv]));
}

async function rewriteWithCompatibleProvider(sentence, options = {}) {
  const resolved = resolveProviderOptions(options);
  const tone = normalizeTone(options.tone);

  const improvedText = await createCompatibleChatCompletion({
    instructions: improveInstructionsForTone(tone),
    input: sentence,
    options: resolved
  });

  const finalText = await createCompatibleChatCompletion({
    instructions: humanizeInstructionsForTone(tone),
    input: `Original sentence:\n${sentence}\n\nImproved sentence:\n${improvedText}`,
    options: resolved
  });

  return { improvedText, finalText };
}

async function createCompatibleChatCompletion({ instructions, input, options }) {
  const url = `${options.endpoint.replace(/\/$/, "")}/chat/completions`;
  const headers = {
    "Content-Type": "application/json"
  };

  if (options.provider !== "ollama") {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  if (options.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/Collab2Dev/Ghostline";
    headers["X-Title"] = "Ghostline";
  }

  if (options.provider === "gemini") {
    headers["x-goog-api-client"] = "collab2dev-ghostline/1.0.0";
  }

  const apiResponse = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input }
      ],
      temperature: 0.4,
      max_completion_tokens: 180
    })
  });

  const payload = await apiResponse.json();
  if (!apiResponse.ok) {
    const message =
      payload?.error?.message ||
      `${providerPresets[options.provider]?.label || "Provider"} request failed while rewriting the sentence.`;
    throw new Error(message);
  }

  return cleanSentence(extractChatCompletionText(payload));
}

async function rewriteWithCodex(sentence, options = {}) {
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

  const model = options.model || codexModel;
  if (model) {
    args.push("--model", model);
  }
  args.push("-");

  try {
    await runCodexExec({
      args,
      prompt: buildCodexPrompt(sentence, normalizeTone(options.tone))
    });

    const payload = JSON.parse(await readFile(outputPath, "utf8"));
    if (typeof payload?.improvedText !== "string" || typeof payload?.finalText !== "string") {
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

function buildCodexPrompt(sentence, tone) {
  return [
    "You are Ghostline, a silent writing assistant.",
    "Return strict JSON that matches the provided schema.",
    "Do not use tools, commands, or file access.",
    "",
    "Produce two fields:",
    `1. improvedText: Rewrite the sentence so it reads cleaner, sharper, and more polished without changing the meaning, point of view, tone, or sentence count. Aim for a ${tone} voice.`,
    `2. finalText: Starting from improvedText, make it sound more natural, warm, and human while keeping the original meaning intact. Aim for a ${tone} voice. Avoid cliches, corporate filler, em dashes, and obviously AI-sounding phrasing.`,
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

      reject(
        new Error(`Codex exited with code ${code || 1}.\n${[stdout, stderr].filter(Boolean).join("\n")}`)
      );
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

function extractChatCompletionText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join(" ")
      .trim();
    if (text) {
      return text;
    }
  }

  throw new Error("The provider returned an empty sentence.");
}

function cleanSentence(value) {
  return value
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

function resolveProviderOptions(options = {}) {
  const providerKey = normalizeProviderName(options.provider) || "openai";
  const preset = providerPresets[providerKey];
  const endpoint = normalizeValue(options.endpoint) || preset.endpoint;
  const model = normalizeValue(options.model) || preset.defaultModel;
  const apiKey =
    normalizeValue(options.apiKey) ||
    (preset.apiKeyEnv ? normalizeValue(process.env[preset.apiKeyEnv]) : "");

  if (!endpoint) {
    throw new Error(`No endpoint is configured for ${preset.label}.`);
  }
  if (!model) {
    throw new Error(`Pick a model name for ${preset.label}.`);
  }
  if (!apiKey && providerKey !== "ollama") {
    throw new Error(`Add an API key for ${preset.label}.`);
  }

  return {
    provider: providerKey,
    endpoint,
    model,
    apiKey: apiKey || "ollama"
  };
}

function normalizeValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeTone(value) {
  const tone = normalizeValue(value).toLowerCase();
  return tone || "natural";
}

function improveInstructionsForTone(tone) {
  return `You are an invisible writing assistant. Rewrite the user's sentence so it reads cleaner, sharper, and more polished without changing the meaning, point of view, tone, or sentence count. Aim for a ${tone} voice. Return exactly one sentence and nothing else.`;
}

function humanizeInstructionsForTone(tone) {
  return `You are an AI humanizer. Make the sentence sound more natural, warm, and human while keeping the original meaning intact. Aim for a ${tone} voice. Avoid cliches, corporate filler, em dashes, and obviously AI-sounding phrasing. Return exactly one sentence and nothing else.`;
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
