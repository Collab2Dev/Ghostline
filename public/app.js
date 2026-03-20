const codexFocus = document.querySelector("#codexFocus");
const focusAppLabel = document.querySelector("#focusAppLabel");
const srStatus = document.querySelector("#srStatus");
const providerStatus = document.querySelector("#providerStatus");
const displayStatus = document.querySelector("#displayStatus");
const rewriteStatus = document.querySelector("#rewriteStatus");
const rewriteIndicator = document.querySelector("#rewriteIndicator");
const latestOriginal = document.querySelector("#latestOriginal");
const latestRewritten = document.querySelector("#latestRewritten");
const copyLastRewriteButton = document.querySelector("#copyLastRewrite");
const rewriteFocusButton = document.querySelector("#rewriteFocusButton");
const requestAccessButton = document.querySelector("#requestAccessButton");

const settingsForm = document.querySelector("#settingsForm");
const providerSelect = document.querySelector("#provider");
const customModelInput = document.querySelector("#customModel");
const apiKeyInput = document.querySelector("#apiKey");
const endpointInput = document.querySelector("#endpoint");
const toneSelect = document.querySelector("#toneSelect");
const displayModeSelect = document.querySelector("#displayMode");
const yoloModeInput = document.querySelector("#yoloMode");
const toast = document.querySelector("#toast");

const providerPresets = {
  codex: { label: "Codex", defaultModel: "" },
  openai: { label: "OpenAI", defaultModel: "gpt-5-mini", endpoint: "https://api.openai.com/v1" },
  claude: { label: "Claude", defaultModel: "claude-sonnet-4-0", endpoint: "https://api.anthropic.com/v1" },
  gemini: { label: "Gemini", defaultModel: "gemini-2.5-flash", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai" },
  kimi: { label: "Kimi", defaultModel: "kimi-latest", endpoint: "https://api.moonshot.cn/v1" },
  qwen: { label: "Qwen", defaultModel: "qwen-plus", endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
  openrouter: { label: "OpenRouter", defaultModel: "openai/gpt-5-mini", endpoint: "https://openrouter.ai/api/v1" },
  groq: { label: "Groq", defaultModel: "llama-3.3-70b-versatile", endpoint: "https://api.groq.com/openai/v1" },
  deepseek: { label: "DeepSeek", defaultModel: "deepseek-chat", endpoint: "https://api.deepseek.com/v1" },
  ollama: { label: "Ollama", defaultModel: "llama3.1:8b", endpoint: "http://localhost:11434/v1" },
  custom: { label: "Custom", defaultModel: "" }
};

let isRewriting = false;
let lastRewriteSnapshot = null;
let currentFocusSentence = "";

const settings = {
  provider: normalizeProviderKey(localStorage.getItem("ghostline_provider") || "codex"),
  customModel: localStorage.getItem("ghostline_customModel") || "",
  apiKey: localStorage.getItem("ghostline_apiKey") || "",
  endpoint: localStorage.getItem("ghostline_endpoint") || "",
  tone: localStorage.getItem("ghostline_tone") || "natural",
  displayMode: localStorage.getItem("ghostline_displayMode") || "follow",
  yoloMode: localStorage.getItem("ghostline_yolo") === "true"
};

providerSelect.value = settings.provider;
customModelInput.value = settings.customModel;
apiKeyInput.value = settings.apiKey;
endpointInput.value = settings.endpoint;
toneSelect.value = settings.tone;
displayModeSelect.value = settings.displayMode;
yoloModeInput.checked = settings.yoloMode;

settingsForm.addEventListener("input", () => {
  settings.provider = normalizeProviderKey(providerSelect.value);
  settings.customModel = customModelInput.value.trim();
  settings.apiKey = apiKeyInput.value.trim();
  settings.endpoint = endpointInput.value.trim();
  settings.tone = toneSelect.value;
  settings.displayMode = displayModeSelect.value;
  settings.yoloMode = yoloModeInput.checked;

  localStorage.setItem("ghostline_provider", settings.provider);
  localStorage.setItem("ghostline_customModel", settings.customModel);
  localStorage.setItem("ghostline_apiKey", settings.apiKey);
  localStorage.setItem("ghostline_endpoint", settings.endpoint);
  localStorage.setItem("ghostline_tone", settings.tone);
  localStorage.setItem("ghostline_displayMode", settings.displayMode);
  localStorage.setItem("ghostline_yolo", String(settings.yoloMode));

  updateStatus();
  sendPreferences();
});

rewriteFocusButton.addEventListener("click", () => {
  if (!window.webkit?.messageHandlers?.ghostline) {
    showToast("Focused rewriting is only available inside the macOS app.");
    return;
  }

  isRewriting = true;
  updateStatus();
  srStatus.textContent = "Rewriting focused sentence.";

  window.webkit.messageHandlers.ghostline.postMessage({
    action: "rewriteFocused",
    options: buildRewriteOptions()
  });
});

copyLastRewriteButton.addEventListener("click", async () => {
  if (!lastRewriteSnapshot?.rewritten) {
    showToast("No rewrite to copy yet.");
    return;
  }

  await copyText(lastRewriteSnapshot.rewritten);
  showToast("Copied latest rewrite.");
});

requestAccessButton.addEventListener("click", () => {
  if (!window.webkit?.messageHandlers?.ghostline) {
    showToast("Accessibility requests are only available inside the macOS app.");
    return;
  }

  window.webkit.messageHandlers.ghostline.postMessage({ action: "requestAccess" });
});

updateStatus();
sendPreferences();

window.onGhostlineContext = (payload) => {
  const context = typeof payload === "string" ? JSON.parse(payload) : payload;
  currentFocusSentence = context.sentence || "";

  if (currentFocusSentence) {
    codexFocus.textContent = currentFocusSentence;
    codexFocus.classList.remove("empty");
  } else {
    codexFocus.textContent = context.hasAccess
      ? "Click into some text and Ghostline will follow the sentence under your caret."
      : "Grant Accessibility access so Ghostline can read the sentence under your caret.";
    codexFocus.classList.add("empty");
  }

  focusAppLabel.textContent = context.appName
    ? `Following text in ${context.appName}.`
    : context.hasAccess
      ? "Focus a text field in any app."
      : "Accessibility access is required.";

  srStatus.textContent = context.status || "Ready for a sentence.";
  rewriteFocusButton.disabled = !context.hasAccess || !currentFocusSentence || isRewriting;
};

window.onGhostlineResult = (result) => {
  const payload = typeof result === "string" ? JSON.parse(result) : result;
  lastRewriteSnapshot = {
    original: payload.originalText || currentFocusSentence || "Unknown",
    rewritten: payload.finalText || "",
    provider: payload.provider || settings.provider
  };

  latestOriginal.textContent = lastRewriteSnapshot.original;
  latestRewritten.textContent =
    lastRewriteSnapshot.rewritten || "Your last rewrite will appear here after Ghostline updates the sentence in place.";
  isRewriting = false;
  srStatus.textContent = `Rewritten with ${labelForProviderKey(lastRewriteSnapshot.provider)}.`;
  updateStatus();
  showToast("Focused sentence rewritten.");
};

window.onGhostlineError = (message) => {
  isRewriting = false;
  rewriteStatus.textContent = "Error";
  rewriteIndicator.className = "status-dot error";
  srStatus.textContent = "Rewrite failed.";
  showToast(typeof message === "string" ? message : "Rewrite failed.");
  rewriteFocusButton.disabled = !currentFocusSentence;
};

function buildRewriteOptions() {
  const preset = providerPresets[settings.provider] || providerPresets.custom;
  return {
    provider: settings.provider,
    model: settings.customModel || preset.defaultModel,
    apiKey: settings.apiKey,
    endpoint: settings.endpoint || preset.endpoint || "",
    tone: settings.tone,
    yoloMode: String(settings.yoloMode)
  };
}

function sendPreferences() {
  if (!window.webkit?.messageHandlers?.ghostline) {
    return;
  }

  window.webkit.messageHandlers.ghostline.postMessage({
    action: "preferences",
    preferences: {
      displayMode: settings.displayMode,
      yoloMode: String(settings.yoloMode)
    }
  });
}

function updateStatus() {
  providerStatus.textContent = settings.customModel || labelForProviderKey(settings.provider);
  displayStatus.textContent = capitalize(settings.displayMode);
  rewriteStatus.textContent = isRewriting ? "Rewriting" : "Ready";
  rewriteIndicator.className = `status-dot ${isRewriting ? "polishing" : "live"}`;
  copyLastRewriteButton.disabled = !lastRewriteSnapshot?.rewritten;
  rewriteFocusButton.disabled = isRewriting || !currentFocusSentence;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 2600);
}

function normalizeProviderKey(value) {
  if (!value) {
    return "codex";
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "anthropic") {
    return "claude";
  }

  return providerPresets[normalized] ? normalized : "codex";
}

function labelForProviderKey(provider) {
  return providerPresets[provider]?.label || "Ghostline";
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}
