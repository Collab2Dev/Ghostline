# Ghostline

Ghostline is a silent writing assistant inspired by Grammarly's one-tap polish flow, but without popups, highlights, or suggestion cards.

Put the caret inside a sentence, press `Tab`, and the app will:

1. Improve that one sentence.
2. Bridge the improved sentence into a humanizer pass.
3. Replace the original sentence directly in the editor.
4. Let you copy a Codex-ready handoff prompt with the current draft, focus sentence, and latest rewrite.

## Features

- **In-place Rewriting:** No popups or flashes. The sentence updates directly where you type.
- **YOLO Mode:** Optional auto-rewrite after a 1.5s pause or on paragraph breaks.
- **Provider Choice:** Use local Codex (default), OpenAI API, or any custom OpenAI-compatible endpoint (like Ollama).
- **Native macOS App:** A lightweight menu bar companion that works in any app via Accessibility APIs.
- **Shimmer Effect:** Visual feedback during rewriting so you know exactly what is being processed.

## Installation & Usage

### 1. Download the App
Download the latest `Ghostline-mac.zip` from the [Releases](https://github.com/Collab2Dev/Ghostline/releases) page. Unzip and move `Ghostline.app` to your Applications folder.

### 2. Setup
On first launch:
1. Open the Ghostline menu bar item (pencil and sparkles icon).
2. Click **Request Accessibility Access**.
3. Approve Ghostline in macOS System Settings.

### 3. Usage
- **In any app:** Press `Control` + `Option` + `G` to rewrite the current sentence.
- **In the Ghostline Editor:** Press `Tab` or enable **YOLO Mode** in Settings.

## Development

### Prerequisites
- macOS 13.0+
- Xcode / Swift 6.0+
- Node.js 18+

### Build the `.app` Bundle
Run the following command to build, package, and sign the application:

```bash
make app
```

This creates `Ghostline.app` and `Ghostline-mac.zip`.

### Run from Source (Terminal)
```bash
# Start the Node server
node server.mjs

# Run the Desktop assistant
swift run GhostlineDesktop
```

## Configuration

Settings are managed directly in the Ghostline Editor's gear icon menu:
- **Model:** Codex (Default) / OpenAI / Custom.
- **API Key:** Stored locally in your browser.
- **Endpoint:** Support for custom base URLs (e.g., `http://localhost:11434/v1`).

## Notes

- **Default backend:** Local Codex CLI (requires `codex login`).
- **OpenAI Fallback:** If you provide an API key, Ghostline can fallback to OpenAI if Codex is unavailable.
- **Local Privacy:** Your writing is processed according to your chosen provider's privacy policy. The "Codex Bridge" is local-only.
