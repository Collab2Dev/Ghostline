const editor = document.querySelector("#editor");
const srStatus = document.querySelector("#srStatus");
const wifiPill = document.querySelector("#wifiPill");
const wifiTile = document.querySelector("#wifiTile");
const codexBridgeButton = document.querySelector("#codexBridgeButton");
const codexFocus = document.querySelector("#codexFocus");
const codexStatus = document.querySelector("#codexStatus");

let isRewriting = false;
let lastRewriteSnapshot = null;
let lastFocusedSentence = "";

editor.addEventListener("keydown", async (event) => {
  if (event.key !== "Tab") {
    return;
  }

  event.preventDefault();

  if (isRewriting) {
    return;
  }

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

  try {
    setBusyState(true);
    srStatus.textContent = "Rewriting current sentence.";

    const rewrittenSentence = await rewriteSentence(sentenceRange.text.trim());

    if (!rewrittenSentence) {
      return;
    }

    const nextContent =
      content.slice(0, sentenceRange.start) +
      sentenceRange.leadingWhitespace +
      rewrittenSentence +
      sentenceRange.trailingWhitespace +
      content.slice(sentenceRange.end);

    editor.textContent = nextContent;
    setCaretOffset(
      editor,
      sentenceRange.start + sentenceRange.leadingWhitespace.length + rewrittenSentence.length
    );
    lastRewriteSnapshot = {
      original: sentenceRange.text.trim(),
      rewritten: rewrittenSentence
    };
    srStatus.textContent = "Sentence rewritten.";
    updateCodexBridgeState();
  } catch (error) {
    console.error(error);
    srStatus.textContent = "Rewrite failed.";
  } finally {
    setBusyState(false);
  }
});

editor.addEventListener("paste", (event) => {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    editor.textContent = `${editor.textContent || ""}${text}`;
    setCaretOffset(editor, (editor.textContent || "").length);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  updateCodexBridgeState();
});

editor.addEventListener("input", updateCodexBridgeState);
editor.addEventListener("keyup", updateCodexBridgeState);
editor.addEventListener("mouseup", updateCodexBridgeState);
document.addEventListener("selectionchange", updateCodexBridgeState);
codexBridgeButton.addEventListener("click", handleCodexBridgeCopy);

updateCodexBridgeState();

function setBusyState(isBusy) {
  isRewriting = isBusy;
  editor.setAttribute("aria-busy", String(isBusy));
  wifiPill.classList.toggle("is-busy", isBusy);
  wifiTile.classList.toggle("is-busy", isBusy);
}

async function rewriteSentence(sentence) {
  const response = await fetch("/api/rewrite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sentence })
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
