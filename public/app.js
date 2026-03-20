const editor = document.querySelector("#editor");
const srStatus = document.querySelector("#srStatus");
const codexBridgeButton = document.querySelector("#codexBridgeButton");
const codexFocus = document.querySelector("#codexFocus");
const codexStatus = document.querySelector("#codexStatus");

const settingsTrigger = document.querySelector("#settingsTrigger");
const settingsPanel = document.querySelector("#settingsPanel");
const closeSettings = document.querySelector("#closeSettings");
const settingsForm = document.querySelector("#settingsForm");
const yoloModeInput = document.querySelector("#yoloMode");
const modelSelect = document.querySelector("#model");
const apiKeyInput = document.querySelector("#apiKey");
const endpointInput = document.querySelector("#endpoint");
const toast = document.querySelector("#toast");

let isRewriting = false;
let lastRewriteSnapshot = null;
let lastFocusedSentence = "";
let yoloTimer = null;

// Settings initialization
const settings = {
  yoloMode: localStorage.getItem("ghostline_yolo") === "true",
  model: localStorage.getItem("ghostline_model") || "codex",
  apiKey: localStorage.getItem("ghostline_apiKey") || "",
  endpoint: localStorage.getItem("ghostline_endpoint") || ""
};

yoloModeInput.checked = settings.yoloMode;
modelSelect.value = settings.model;
apiKeyInput.value = settings.apiKey;
endpointInput.value = settings.endpoint;

settingsTrigger.addEventListener("click", () => settingsPanel.classList.toggle("sr-only"));
closeSettings.addEventListener("click", () => settingsPanel.classList.add("sr-only"));

settingsForm.addEventListener("input", () => {
  settings.yoloMode = yoloModeInput.checked;
  settings.model = modelSelect.value;
  settings.apiKey = apiKeyInput.value;
  settings.endpoint = endpointInput.value;

  localStorage.setItem("ghostline_yolo", settings.yoloMode);
  localStorage.setItem("ghostline_model", settings.model);
  localStorage.setItem("ghostline_apiKey", settings.apiKey);
  localStorage.setItem("ghostline_endpoint", settings.endpoint);
});

async function rewriteCurrentSentence() {
  if (isRewriting) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
    return;
  }

  const content = editor.textContent || "";
  const caretOffset = getCaretOffset(editor);
  const sentenceRange = findSentenceRange(content, caretOffset);

  if (!sentenceRange || !sentenceRange.text.trim()) {
    return;
  }

  // Find the text node(s) corresponding to the sentence range
  const range = document.createRange();
  let startNode = null, startOffset = 0;
  let endNode = null, endOffset = 0;
  
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let currentPos = 0;
  let node = walker.nextNode();
  while (node) {
    const nextPos = currentPos + node.textContent.length;
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

  if (!startNode || !endNode) return;

  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  // Wrap the sentence in a shimmer span
  const span = document.createElement("span");
  span.className = "shimmer";
  try {
    range.surroundContents(span);
  } catch (e) {
    // If surroundContents fails (complex selection), fallback to simpler replacement
    console.warn("Complex selection, skipping shimmer effect", e);
  }

  try {
    setBusyState(true);
    srStatus.textContent = "Rewriting current sentence.";

    const rewrittenSentence = await rewriteSentence(sentenceRange.text.trim());

    if (!rewrittenSentence) {
      if (span.parentNode) {
        // Remove span and restore text if possible
        const text = span.textContent;
        span.parentNode.replaceChild(document.createTextNode(text), span);
      }
      return;
    }

    const finalResult = sentenceRange.leadingWhitespace + rewrittenSentence + sentenceRange.trailingWhitespace;
    
    if (span.parentNode) {
      span.textContent = finalResult;
      span.className = ""; // Remove shimmer
      // Un-wrap the span to keep it clean
      const textNode = document.createTextNode(finalResult);
      span.parentNode.replaceChild(textNode, span);
      
      // Reset caret at the end of the new text
      const newSelection = window.getSelection();
      const newRange = document.createRange();
      newRange.setStartAfter(textNode);
      newRange.collapse(true);
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
    } else {
      // Fallback
      editor.textContent = content.slice(0, sentenceRange.start) + finalResult + content.slice(sentenceRange.end);
    }

    lastRewriteSnapshot = {
      original: sentenceRange.text.trim(),
      rewritten: rewrittenSentence
    };
    srStatus.textContent = "Sentence rewritten.";
    updateCodexBridgeState();
  } catch (error) {
    console.error(error);
    showToast(error.message);
    srStatus.textContent = "Rewrite failed.";
    if (span.parentNode) {
      const text = span.textContent;
      span.parentNode.replaceChild(document.createTextNode(text), span);
    }
  } finally {
    setBusyState(false);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("sr-only");
  setTimeout(() => toast.classList.add("sr-only"), 3000);
}

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

editor.addEventListener("input", (event) => {
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

updateCodexBridgeState();

function setBusyState(isBusy) {
  isRewriting = isBusy;
  editor.setAttribute("aria-busy", String(isBusy));
}

async function rewriteSentence(sentence) {
  const options = {};
  if (settings.model !== "codex") {
    options.model = settings.model === "openai" ? "gpt-4o" : settings.model;
    if (settings.apiKey) options.apiKey = settings.apiKey;
    if (settings.endpoint) options.endpoint = settings.endpoint;
  }

  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ghostline) {
    return new Promise((resolve, reject) => {
        window.onGhostlineResult = (result) => {
            resolve(result.finalText.trim());
        };
        window.onGhostlineError = (error) => {
            reject(new Error(error));
        };
        window.webkit.messageHandlers.ghostline.postMessage({
            action: "rewrite",
            sentence,
            options
        });
    });
  }

  const body = { sentence, ...options };
  const response = await fetch("/api/rewrite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || "Rewrite failed.");
  }

  return typeof payload?.finalText === "string" ? payload.finalText.trim() : "";
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

function updateCodexBridgeState() {
  const context = getCodexBridgeContext();
  codexBridgeButton.disabled = !context.draft;
  codexFocus.textContent =
    context.focusSentence || "No active sentence yet. Ghostline will hand off the whole draft.";
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

function cleanDraft(value) {
  return value.replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "true");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.append(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
}

function getCaretOffset(element) {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(element);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

function setCaretOffset(element, offset) {
  const selection = window.getSelection();
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let node = walker.nextNode();

  while (node) {
    const nextOffset = currentOffset + node.textContent.length;

    if (offset <= nextOffset) {
      range.setStart(node, offset - currentOffset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    currentOffset = nextOffset;
    node = walker.nextNode();
  }

  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function findSentenceRange(text, caretOffset) {
  if (!text.trim()) {
    return null;
  }

  const safeCaret = Math.max(0, Math.min(caretOffset, text.length));
  const startBoundary = findStartBoundary(text, safeCaret);
  const endBoundary = findEndBoundary(text, safeCaret);
  const rawText = text.slice(startBoundary, endBoundary);
  const leadingWhitespace = rawText.match(/^\s*/)?.[0] || "";
  const trailingWhitespace = rawText.match(/\s*$/)?.[0] || "";
  const sentenceText = rawText.trim();

  if (!sentenceText) {
    return null;
  }

  return {
    start: startBoundary,
    end: endBoundary,
    text: sentenceText,
    leadingWhitespace,
    trailingWhitespace
  };
}

function findStartBoundary(text, caretOffset) {
  for (let index = Math.max(0, caretOffset - 1); index >= 0; index -= 1) {
    if (/[.!?\n]/.test(text[index])) {
      return index + 1;
    }
  }

  return 0;
}

function findEndBoundary(text, caretOffset) {
  for (let index = caretOffset; index < text.length; index += 1) {
    if (/[.!?]/.test(text[index])) {
      return index + 1;
    }

    if (text[index] === "\n") {
      return index;
    }
  }

  return text.length;
}
