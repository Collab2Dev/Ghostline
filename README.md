# Ghostline

Ghostline is a silent writing assistant inspired by Grammarly's one-tap polish flow, but without popups, highlights, or suggestion cards.

Put the caret inside a sentence, press `Tab`, and the app will:

1. Improve that one sentence.
2. Bridge the improved sentence into a humanizer pass.
3. Replace the original sentence directly in the editor.

The UI is styled like a glossy macOS Tahoe-era glass window with a fake `Wi-Fi Off` control tile.

## Run it

Make sure Node 18+ is installed, then start the app with your OpenAI API key in the environment:

```bash
export OPENAI_API_KEY="your_key_here"
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- Default model: `gpt-5-mini`
- Override it with `OPENAI_MODEL`
- No extra dependencies are required
