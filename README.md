# Ghostline

Ghostline is a quiet writing companion for macOS. It sits beside your current editor, reads the sentence under your caret, rewrites it in place, and stays out of the document itself.

## What It Does

- Rewrites the focused sentence directly in apps like Word, Notes, and browsers.
- Uses local Codex by default, with OpenAI, Claude, Gemini, Ollama, and compatible providers available in the app UI.
- Lets you keep the webpage-based control surface while shipping as a real macOS application.
- Supports manual rewrite with `Control` + `Option` + `G` and optional YOLO auto-rewrite after a short pause.

## Install It Like a Normal Mac App

Build a drag-and-drop installer disk image:

```bash
make dmg
```

That creates:

- `Ghostline.app`
- `Ghostline-mac.dmg`

Open the DMG, drag `Ghostline.app` into `Applications`, then launch it like a normal Mac app.

## First Launch

When Ghostline opens:

1. Click `Request All Permissions`.
2. Approve Accessibility.
3. Approve Automation.
4. Approve Screen Recording if you want richer screen-aware behavior.

After that, Ghostline should stay usable as a regular installed app from `Applications`.

## Run From Source

If you are working in the repo directly:

```bash
cd /Users/wr/github/Ghostline
/Applications/Codex.app/Contents/Resources/codex login
swift run GhostlineDesktop
```

If you want the desktop app to load the live browser-served page instead of the bundled one:

Terminal 1:

```bash
cd /Users/wr/github/Ghostline
npm start
```

Terminal 2:

```bash
cd /Users/wr/github/Ghostline
GHOSTLINE_EDITOR_URL=http://127.0.0.1:3000 swift run GhostlineDesktop
```

## Provider Setup

Settings live inside the Ghostline UI:

- `Provider`
- `Model`
- `API Key`
- `Endpoint`
- `YOLO Mode`
- `Display Mode`

For `Codex`, do not paste an API key into the app. Ghostline uses your local Codex login.

## Notes

- `make app` builds and signs the `.app` bundle only.
- `make zip` creates a zip archive of the app bundle.
- `make dmg` creates the normal macOS installer image.
- The desktop app requests real macOS permissions through the native wrapper, not only through the webpage.
