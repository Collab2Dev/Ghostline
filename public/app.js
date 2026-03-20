const editor = document.querySelector("#editor");
const srStatus = document.querySelector("#srStatus");
const codexBridgeButton = document.querySelector("#codexBridgeButton");
const codexFocus = document.querySelector("#codexFocus");
const codexStatus = document.querySelector("#codexStatus");
const providerStatus = document.querySelector("#providerStatus");
const yoloStatus = document.querySelector("#yoloStatus");
const rewriteStatus = document.querySelector("#rewriteStatus");
const latestOriginal = document.querySelector("#latestOriginal");
const latestRewritten = document.querySelector("#latestRewritten");
const copyLastRewriteButton = document.querySelector("#copyLastRewrite");
const copyDraftButton = document.querySelector("#copyDraftButton");

const settingsTrigger = document.querySelector("#settingsTrigger");
const settingsPanel = document.querySelector("#settingsPanel");
const closeSettings = document.querySelector("#closeSettings");
const settingsForm = document.querySelector("#settingsForm");
const yoloModeInput = document.querySelector("#yoloMode");
const providerSelect = document.querySelector("#provider");
const customModelInput = document.querySelector("#customModel");
const apiKeyInput = document.querySelector("#apiKey");
const endpointInput = document.querySelector("#endpoint");
const toast = document.querySelector("#toast");

let isRewriting = false;
let lastRewriteSnapshot = null;
let lastFocusedSentence = "";
let yoloTimer = null;

const settings = {
  yoloMode: localStorage.getItem("ghostline_yolo") === "true",
  provider: localStorage.getItem("ghostline_provider") || localStorage.getItem("ghostline_model") || "codex",
  customModel: localStorage.getItem("ghostline_customModel") || "",
  apiKey: localStorage.getItem("ghostline_apiKey") || "",
  endpoint: localStorage.getItem("ghostline_endpoint") || ""
};

yoloModeInput.checked = settings.yoloMode;
providerSelect.value = settings.provider;
customModelInput.value = settings.customModel;
apiKeyInput.value = settings.apiKey;
endpointInput.value = settings.endpoint;

settingsTrigger.addEventListener("click", () => settingsPanel.classList.toggle("sr-only"));
closeSettings.addEventListener("click", () => settingsPanel.classList.add("sr-only"));

settingsForm.addEventListener("input", () => {
  settings.yoloMode = yoloModeInput.checked;
  settings.provider = providerSelect.value;
  settings.customModel = customModelInput.value.trim();
  settings.apiKey = apiKeyInput.value.trim();
  settings.endpoint = endpointInput.value.trim();

  localStorage.setItem("ghostline_yolo", String(settings.yoloMode));
  localStorage.setItem("ghostline_provider", settings.provider);
  localStorage.setItem("ghostline_model", settings.provider);
  localStorage.setItem("ghostline_customModel", settings.customModel);
  localStorage.setItem("ghostline_apiKey", settings.apiKey);
  localStorage.setItem("ghostline_endpoint", settings.endpoint);

  updateStatusChips();
});

document.addEventListener("click", (event) => {
  if (
    !settingsPanel.classList.contains("sr-only") &&
    !settingsPanel.contains(event.target) &&
    !settingsTrigger.contains(event.target)
  ) {
    settingsPanel.classList.add("sr-only");
  }
});

editor.addEventListener("keydown", async (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    await rewriteCurrentSentence();
    return;
  }

  if (event.key === "Enter" && settings.yoloMode) {
    clearTimeout(yoloTimer);
    await rewriteCurrentSentence();
  }
});

editor.addEventListener("input", () => {
  updateCodexBridgeState();

  if (settings.yoloMode) {
    clearTimeout(yoloTimer);
    yoloTimer = setTimeout(async () => {
      await rewriteCurrentSentence();
    }, 1500);
  }
});

editor.addEventListener("keyup", (event) => {
  if (event.key !== "Tab" && event.key !== "Enter") {
    updateCodexBridgeState();
  }
});

editor.addEventListener("mouseup", updateCodexBridgeState);
document.addEventListener("selectionchange", updateCodexBridgeState);
codexBridgeButton.addEventListener("click", handleCodexBridgeCopy);
copyLastRewriteButton.addEventListener("click", handleCopyLatestRewrite);
copyDraftButton.addEventListener("click", handleCopyDraft);

updateStatusChips();
updateCodexBridgeState();

async function rewriteCurrentSentence() {
  if (isRewriting) {
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
    showToast("Place the caret inside the editor first.");
    return;
  }

  const content = editor.textContent || "";
  const caretOffset = getCaretOffset(editor);
  const sentenceRange = findSentenceRange(content, caretOffset);

  if (!sentenceRange || !sentenceRange.text.trim()) {
    showToast("Ghostline could not find a sentence at this caret position.");
    return;
  }

  const domRange = resolveDomRange(sentenceRange);
  const shimmer = domRange ? wrapRangeInShimmer(domRange) : null;

  try {
    setBusyState(true);
    setRewriteStatus("Polishing");
    srStatus.textContent = "Rewriting current sentence.";

    const rewrittenSentence = await rewriteSentence(sentenceRange.text.trim());
    if (!rewrittenSentence) {
      throw new Error("Rewrite returned an empty sentence.");
    }

    const finalResult =
      sentenceRange.leadingWhitespace + rewrittenSentence + sentenceRange.trailingWhitespace;

    if (shimmer?.parentNode) {
      shimmer.replaceWith(document.createTextNode(finalResult));
      placeCaretAfterNode(editor, finalResult, sentenceRange.start);
    } else {
      editor.textContent =
        content.slice(0, sentenceRange.start) + finalResult + content.slice(sentenceRange.end);
      placeCaretAtOffset(editor, sentenceRange.start + finalResult.length);
    }

    lastRewriteSnapshot = {
      original: sentenceRange.text.trim(),
      rewritten: rewrittenSentence
    };

    latestOriginal.textContent = lastRewriteSnapshot.original;
    latestRewritten.textContent = lastRewriteSnapshot.rewritten;
    srStatus.textContent = "Sentence rewritten.";
    setRewriteStatus("Done");
    updateCodexBridgeState();
  } catch (error) {
    console.error(error);
    if (shimmer?.parentNode) {
      shimmer.replaceWith(document.createTextNode(shimmer.textContent || sentenceRange.text));
    }
    showToast(error.message || "Rewrite failed.");
    srStatus.textContent = "Rewrite failed.";
    setRewriteStatus("Error");
  } finally {
    setBusyState(false);
  }
}

function setBusyState(nextBusy) {
  isRewriting = nextBusy;
  editor.setAttribute("aria-busy", String(nextBusy));
  codexBridgeButton.disabled = nextBusy;
  copyLastRewriteButton.disabled = nextBusy || !lastRewriteSnapshot;
  copyDraftButton.disabled = nextBusy;
}

function updateStatusChips() {
  providerStatus.textContent = providerLabel(settings);
  yoloStatus.textContent = settings.yoloMode ? "YOLO" : "Manual";
}

function setRewriteStatus(status) {
  rewriteStatus.textContent = status;
}

async function rewriteSentence(sentence) {
  const options = buildRewriteOptions();

  if (window.webkit?.messageHandlers?.ghostline) {
    return new Promise((resolve, reject) => {
      window.onGhostlineResult = (result) => {
        resolve(String(result.finalText || "").trim());
      };
      window.onGhostlineError = (message) => {
        reject(new Error(message || "Rewrite failed."));
      };

      window.webkit.messageHandlers.ghostline.postMessage({
        action: "rewrite",
        sentence,
        options
      });
    });
  }

  const response = await fetch("/api/rewrite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sentence, ...options })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || "Rewrite failed.");
  }

  return typeof payload?.finalText === "string" ? payload.finalText.trim() : "";
}

function buildRewriteOptions() {
  const preset = providerPresets[settings.provider] || providerPresets.custom;

  if (settings.provider === "codex") {
    return {
      provider: "codex",
      model: settings.customModel || preset.defaultModel
    };
  }

  return {
    provider: settings.provider,
    model: settings.customModel || preset.defaultModel,
    apiKey: settings.apiKey,
    endpoint: settings.endpoint || preset.endpoint
  };
}

async function handleCodexBridgeCopy() {
  const context = getCodexBridgeContext();
  if (!context.draft) {
    codexStatus.textContent = "Add some writing first so Ghostline has something to hand off.";
    return;
  }

  try {
    await copyTextToClipboard(buildCodexBridgePrompt(context));
    codexStatus.textContent = context.focusSentence
      ? "Codex handoff copied with the focused sentence and full draft."
      : "Codex handoff copied with the full draft.";
  } catch (error) {
    console.error(error);
    codexStatus.textContent = "Clipboard access failed. Try again in a browser tab with clipboard access.";
  }
}

async function handleCopyLatestRewrite() {
  if (!lastRewriteSnapshot) {
    showToast("No rewrite to copy yet.");
    return;
  }

  await copyTextToClipboard(lastRewriteSnapshot.rewritten);
  showToast("Latest rewrite copied.");
}

async function handleCopyDraft() {
  const draft = cleanDraft(editor.textContent || "");
  if (!draft) {
    showToast("There is no draft to copy yet.");
    return;
  }

  await copyTextToClipboard(draft);
  showToast("Draft copied.");
}

function updateCodexBridgeState() {
  const context = getCodexBridgeContext();
  codexBridgeButton.disabled = isRewriting || !context.draft;
  copyLastRewriteButton.disabled = isRewriting || !lastRewriteSnapshot;
  codexFocus.textContent =
    context.focusSentence || "No active sentence yet. Ghostline will package the whole draft.";
}

function getCodexBridgeContext() {
  const draft = cleanDraft(editor.textContent || "");
  const activeSentence = getActiveSentence(draft);
  const latestRewrite =
    lastRewriteSnapshot && draft.includes(lastRewriteSnapshot.rewritten) ? lastRewriteSnapshot : null;

  return {
    draft,
    focusSentence: activeSentence,
    latestRewrite
  };
}

function getActiveSentence(draft) {
  if (!draft) {
    lastFocusedSentence = "";
    return "";
  }

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
    const sentenceRange = findSentenceRange(draft, getCaretOffset(editor));
    if (sentenceRange?.text) {
      lastFocusedSentence = sentenceRange.text.trim();
      return lastFocusedSentence;
    }
  }

  if (lastFocusedSentence && draft.includes(lastFocusedSentence)) {
    return lastFocusedSentence;
  }

  if (lastRewriteSnapshot?.rewritten && draft.includes(lastRewriteSnapshot.rewritten)) {
    return lastRewriteSnapshot.rewritten;
  }

  return "";
}

function buildCodexBridgePrompt({ draft, focusSentence, latestRewrite }) {
  const sections = [
    "You are picking up a writing pass that started in Ghostline.",
    "Keep the writer's meaning, perspective, and tone intact while improving the draft at the paragraph level.",
    "",
    "Please do the following:",
    "- tighten clarity, rhythm, and transitions",
    "- preserve specific language when it is already working",
    "- call out only the most meaningful changes",
    ""
  ];

  if (focusSentence) {
    sections.push("Focus sentence:");
    sections.push(focusSentence);
    sections.push("");
  }

  if (latestRewrite) {
    sections.push("Latest Ghostline rewrite:");
    sections.push(`Original: ${latestRewrite.original}`);
    sections.push(`Rewritten: ${latestRewrite.rewritten}`);
    sections.push("");
  }

  sections.push("Current draft:");
  sections.push("<draft>");
  sections.push(draft);
  sections.push("</draft>");
  sections.push("");
  sections.push("Return:");
  sections.push("1. A revised version of the draft.");
  sections.push("2. Three short notes on the most important edits.");

  return sections.join("\n");
}

function providerLabel(currentSettings) {
  const preset = providerPresets[currentSettings.provider] || providerPresets.custom;
  return currentSettings.customModel || preset.label;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("sr-only");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add("sr-only");
  }, 2600);
}

function cleanDraft(value) {
  return value.replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "absolute";
  textArea.style.left = "-9999px";
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function resolveDomRange(sentenceRange) {
  const range = document.createRange();
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let currentPos = 0;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent.length;
    const nextPos = currentPos + length;

    if (!startNode && sentenceRange.start >= currentPos && sentenceRange.start < nextPos) {
      startNode = node;
      startOffset = sentenceRange.start - currentPos;
    }

    if (sentenceRange.end > currentPos && sentenceRange.end <= nextPos) {
      endNode = node;
      endOffset = sentenceRange.end - currentPos;
      break;
    }

    currentPos = nextPos;
    node = walker.nextNode();
  }

  if (!startNode || !endNode) {
    return null;
  }

  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function wrapRangeInShimmer(range) {
  const span = document.createElement("span");
  span.className = "shimmer";

  try {
    range.surroundContents(span);
    return span;
  } catch (error) {
    console.warn("Failed to surround contents for shimmer effect.", error);
    return null;
  }
}

function getCaretOffset(root) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(selection.focusNode, selection.focusOffset);
  return range.toString().length;
}

function placeCaretAtOffset(root, offset) {
  const selection = window.getSelection();
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = 0;
  let node = walker.nextNode();

  while (node) {
    const next = current + node.textContent.length;
    if (offset <= next) {
      range.setStart(node, Math.max(0, offset - current));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    current = next;
    node = walker.nextNode();
  }

  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAfterNode(root, replacementText, startOffset) {
  const normalizedLength = replacementText.length;
  placeCaretAtOffset(root, startOffset + normalizedLength);
}

function findSentenceRange(text, caretOffset) {
  const safeCaret = Math.max(0, Math.min(caretOffset, text.length));
  let start = safeCaret;
  while (start > 0) {
    const char = text[start - 1];
    if (char === "." || char === "!" || char === "?" || char === "\n") {
      break;
    }
    start -= 1;
  }

  let end = safeCaret;
  while (end < text.length) {
    const char = text[end];
    if (char === "." || char === "!" || char === "?") {
      end += 1;
      break;
    }
    if (char === "\n") {
      break;
    }
    end += 1;
  }

  const raw = text.slice(start, end);
  const leadingWhitespaceMatch = raw.match(/^\s*/u);
  const trailingWhitespaceMatch = raw.match(/\s*$/u);
  const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : "";
  const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[0] : "";
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  return {
    start,
    end,
    text: raw,
    leadingWhitespace,
    trailingWhitespace
  };
}

const providerPresets = {
  codex: {
    label: "Codex",
    defaultModel: ""
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5-mini",
    endpoint: "https://api.openai.com/v1"
  },
  claude: {
    label: "Claude",
    defaultModel: "claude-sonnet-4-0",
    endpoint: "https://api.anthropic.com/v1"
  },
  gemini: {
    label: "Gemini",
    defaultModel: "gemini-2.5-flash",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai"
  },
  kimi: {
    label: "Kimi",
    defaultModel: "kimi-latest",
    endpoint: "https://api.moonshot.cn/v1"
  },
  qwen: {
    label: "Qwen",
    defaultModel: "qwen-plus",
    endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  },
  openrouter: {
    label: "OpenRouter",
    defaultModel: "openai/gpt-5-mini",
    endpoint: "https://openrouter.ai/api/v1"
  },
  groq: {
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    endpoint: "https://api.groq.com/openai/v1"
  },
  deepseek: {
    label: "DeepSeek",
    defaultModel: "deepseek-chat",
    endpoint: "https://api.deepseek.com/v1"
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
