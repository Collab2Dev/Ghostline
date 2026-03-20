# Ghostline

Ghostline is a silent writing assistant inspired by Grammarly's one-tap polish flow, but without popups, highlights, or suggestion cards.

Put the caret inside a sentence, press `Tab`, and the app will:

1. Improve that one sentence.
2. Bridge the improved sentence into a humanizer pass.
3. Replace the original sentence directly in the editor.
4. Let you copy a Codex-ready handoff prompt with the current draft, focus sentence, and latest rewrite.

The UI is styled like a glossy macOS Tahoe-era glass window with a fake `Wi-Fi Off` control tile.

## Run it

Make sure Node 18+ is installed, open a terminal in the project folder, sign in to Codex once, then start the app:

```bash
cd /Users/wr/github/Ghostline
/Applications/Codex.app/Contents/Resources/codex login
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Ghostline can also use API-key backends. Set `GHOSTLINE_PROVIDER` to force one, or leave it on `auto` and Ghostline will try the configured backends in this order:

1. Codex
2. OpenAI
3. Claude
4. Gemini

## Notes

- Default backend: local Codex CLI using your Codex or ChatGPT login
- Choose a backend with `GHOSTLINE_PROVIDER=auto|codex|openai|claude|anthropic|gemini`
- Override the Codex model with `CODEX_MODEL`
- OpenAI uses `OPENAI_API_KEY` and optional `OPENAI_MODEL`
- Claude uses `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL`
- Gemini uses `GEMINI_API_KEY` and optional `GEMINI_MODEL`
- No extra dependencies are required
- The Codex bridge is local-only and does not make an extra API call

Examples:

```bash
cd /Users/wr/github/Ghostline
GHOSTLINE_PROVIDER=claude ANTHROPIC_API_KEY="your_key_here" npm start
```

```bash
cd /Users/wr/github/Ghostline
GHOSTLINE_PROVIDER=gemini GEMINI_API_KEY="your_key_here" npm start
```

The web UI also has a provider selector now, so you can switch between Auto, Codex, OpenAI, Claude, and Gemini without editing the request payload by hand.

## Background App

If you want Ghostline to live on your Mac like a lightweight Grammarly-style helper, there is now a local menu bar app:

```bash
cd /Users/wr/github/Ghostline
swift run GhostlineDesktop
```

On first launch:

1. Open the Ghostline menu bar item.
2. Click `Request Accessibility Access`.
3. Approve Ghostline in macOS System Settings so it can read and replace text in the focused field.

After that:

1. Place your caret inside a sentence in any editable macOS text field that exposes Accessibility text APIs.
2. Press `Control` + `Option` + `G`, or click `Rewrite Current Sentence` from the menu bar.
3. Ghostline rewrites that sentence locally through the Codex CLI and writes it back into the focused field.

Current limitations:

- This is a native macOS prototype, not a packaged `.app` bundle yet.
- Some apps block Accessibility-based text replacement, so behavior will vary by editor.
- The helper detects focused editable fields and rewrites on demand; it does not yet auto-rewrite as you type.
- The native helper is still Codex-backed for now; Claude and Gemini options currently apply to the web app path.
