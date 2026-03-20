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
const apiFieldNodes = Array.from(document.querySelectorAll(".api-field"));

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
  if (!postToGhostline({
    action: "rewriteFocused",
    options: buildRewriteOptions()
  })) {
    showToast("Focused rewriting is only available inside the macOS app.");
    return;
  }

  isRewriting = true;
  updateStatus();
  srStatus.textContent = "Rewriting focused sentence.";
});

copyLastRewriteButton.addEventListener("click", async () => {
  if (!lastRewriteSnapshot?.rewritten) {
    showToast("No rewrite to copy yet.");
    return;
  }

  await copyText(lastRewriteSnapshot.rewritten);
  showToast("Copied latest rewrite.");
});

requestAllPermissionsButton.addEventListener("click", () => {
  if (!postToGhostline({ action: "requestPermissions" })) {
    showToast("Permission requests are only available inside the macOS app.");
    return;
  }

  showToast("Ghostline is requesting macOS permissions.");
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

updateStatus();
updatePermissionUI();
updateConnectionUI();
sendPreferences();

window.onGhostlineContext = (payload) => {
  const context = typeof payload === "string" ? JSON.parse(payload) : payload;
  currentFocusSentence = context.sentence || "";
  permissionState = normalizePermissions(
    context.permissions || { accessibility: context.hasAccess }
  );
  authState = normalizeAuth(context.auth);
  updatePermissionUI();
  updateConnectionUI();

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
  updateStatus();
};

window.onGhostlineResult = (result) => {
  const payload = typeof result === "string" ? JSON.parse(result) : result;
  lastRewriteSnapshot = {
    original: payload.originalText || currentFocusSentence || "Unknown",
    rewritten: payload.finalText || "",
    provider: normalizeProviderKey(payload.provider || settings.provider)
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
  srStatus.textContent = "Rewrite failed.";
  updateStatus("Error");
  showToast(typeof message === "string" ? message : "Rewrite failed.");
};

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
  if (!window.webkit?.messageHandlers?.ghostline) {
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
  if (!window.webkit?.messageHandlers?.ghostline) {
    return false;
  }

  window.webkit.messageHandlers.ghostline.postMessage(message);
  return true;
}

function updateStatus(forcedState = "") {
  providerStatus.textContent = settings.customModel || labelForProviderKey(settings.provider);
  displayStatus.textContent = `${capitalize(settings.displayMode)}${settings.yoloMode ? " + YOLO" : ""}`;
  rewriteStatus.textContent = forcedState || (isRewriting ? "Rewriting" : settings.yoloMode ? "Auto" : "Ready");
  rewriteIndicator.className = `status-dot ${forcedState === "Error" ? "error" : isRewriting ? "polishing" : "live"}`;
  copyLastRewriteButton.disabled = !lastRewriteSnapshot?.rewritten;
  rewriteFocusButton.disabled = isRewriting || !currentFocusSentence || !permissionState.accessibility;
  updateConnectionUI();
}

function updatePermissionUI() {
  updatePermissionTile(
    requestAccessibilityButton,
    accessibilityStatus,
    permissionState.accessibility
  );
  updatePermissionTile(requestAutomationButton, automationStatus, permissionState.automation);
  updatePermissionTile(
    requestScreenRecordingButton,
    screenRecordingStatus,
    permissionState.screenRecording
  );

  const allGranted =
    permissionState.accessibility && permissionState.automation && permissionState.screenRecording;

  requestAllPermissionsButton.disabled = allGranted;
  permissionSummary.textContent = allGranted
    ? "All three permissions are active. Ghostline can stay beside your writing like a proper desktop utility."
    : "Grant Accessibility first, then finish Automation and Screen Recording so the Mac app can behave like a full native companion.";
}

function updatePermissionTile(button, statusNode, granted) {
  statusNode.textContent = granted ? "Granted" : "Needed";
  button.classList.toggle("is-granted", granted);
  button.setAttribute("aria-pressed", String(granted));
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

function updateConnectionUI() {
  const usingCodex = settings.provider === "codex";

  providerModeLabel.textContent = usingCodex ? "Codex Login" : "API Key Provider";
  providerHint.textContent = usingCodex
    ? "Codex mode ignores the API key field below and uses the Codex app or CLI session on this Mac."
    : `Using ${labelForProviderKey(settings.provider)}. The API key and endpoint fields below are active.`;

  codexStatus.textContent = authState.codexLoggedIn
    ? "Codex Connected"
    : authState.codexAvailable
      ? "Codex Needs Login"
      : "Codex Missing";
  codexStatusDetail.textContent = authState.codexStatus;

  codexLoginButton.disabled = !authState.codexAvailable;
  apiFieldNodes.forEach((node) => {
    node.classList.toggle("is-inactive", usingCodex);
  });
  apiKeyInput.disabled = usingCodex;
  endpointInput.disabled = usingCodex;
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
