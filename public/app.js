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
const requestAllPermissionsButton = document.querySelector("#requestAllPermissionsButton");
const requestAccessibilityButton = document.querySelector("#requestAccessibilityButton");
const requestAutomationButton = document.querySelector("#requestAutomationButton");
const requestScreenRecordingButton = document.querySelector("#requestScreenRecordingButton");
const accessibilityStatus = document.querySelector("#accessibilityStatus");
const automationStatus = document.querySelector("#automationStatus");
const screenRecordingStatus = document.querySelector("#screenRecordingStatus");
const permissionSummary = document.querySelector("#permissionSummary");
const codexStatus = document.querySelector("#codexStatus");
const codexStatusDetail = document.querySelector("#codexStatusDetail");
const codexLoginButton = document.querySelector("#codexLoginButton");
const refreshConnectionButton = document.querySelector("#refreshConnectionButton");
const providerModeLabel = document.querySelector("#providerModeLabel");
const providerHint = document.querySelector("#providerHint");
const bridgeSourceLabel = document.querySelector("#bridgeSourceLabel");
const bridgePreview = document.querySelector("#bridgePreview");
const copyCodexBridgeButton = document.querySelector("#copyCodexBridgeButton");
const copyHumanizerBridgeButton = document.querySelector("#copyHumanizerBridgeButton");
const apiFieldNodes = Array.from(document.querySelectorAll(".api-field"));
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
    suggestions: ["codex -> openai -> claude", "gemini -> deepseek -> ollama"]
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
let permissionState = {
  accessibility: false,
  automation: false,
  screenRecording: false
};
let authState = {
  codexAvailable: false,
  codexLoggedIn: false,
  codexStatus: "Checking Codex..."
};
let isRequestingPermissions = false;
let isYoloModeEnabled = false;
let permissionRequestResetTimer = 0;
let copyLatestRewriteResetTimer = 0;

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
isYoloModeEnabled = settings.yoloMode;

providerSelect.value = settings.provider;
customModelInput.value = settings.customModel;
apiKeyInput.value = settings.apiKey;
endpointInput.value = settings.endpoint;
toneSelect.value = settings.tone;
displayModeSelect.value = settings.displayMode;
yoloModeInput.checked = isYoloModeEnabled;
pasteInput.value = settings.pasteInput;

syncToneUI(settings.tone);
applyProviderPreset(settings.provider, { preserveCustomEndpoint: true });
renderModelSuggestions();
renderProviderMatrix();
updatePermissionUI();
updateConnectionUI();
renderRewritePanels();
renderBridgeUI();
updateStatus();
sendPreferences();
syncBridgeAvailability();

settingsForm.addEventListener("input", () => {
  settings.provider = normalizeProviderKey(providerSelect.value);
  settings.customModel = customModelInput.value.trim();
  settings.apiKey = apiKeyInput.value.trim();
  settings.endpoint = endpointInput.value.trim();
  settings.tone = toneSelect.value;
  settings.displayMode = displayModeSelect.value;
  settings.yoloMode = isYoloModeEnabled;

  persistSettings();
  applyProviderPreset(settings.provider, { preserveCustomEndpoint: true });
  renderModelSuggestions();
  renderProviderMatrix();
  updateConnectionUI();
  updateStatus();
  sendPreferences();
});

yoloModeInput.addEventListener("change", () => {
  handleYoloModeToggle();
});

providerSelect.addEventListener("change", () => {
  settings.provider = normalizeProviderKey(providerSelect.value);
  applyProviderPreset(settings.provider, { preserveCustomEndpoint: false });
  renderModelSuggestions();
  renderProviderMatrix();
  persistSettings();
  updateConnectionUI();
  updateStatus();
  sendPreferences();
});

pasteInput.addEventListener("input", () => {
  settings.pasteInput = pasteInput.value;
  localStorage.setItem("ghostline_pasteInput", settings.pasteInput);
  renderBridgeUI();
});

toneChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    settings.tone = chip.dataset.tone || "natural";
    toneSelect.value = settings.tone;
    syncToneUI(settings.tone);
    persistSettings();
    updateStatus();
    sendPreferences();
  });
});

rewriteFocusButton.addEventListener("click", () => {
  void handleRewrite();
});

rewritePastedButton.addEventListener("click", () => {
  rewritePastedText();
});

clearPasteButton.addEventListener("click", () => {
  pasteInput.value = "";
  settings.pasteInput = "";
  localStorage.setItem("ghostline_pasteInput", "");
  renderBridgeUI();
  showToast("Paste lab cleared.");
});

copyLastRewriteButton.addEventListener("click", () => {
  void copyToClipboard();
});

copyCodexBridgeButton.addEventListener("click", async () => {
  const prompt = buildCodexHandoffPrompt();
  if (!prompt) {
    showToast("Add a draft first.");
    return;
  }

  await copyText(prompt);
  showToast("Copied Codex handoff.");
});

copyHumanizerBridgeButton.addEventListener("click", async () => {
  const prompt = buildHumanizerHandoffPrompt();
  if (!prompt) {
    showToast("Add a draft first.");
    return;
  }

  await copyText(prompt);
  showToast("Copied humanizer handoff.");
});

requestAllPermissionsButton.addEventListener("click", () => {
  void handleRequestAllPermissions();
});

requestAccessibilityButton.addEventListener("click", () => requestPermission("accessibility"));
requestAutomationButton.addEventListener("click", () => requestPermission("automation"));
requestScreenRecordingButton.addEventListener("click", () => requestPermission("screenRecording"));

codexLoginButton.addEventListener("click", () => {
  if (!postToGhostline({ action: "codexLogin" })) {
    showToast("Codex login can only be launched from the macOS app.");
    return;
  }

  showToast("Opening Codex login.");
});

refreshConnectionButton.addEventListener("click", () => {
  if (!postToGhostline({ action: "refreshConnection" })) {
    showToast("Connection refresh is only available inside the macOS app.");
    return;
  }

  showToast("Refreshing connection status.");
});

window.onGhostlineContext = handleGhostlineContext;
window.onGhostlineResult = handleGhostlineResult;
window.onGhostlineError = handleGhostlineError;

function handleGhostlineContext(payload) {
  const context = typeof payload === "string" ? JSON.parse(payload) : payload;
  currentFocusSentence = context.sentence || "";
  permissionState = normalizePermissions(context.permissions || { accessibility: context.hasAccess });
  authState = normalizeAuth(context.auth);

  if (currentFocusSentence) {
    codexFocus.textContent = currentFocusSentence;
    codexFocus.classList.remove("empty");
  } else {
    codexFocus.textContent = permissionState.accessibility
      ? "Click into some text and Ghostline will follow the sentence under your caret."
      : "Grant Accessibility access so Ghostline can read the sentence under your caret.";
    codexFocus.classList.add("empty");
  }

  focusAppLabel.textContent = context.appName
    ? `Following text in ${context.appName}.`
    : permissionState.accessibility
      ? "Focus a text field in any app."
      : "Accessibility access is required.";

  srStatus.textContent = context.status || "Ready for a sentence.";
  updatePermissionUI();
  updateConnectionUI();
  renderBridgeUI();
  updateStatus();
}

function handleGhostlineResult(result) {
  const payload = typeof result === "string" ? JSON.parse(result) : result;
  commitRewriteSnapshot({
    original: payload.originalText || currentFocusSentence || "Unknown",
    rewritten: payload.finalText || "",
    provider: normalizeProviderKey(payload.provider || settings.provider)
  });
  isRewriting = false;
  srStatus.textContent = `Rewritten with ${labelForProviderKey(lastRewriteSnapshot.provider)}.`;
  updateStatus();
  showToast("Rewrite complete.");
}

function handleGhostlineError(message) {
  isRewriting = false;
  srStatus.textContent = "Rewrite failed.";
  updateStatus("Error");
  showToast(typeof message === "string" ? message : "Rewrite failed.");
}

async function rewritePastedText() {
  const sentence = pasteInput.value.trim();
  if (!sentence) {
    showToast("Paste something first.");
    return;
  }

  isRewriting = true;
  srStatus.textContent = "Rewriting pasted text.";
  updateStatus();

  try {
    const payload = window.webkit?.messageHandlers?.ghostline
      ? await requestNativeRewrite(sentence)
      : await requestHttpRewrite(sentence);

    commitRewriteSnapshot({
      original: sentence,
      rewritten: payload.finalText || "",
      provider: normalizeProviderKey(payload.provider || settings.provider)
    });
    srStatus.textContent = `Paste lab used ${labelForProviderKey(lastRewriteSnapshot.provider)}.`;
    showToast("Pasted text rewritten.");
  } catch (error) {
    srStatus.textContent = "Paste lab failed.";
    updateStatus("Error");
    showToast(error instanceof Error ? error.message : "Rewrite failed.");
  } finally {
    isRewriting = false;
    updateStatus();
  }
}

function requestNativeRewrite(sentence) {
  return new Promise((resolve, reject) => {
    const previousResultHandler = window.onGhostlineResult;
    const previousErrorHandler = window.onGhostlineError;

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Ghostline timed out while rewriting pasted text."));
    }, 45000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      window.onGhostlineResult = previousResultHandler;
      window.onGhostlineError = previousErrorHandler;
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

async function handleRequestAllPermissions() {
  if (isRequestingPermissions) {
    return;
  }

  isRequestingPermissions = true;
  updateRequestAllPermissionsButtonState();

  try {
    await requestPermissions();
    showToast("Ghostline is requesting macOS permissions.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Permission request failed.");
  } finally {
    window.clearTimeout(permissionRequestResetTimer);
    permissionRequestResetTimer = window.setTimeout(() => {
      isRequestingPermissions = false;
      updateRequestAllPermissionsButtonState();
    }, 1200);
  }
}

async function requestPermissions() {
  // TODO: Replace this bridge call with richer native/backend permission orchestration.
  const didPost = postToGhostline({ action: "requestPermissions" });
  if (!didPost) {
    throw new Error("Permission requests are only available inside the macOS app.");
  }
}

async function handleRewrite() {
  const focusedText = getFocusedSentenceText();
  if (!focusedText) {
    showToast("Focus a sentence first.");
    return;
  }

  isRewriting = true;
  srStatus.textContent = "Rewriting focused sentence.";
  updateStatus();

  try {
    const payload = await performRewriteRequest(focusedText);
    if (!payload) {
      return;
    }

    commitRewriteSnapshot({
      original: focusedText,
      rewritten: payload.finalText || "",
      provider: normalizeProviderKey(payload.provider || settings.provider)
    });
    srStatus.textContent = `Rewritten with ${labelForProviderKey(lastRewriteSnapshot.provider)}.`;
    isRewriting = false;
    updateStatus();
    showToast("Rewrite complete.");
  } catch (error) {
    isRewriting = false;
    srStatus.textContent = "Rewrite failed.";
    updateStatus("Error");
    showToast(error instanceof Error ? error.message : "Rewrite failed.");
  }
}

async function performRewriteRequest(focusedText) {
  // TODO: Move this into a dedicated backend/native rewrite endpoint if you want one unified flow.
  if (hasNativeBridge()) {
    window.webkit.messageHandlers.ghostline.postMessage({
      action: "rewriteFocused",
      options: buildRewriteOptions()
    });
    return null;
  }

  return requestHttpRewrite(focusedText);
}

function getFocusedSentenceText() {
  if (currentFocusSentence.trim()) {
    return currentFocusSentence.trim();
  }

  if (codexFocus.classList.contains("empty")) {
    return "";
  }

  return codexFocus.textContent.trim();
}

async function copyToClipboard() {
  const rewriteText = latestRewritten.classList.contains("is-empty")
    ? ""
    : latestRewritten.textContent.trim();

  if (!rewriteText) {
    showToast("No rewrite to copy yet.");
    return;
  }

  await copyText(rewriteText);
  copyLastRewriteButton.textContent = "Copied!";
  window.clearTimeout(copyLatestRewriteResetTimer);
  copyLatestRewriteResetTimer = window.setTimeout(() => {
    copyLastRewriteButton.textContent = "Copy Latest Rewrite";
  }, 2000);
}

function handleYoloModeToggle() {
  isYoloModeEnabled = yoloModeInput.checked;
  settings.yoloMode = isYoloModeEnabled;
  persistSettings();
  updateStatus();
  sendPreferences();
}

function buildRewriteOptions() {
  const preset = providerPresets[settings.provider] || providerPresets.custom;
  return {
    provider: settings.provider,
    model: settings.customModel || preset.defaultModel,
    apiKey: settings.apiKey,
    endpoint: settings.endpoint || preset.endpoint || "",
    tone: settings.tone
  };
}

function sendPreferences() {
  if (!hasNativeBridge()) {
    return;
  }

  window.webkit.messageHandlers.ghostline.postMessage({
    action: "preferences",
    preferences: {
      ...buildRewriteOptions(),
      displayMode: settings.displayMode,
      yoloMode: String(settings.yoloMode)
    }
  });
}

function requestPermission(permission) {
  if (!postToGhostline({ action: "requestPermission", permission })) {
    showToast("Permission requests are only available inside the macOS app.");
    return;
  }

  showToast(`Requesting ${labelForPermission(permission)} access.`);
}

function postToGhostline(message) {
  if (!hasNativeBridge()) {
    console.warn("Ghostline native bridge is missing.", message);
    return false;
  }

  window.webkit.messageHandlers.ghostline.postMessage(message);
  return true;
}

function updateStatus(forcedState = "") {
  providerStatus.textContent =
    settings.provider === "auto"
      ? "Auto"
      : settings.customModel || providerPresets[settings.provider]?.defaultModel || labelForProviderKey(settings.provider);
  displayStatus.textContent = `${capitalize(settings.displayMode)}${settings.yoloMode ? " + YOLO" : ""}`;
  rewriteStatus.textContent = forcedState || (isRewriting ? "Rewriting" : settings.yoloMode ? "Auto" : "Ready");
  rewriteIndicator.className = `status-dot ${forcedState === "Error" ? "error" : isRewriting ? "polishing" : "live"}`;
  modelFamilyLabel.textContent = providerPresets[settings.provider]?.family || "Provider";
  copyLastRewriteButton.disabled = false;
  copyCodexBridgeButton.disabled = !resolveBridgeDraft();
  copyHumanizerBridgeButton.disabled = !resolveBridgeDraft();
  rewriteFocusButton.disabled = isRewriting || !currentFocusSentence || !permissionState.accessibility;
  rewritePastedButton.disabled = isRewriting;
}

function updatePermissionUI() {
  updatePermissionTile(requestAccessibilityButton, accessibilityStatus, permissionState.accessibility);
  updatePermissionTile(requestAutomationButton, automationStatus, permissionState.automation);
  updatePermissionTile(requestScreenRecordingButton, screenRecordingStatus, permissionState.screenRecording);

  const allGranted =
    permissionState.accessibility && permissionState.automation && permissionState.screenRecording;

  requestAllPermissionsButton.disabled = allGranted || isRequestingPermissions;
  permissionSummary.textContent = allGranted
    ? "All three permissions are active. Ghostline can stay beside your writing like a proper desktop utility."
    : "Grant Accessibility first, then finish Automation and Screen Recording so the Mac app can behave like a full native companion.";
  updateRequestAllPermissionsButtonState();
}

function updatePermissionTile(button, statusNode, granted) {
  statusNode.textContent = granted ? "Granted" : "Needed";
  button.classList.toggle("is-granted", granted);
  button.setAttribute("aria-pressed", String(granted));
}

function updateRequestAllPermissionsButtonState() {
  const allGranted =
    permissionState.accessibility && permissionState.automation && permissionState.screenRecording;
  requestAllPermissionsButton.textContent = isRequestingPermissions
    ? "Requesting..."
    : "Request All Permissions";
  requestAllPermissionsButton.disabled = allGranted || isRequestingPermissions;
}

function updateConnectionUI() {
  const usingCodex = settings.provider === "codex";
  const usingAuto = settings.provider === "auto";
  const bridgeReady = hasNativeBridge();

  providerModeLabel.textContent = usingCodex
    ? "Codex Login"
    : usingAuto
      ? "Auto / Mixed"
      : "API Key Provider";

  providerHint.textContent = usingCodex
    ? "Codex mode ignores the API key fields below and uses the Codex session on this Mac."
    : usingAuto
      ? "Auto mode uses whatever local Codex session or provider credentials are available."
      : `Using ${labelForProviderKey(settings.provider)}. The API key and endpoint fields below are active.`;

  codexStatus.textContent = !bridgeReady
    ? "Bridge Missing"
    : authState.codexLoggedIn
      ? "Codex Connected"
      : authState.codexAvailable
        ? "Codex Needs Login"
        : "Codex Missing";
  codexStatusDetail.textContent = bridgeReady
    ? authState.codexStatus
    : "This window is not connected to the native Ghostline bridge.";

  codexLoginButton.disabled = false;
  apiFieldNodes.forEach((node) => {
    node.classList.toggle("is-inactive", usingCodex);
  });
  apiKeyInput.disabled = usingCodex;
  endpointInput.disabled = usingCodex;
}

function applyProviderPreset(provider, { preserveCustomEndpoint }) {
  const preset = providerPresets[provider] || providerPresets.custom;

  customModelInput.placeholder = preset.defaultModel || "Default for provider";

  if (!preserveCustomEndpoint || !settings.endpoint) {
    settings.endpoint = preset.endpoint || "";
    endpointInput.value = settings.endpoint;
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
  const providerOrder = ["auto", "codex", "openai", "claude", "gemini", "qwen", "deepseek", "ollama"];
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
  renderRewritePanels();
  renderBridgeUI();
}

function renderRewritePanels() {
  setRewritePanel(latestOriginal, lastRewriteSnapshot?.original, "No rewrite yet.");
  setRewritePanel(
    latestRewritten,
    lastRewriteSnapshot?.rewritten,
    "Your last rewrite will appear here after Ghostline updates the sentence in place."
  );
}

function setRewritePanel(node, text, fallback) {
  const value = text?.trim();
  node.textContent = value || fallback;
  node.classList.toggle("is-empty", !value);
  node.closest(".compare-block")?.classList.toggle("is-empty", !value);
}

function hasNativeBridge() {
  return Boolean(window.webkit?.messageHandlers?.ghostline);
}

function syncBridgeAvailability() {
  document.body.classList.toggle("has-native-bridge", hasNativeBridge());
  document.body.classList.toggle("missing-native-bridge", !hasNativeBridge());
}

function renderBridgeUI() {
  const bridgeDraft = resolveBridgeDraft();
  const hasDraft = Boolean(bridgeDraft);
  copyCodexBridgeButton.disabled = !hasDraft;
  copyHumanizerBridgeButton.disabled = !hasDraft;

  if (!hasDraft) {
    bridgeSourceLabel.textContent = "No Draft";
    bridgePreview.textContent =
      "Paste text into the lab or focus a sentence in another app to prepare a bridge prompt.";
    bridgePreview.classList.add("empty");
    return;
  }

  bridgeSourceLabel.textContent = bridgeDraft.sourceLabel;
  bridgePreview.textContent = ellipsizeText(bridgeDraft.text, 360);
  bridgePreview.classList.remove("empty");
}

function resolveBridgeDraft() {
  const pastedDraft = pasteInput.value.trim();
  if (pastedDraft) {
    return { text: pastedDraft, sourceLabel: "Paste Lab" };
  }

  const focusedDraft = currentFocusSentence.trim();
  if (focusedDraft) {
    return { text: focusedDraft, sourceLabel: "Focused Sentence" };
  }

  const previousDraft = lastRewriteSnapshot?.original?.trim();
  if (previousDraft) {
    return { text: previousDraft, sourceLabel: "Last Rewrite" };
  }

  return null;
}

function buildCodexHandoffPrompt() {
  const context = buildBridgeContext();
  if (!context) {
    return "";
  }

  return [
    "You are picking up a writing pass that started in Ghostline.",
    "Keep the writer's meaning, perspective, register, and structure intact while improving the draft at the paragraph level.",
    "",
    "Please do the following:",
    "- tighten clarity, rhythm, and transitions",
    "- preserve specific language when it is already working",
    "- do not add facts, examples, or new sections",
    "- keep formal writing formal instead of making it chatty",
    "- call out only the most meaningful changes",
    "",
    "Current draft:",
    "<draft>",
    context.draft,
    "</draft>",
    context.rewrite
      ? [
          "",
          "Ghostline's latest rewrite:",
          "<ghostline_rewrite>",
          context.rewrite,
          "</ghostline_rewrite>"
        ].join("\n")
      : "",
    "",
    "Return:",
    "1. A revised version of the draft.",
    "2. Three short notes on the most important edits."
  ].filter(Boolean).join("\n");
}

function buildHumanizerHandoffPrompt() {
  const context = buildBridgeContext();
  if (!context) {
    return "";
  }

  return [
    "You are a writing humanizer picking up a draft from Ghostline.",
    "Make the writing feel more natural and human without changing the writer's meaning, stance, or level of formality.",
    "",
    "Please do the following:",
    "- reduce stiffness and AI-sounding phrasing",
    "- preserve the original argument, point of view, and paragraph shape",
    "- keep domain-specific or distinctive wording that is already working",
    "- do not add hype, extra claims, or filler",
    "- avoid turning analytical writing into casual marketing copy",
    "",
    "Current draft:",
    "<draft>",
    context.draft,
    "</draft>",
    context.rewrite
      ? [
          "",
          "Ghostline's latest rewrite for reference:",
          "<ghostline_rewrite>",
          context.rewrite,
          "</ghostline_rewrite>"
        ].join("\n")
      : "",
    "",
    "Return only the revised draft."
  ].filter(Boolean).join("\n");
}

function buildBridgeContext() {
  const bridgeDraft = resolveBridgeDraft();
  if (!bridgeDraft) {
    return null;
  }

  return {
    draft: bridgeDraft.text,
    rewrite: lastRewriteSnapshot?.rewritten?.trim() || ""
  };
}

function ellipsizeText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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

function normalizePermissions(permissions) {
  return {
    accessibility: Boolean(permissions?.accessibility),
    automation: Boolean(permissions?.automation),
    screenRecording: Boolean(permissions?.screenRecording)
  };
}

function normalizeAuth(auth) {
  return {
    codexAvailable: Boolean(auth?.codexAvailable),
    codexLoggedIn: Boolean(auth?.codexLoggedIn),
    codexStatus: auth?.codexStatus || "Codex status unavailable."
  };
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

function labelForPermission(permission) {
  if (permission === "accessibility") {
    return "Accessibility";
  }

  if (permission === "automation") {
    return "Automation";
  }

  if (permission === "screenRecording") {
    return "Screen Recording";
  }

  return "Ghostline";
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}
