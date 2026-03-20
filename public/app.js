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
const rewritePastedButton = document.querySelector("#rewritePastedButton");
const clearPasteButton = document.querySelector("#clearPasteButton");
const pasteInput = document.querySelector("#pasteInput");
const toneChips = [...document.querySelectorAll(".tone-chip")];

const settingsForm = document.querySelector("#settingsForm");
const providerSelect = document.querySelector("#provider");
const customModelInput = document.querySelector("#customModel");
const apiKeyInput = document.querySelector("#apiKey");
const endpointInput = document.querySelector("#endpoint");
const toneSelect = document.querySelector("#toneSelect");
const displayModeSelect = document.querySelector("#displayMode");
const yoloModeInput = document.querySelector("#yoloMode");
const modelSuggestions = document.querySelector("#modelSuggestions");
const providerMatrix = document.querySelector("#providerMatrix");
const modelFamilyLabel = document.querySelector("#modelFamilyLabel");
const toast = document.querySelector("#toast");

const providerPresets = {
  auto: {
    label: "Auto",
    family: "Fallback chain",
    defaultModel: "",
    endpoint: "",
    suggestions: ["codex -> openai -> claude -> gemini", "deepseek -> qwen -> ollama"]
  },
  codex: {
    label: "Codex",
    family: "Codex CLI",
    defaultModel: "",
    endpoint: "",
    suggestions: ["gpt-5", "gpt-5-mini"]
  },
  openai: {
    label: "OpenAI",
    family: "GPT-5",
    defaultModel: "gpt-5-mini",
    endpoint: "https://api.openai.com/v1",
    suggestions: ["gpt-5", "gpt-5-mini", "gpt-5-nano"]
  },
  claude: {
    label: "Claude",
    family: "Anthropic",
    defaultModel: "claude-sonnet-4-0",
    endpoint: "https://api.anthropic.com/v1",
    suggestions: ["claude-opus-4-1", "claude-sonnet-4-0", "claude-3-7-sonnet-latest"]
  },
  gemini: {
    label: "Gemini",
    family: "Google",
    defaultModel: "gemini-2.5-flash",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    suggestions: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"]
  },
  kimi: {
    label: "Kimi",
    family: "Moonshot",
    defaultModel: "kimi-k2-0711-preview",
    endpoint: "https://api.moonshot.cn/v1",
    suggestions: ["kimi-k2-0711-preview", "kimi-latest", "moonshot-v1-8k"]
  },
  qwen: {
    label: "Qwen",
    family: "DashScope",
    defaultModel: "qwen-plus-latest",
    endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    suggestions: ["qwen-max-latest", "qwen-plus-latest", "qwen-turbo-latest"]
  },
  openrouter: {
    label: "OpenRouter",
    family: "Router",
    defaultModel: "openai/gpt-5-mini",
    endpoint: "https://openrouter.ai/api/v1",
    suggestions: ["openai/gpt-5", "openai/gpt-5-mini", "anthropic/claude-sonnet-4"]
  },
  groq: {
    label: "Groq",
    family: "Fast inference",
    defaultModel: "llama-3.3-70b-versatile",
    endpoint: "https://api.groq.com/openai/v1",
    suggestions: ["llama-3.3-70b-versatile", "qwen/qwen3-32b", "deepseek-r1-distill-llama-70b"]
  },
  deepseek: {
    label: "DeepSeek",
    family: "DeepSeek",
    defaultModel: "deepseek-chat",
    endpoint: "https://api.deepseek.com/v1",
    suggestions: ["deepseek-chat", "deepseek-reasoner"]
  },
  ollama: {
    label: "Ollama",
    family: "Local",
    defaultModel: "llama3.1:8b",
    endpoint: "http://localhost:11434/v1",
    suggestions: ["llama3.1:8b", "qwen2.5:14b", "deepseek-r1:8b"]
  },
  custom: {
    label: "Custom",
    family: "Compatible API",
    defaultModel: "",
    endpoint: "",
    suggestions: ["your-model-name"]
  }
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
  yoloMode: localStorage.getItem("ghostline_yolo") === "true",
  pasteInput: localStorage.getItem("ghostline_pasteInput") || ""
};

providerSelect.value = settings.provider;
customModelInput.value = settings.customModel;
apiKeyInput.value = settings.apiKey;
endpointInput.value = settings.endpoint;
toneSelect.value = settings.tone;
displayModeSelect.value = settings.displayMode;
yoloModeInput.checked = settings.yoloMode;
pasteInput.value = settings.pasteInput;

syncToneUI(settings.tone);
applyProviderPreset(settings.provider, { preserveCustomEndpoint: true });
renderModelSuggestions();
renderProviderMatrix();
updateStatus();
sendPreferences();

settingsForm.addEventListener("input", () => {
  settings.provider = normalizeProviderKey(providerSelect.value);
  settings.customModel = customModelInput.value.trim();
  settings.apiKey = apiKeyInput.value.trim();
  settings.endpoint = endpointInput.value.trim();
  settings.tone = toneSelect.value;
  settings.displayMode = displayModeSelect.value;
  settings.yoloMode = yoloModeInput.checked;

  persistSettings();
  applyProviderPreset(settings.provider, { preserveCustomEndpoint: true });
  renderModelSuggestions();
  renderProviderMatrix();
  updateStatus();
  sendPreferences();
});

providerSelect.addEventListener("change", () => {
  settings.provider = normalizeProviderKey(providerSelect.value);
  applyProviderPreset(settings.provider, { preserveCustomEndpoint: false });
  renderModelSuggestions();
  renderProviderMatrix();
  persistSettings();
  updateStatus();
});

pasteInput.addEventListener("input", () => {
  settings.pasteInput = pasteInput.value;
  localStorage.setItem("ghostline_pasteInput", settings.pasteInput);
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

rewritePastedButton.addEventListener("click", () => {
  rewritePastedText();
});

clearPasteButton.addEventListener("click", () => {
  pasteInput.value = "";
  settings.pasteInput = "";
  localStorage.setItem("ghostline_pasteInput", "");
  showToast("Paste lab cleared.");
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

toneChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    settings.tone = chip.dataset.tone || "natural";
    toneSelect.value = settings.tone;
    syncToneUI(settings.tone);
    persistSettings();
    updateStatus();
  });
});

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
  commitRewriteSnapshot({
    original: payload.originalText || currentFocusSentence || "Unknown",
    rewritten: payload.finalText || "",
    provider: payload.provider || settings.provider
  });
  isRewriting = false;
  srStatus.textContent = `Rewritten with ${labelForProviderKey(lastRewriteSnapshot.provider)}.`;
  updateStatus();
  showToast("Rewrite complete.");
};

window.onGhostlineError = (message) => {
  isRewriting = false;
  rewriteStatus.textContent = "Error";
  rewriteIndicator.className = "status-dot error";
  srStatus.textContent = "Rewrite failed.";
  showToast(typeof message === "string" ? message : "Rewrite failed.");
  rewriteFocusButton.disabled = !currentFocusSentence;
};

async function rewritePastedText() {
  const sentence = pasteInput.value.trim();
  if (!sentence) {
    showToast("Paste something first.");
    return;
  }

  isRewriting = true;
  updateStatus();
  srStatus.textContent = "Rewriting pasted text.";

  try {
    let payload;

    if (window.webkit?.messageHandlers?.ghostline) {
      payload = await requestNativeRewrite(sentence);
    } else {
      payload = await requestHttpRewrite(sentence);
    }

    commitRewriteSnapshot({
      original: sentence,
      rewritten: payload.finalText || "",
      provider: payload.provider || settings.provider
    });
    srStatus.textContent = `Paste lab used ${labelForProviderKey(lastRewriteSnapshot.provider)}.`;
    showToast("Pasted text rewritten.");
  } catch (error) {
    rewriteStatus.textContent = "Error";
    rewriteIndicator.className = "status-dot error";
    srStatus.textContent = "Paste lab failed.";
    showToast(error instanceof Error ? error.message : "Rewrite failed.");
  } finally {
    isRewriting = false;
    updateStatus();
  }
}

function requestNativeRewrite(sentence) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Ghostline timed out while rewriting pasted text."));
    }, 45000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      window.onGhostlineResult = defaultResultHandler;
      window.onGhostlineError = defaultErrorHandler;
    }

    window.onGhostlineResult = (result) => {
      cleanup();
      resolve(typeof result === "string" ? JSON.parse(result) : result);
    };

    window.onGhostlineError = (message) => {
      cleanup();
      reject(new Error(typeof message === "string" ? message : "Rewrite failed."));
    };

    window.webkit.messageHandlers.ghostline.postMessage({
      action: "rewrite",
      sentence,
      options: buildRewriteOptions()
    });
  });
}

const defaultResultHandler = window.onGhostlineResult;
const defaultErrorHandler = window.onGhostlineError;

async function requestHttpRewrite(sentence) {
  const response = await fetch("/api/rewrite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sentence,
      ...buildRewriteOptions()
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Rewrite failed.");
  }

  return payload;
}

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
  providerStatus.textContent =
    settings.provider === "auto"
      ? "Auto"
      : settings.customModel || providerPresets[settings.provider]?.defaultModel || labelForProviderKey(settings.provider);
  displayStatus.textContent = capitalize(settings.displayMode);
  rewriteStatus.textContent = isRewriting ? "Rewriting" : "Ready";
  rewriteIndicator.className = `status-dot ${isRewriting ? "polishing" : "live"}`;
  modelFamilyLabel.textContent = providerPresets[settings.provider]?.family || "Provider";
  copyLastRewriteButton.disabled = !lastRewriteSnapshot?.rewritten;
  rewriteFocusButton.disabled = isRewriting || !currentFocusSentence;
  rewritePastedButton.disabled = isRewriting;
}

function applyProviderPreset(provider, { preserveCustomEndpoint }) {
  const preset = providerPresets[provider] || providerPresets.custom;

  if (!settings.customModel) {
    customModelInput.placeholder = preset.defaultModel || "Default for provider";
  }

  if (!preserveCustomEndpoint || !settings.endpoint) {
    settings.endpoint = preset.endpoint || "";
    endpointInput.value = settings.endpoint;
  }

  if (!settings.customModel) {
    customModelInput.value = "";
  }
}

function renderModelSuggestions() {
  const preset = providerPresets[settings.provider] || providerPresets.custom;
  modelSuggestions.replaceChildren(
    ...preset.suggestions.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      return option;
    })
  );
  customModelInput.placeholder = preset.defaultModel || "Default for provider";
}

function renderProviderMatrix() {
  const providerOrder = ["auto", "codex", "openai", "claude", "gemini", "kimi", "qwen", "deepseek"];
  providerMatrix.replaceChildren(
    ...providerOrder.map((key) => {
      const chip = document.createElement("div");
      chip.className = `provider-chip${key === settings.provider ? " active" : ""}`;

      const name = document.createElement("strong");
      name.textContent = providerPresets[key].label;

      const model = document.createElement("span");
      model.textContent = key === "auto"
        ? "multi-provider fallback"
        : providerPresets[key].defaultModel || "configure manually";

      chip.append(name, model);
      return chip;
    })
  );
}

function syncToneUI(tone) {
  toneSelect.value = tone;
  toneChips.forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.tone === tone);
  });
}

function commitRewriteSnapshot(snapshot) {
  lastRewriteSnapshot = snapshot;
  latestOriginal.textContent = snapshot.original || "No rewrite yet.";
  latestRewritten.textContent =
    snapshot.rewritten || "Your last rewrite will appear here after Ghostline updates the sentence in place.";
}

function persistSettings() {
  localStorage.setItem("ghostline_provider", settings.provider);
  localStorage.setItem("ghostline_customModel", settings.customModel);
  localStorage.setItem("ghostline_apiKey", settings.apiKey);
  localStorage.setItem("ghostline_endpoint", settings.endpoint);
  localStorage.setItem("ghostline_tone", settings.tone);
  localStorage.setItem("ghostline_displayMode", settings.displayMode);
  localStorage.setItem("ghostline_yolo", String(settings.yoloMode));
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
