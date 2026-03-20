import AppKit
import ApplicationServices
import Carbon
import Foundation
import WebKit

private let bundledCodexBinary = "/Applications/Codex.app/Contents/Resources/codex"
private let app = NSApplication.shared
private let delegate = GhostlineDesktopApp()

app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

@MainActor
final class GhostlineDesktopApp: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let statusLine = NSMenuItem(title: "Starting Ghostline...", action: nil, keyEquivalent: "")
  private let openEditorMenuItem = NSMenuItem(
    title: "Open Editor",
    action: #selector(openEditor),
    keyEquivalent: "o"
  )
  private let rewriteMenuItem = NSMenuItem(
    title: "Rewrite Current Sentence",
    action: #selector(rewriteCurrentSentence),
    keyEquivalent: "g"
  )
  private let accessMenuItem = NSMenuItem(
    title: "Request Accessibility Access",
    action: #selector(requestAccessibilityAccess),
    keyEquivalent: "a"
  )
  private let quitMenuItem = NSMenuItem(title: "Quit Ghostline", action: #selector(quit), keyEquivalent: "q")

  private let focusInspector = FocusInspector()
  private let rewriteService = RewriteService()
  private var currentContext: FocusedTextContext?
  private var pollTimer: Timer?
  private var isBusy = false
  private var hotKeyController: HotKeyController?
  private var panelMode: PanelMode = .follow
  
  private var window: NSWindow?
  private var webView: WKWebView?

  func applicationDidFinishLaunching(_ notification: Notification) {
    configureMenu()
    registerHotKey()
    startPolling()
    refreshFocusedContext()
    openEditor()
  }

  func applicationWillTerminate(_ notification: Notification) {
    pollTimer?.invalidate()
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    if !flag {
      openEditor()
    } else {
      window?.makeKeyAndOrderFront(nil)
      NSApp.activate(ignoringOtherApps: true)
    }
    return true
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    false
  }

  private func configureMenu() {
    if let button = statusItem.button {
      button.image = NSImage(systemSymbolName: "pencil.and.sparkles", accessibilityDescription: "Ghostline")
      button.image?.isTemplate = true
    }

    openEditorMenuItem.target = self
    rewriteMenuItem.target = self
    rewriteMenuItem.keyEquivalentModifierMask = [.control, .option]
    accessMenuItem.target = self
    quitMenuItem.target = self

    let menu = NSMenu()
    menu.addItem(statusLine)
    menu.addItem(.separator())
    menu.addItem(openEditorMenuItem)
    menu.addItem(rewriteMenuItem)
    menu.addItem(accessMenuItem)
    menu.addItem(.separator())
    menu.addItem(quitMenuItem)
    statusItem.menu = menu
  }

  @objc private func openEditor() {
    if window == nil {
      let config = WKWebViewConfiguration()
      config.userContentController.add(self, name: "ghostline")
      
      let webView = WKWebView(frame: .zero, configuration: config)
      webView.setValue(false, forKey: "drawsBackground") // Transparent background
      
      let window = NSWindow(
        contentRect: NSRect(x: 0, y: 0, width: 460, height: 760),
        styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView],
        backing: .buffered,
        defer: false
      )
      window.center()
      window.title = "Ghostline"
      window.titleVisibility = .hidden
      window.titlebarAppearsTransparent = true
      window.isReleasedWhenClosed = false
      window.backgroundColor = NSColor.windowBackgroundColor
      window.level = .floating
      window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
      
      let visualEffect = NSVisualEffectView()
      visualEffect.blendingMode = .behindWindow
      visualEffect.state = .active
      visualEffect.material = .hudWindow
      window.contentView = visualEffect
      
      visualEffect.addSubview(webView)
      webView.translatesAutoresizingMaskIntoConstraints = false
      NSLayoutConstraint.activate([
        webView.topAnchor.constraint(equalTo: visualEffect.topAnchor),
        webView.bottomAnchor.constraint(equalTo: visualEffect.bottomAnchor),
        webView.leadingAnchor.constraint(equalTo: visualEffect.leadingAnchor),
        webView.trailingAnchor.constraint(equalTo: visualEffect.trailingAnchor)
      ])
      
      if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "public") {
        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
      }
      
      self.webView = webView
      self.window = window
    }

    guard panelMode != .hidden else {
      window?.orderOut(nil)
      return
    }

    window?.makeKeyAndOrderFront(nil)
    positionWindowIfNeeded()
    NSApp.activate(ignoringOtherApps: true)
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
    
    if action == "rewrite", let sentence = body["sentence"] as? String {
      let options = body["options"] as? [String: String] ?? [:]
      Task {
        do {
          let result = try await rewriteService.rewrite(sentence: sentence, options: options)
          let json = try JSONEncoder().encode(result)
          if let jsonString = String(data: json, encoding: .utf8) {
            _ = try? await webView?.evaluateJavaScript("window.onGhostlineResult(\(jsonString))")
          }
        } catch {
          let message = jsStringLiteral(error.localizedDescription)
          _ = try? await webView?.evaluateJavaScript("window.onGhostlineError(\(message))")
        }
      }
      return
    }

    if action == "rewriteFocused" {
      let options = body["options"] as? [String: String] ?? [:]
      rewriteFocusedSentence(options: options)
      return
    }

    if action == "preferences", let preferences = body["preferences"] as? [String: String] {
      updatePreferences(preferences)
      return
    }

    if action == "requestAccess" {
      requestAccessibilityAccess()
      return
    }
  }

  private func registerHotKey() {
    hotKeyController = HotKeyController()
    try? hotKeyController?.register()
  }

  private func startPolling() {
    pollTimer = Timer.scheduledTimer(withTimeInterval: 0.7, repeats: true) { [weak self] _ in
      Task { @MainActor in
        self?.refreshFocusedContext()
      }
    }
  }

  @objc private func refreshFocusedContext() {
    let hasAccess = AccessibilityPermission.isTrusted(prompt: false)
    accessMenuItem.isHidden = hasAccess
    guard hasAccess else {
      currentContext = nil
      rewriteMenuItem.isEnabled = false
      statusLine.title = "Grant Accessibility access."
      return
    }
    guard !isBusy else {
      rewriteMenuItem.isEnabled = false
      return
    }
    currentContext = focusInspector.captureFocusedTextContext()
    rewriteMenuItem.isEnabled = currentContext != nil
    if let context = currentContext {
      statusLine.title = "Ready. ⌃⌥G: \(context.sentence.prefix(30))..."
    } else {
      statusLine.title = "Focus a text field to start."
    }
    pushContextToWebView()
    positionWindowIfNeeded()
  }

  @objc func rewriteCurrentSentence() {
    rewriteFocusedSentence(options: [:])
  }

  private func rewriteFocusedSentence(options: [String: String]) {
    guard !isBusy, let context = focusInspector.captureFocusedTextContext() else { return }
    isBusy = true
    rewriteMenuItem.isEnabled = false
    statusLine.title = "Rewriting..."
    pushContextToWebView()
    
    Task {
      do {
        let rewrite = try await rewriteService.rewrite(sentence: context.sentence, options: options)
        try self.focusInspector.replaceSentence(in: context, with: rewrite.finalText)
        let payload = RewriteBridgePayload(
          originalText: context.sentence,
          improvedText: rewrite.improvedText,
          finalText: rewrite.finalText
        )
        if let json = try? JSONEncoder().encode(payload), let jsonString = String(data: json, encoding: .utf8) {
          _ = try? await self.webView?.evaluateJavaScript("window.onGhostlineResult(\(jsonString))")
        }
        self.isBusy = false
        self.statusLine.title = "Done."
        self.refreshFocusedContext()
      } catch {
        self.isBusy = false
        self.statusLine.title = error.localizedDescription
        let message = jsStringLiteral(error.localizedDescription)
        _ = try? await self.webView?.evaluateJavaScript("window.onGhostlineError(\(message))")
      }
    }
  }

  @objc private func requestAccessibilityAccess() {
    _ = AccessibilityPermission.isTrusted(prompt: true)
  }

  @objc private func quit() {
    NSApplication.shared.terminate(nil)
  }

  private func updatePreferences(_ preferences: [String: String]) {
    if let mode = preferences["displayMode"], let parsedMode = PanelMode(rawValue: mode) {
      panelMode = parsedMode
    }
    positionWindowIfNeeded()
  }

  private func pushContextToWebView() {
    let payload = FocusContextPayload(
      sentence: currentContext?.sentence ?? "",
      appName: focusInspector.frontmostAppName(),
      hasAccess: AccessibilityPermission.isTrusted(prompt: false),
      status: statusLine.title
    )
    guard let json = try? JSONEncoder().encode(payload), let jsonString = String(data: json, encoding: .utf8) else {
      return
    }
    _ = webView?.evaluateJavaScript("window.onGhostlineContext(\(jsonString))")
  }

  private func positionWindowIfNeeded() {
    guard let window else { return }

    if panelMode == .hidden {
      window.orderOut(nil)
      return
    }

    if panelMode == .docked {
      if !window.isVisible {
        window.center()
        window.makeKeyAndOrderFront(nil)
      }
      return
    }

    guard let frame = currentContext?.elementFrame else {
      if !window.isVisible {
        window.center()
        window.makeKeyAndOrderFront(nil)
      }
      return
    }

    let targetScreen = NSScreen.screens.first { $0.visibleFrame.intersects(frame) } ?? NSScreen.main
    let visibleFrame = targetScreen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? .zero
    let windowSize = window.frame.size
    let horizontalPadding: CGFloat = 18
    let verticalPadding: CGFloat = 10
    var x = frame.maxX + horizontalPadding
    if x + windowSize.width > visibleFrame.maxX {
      x = max(visibleFrame.minX + 12, frame.minX - windowSize.width - horizontalPadding)
    }
    let preferredY = frame.maxY - 48
    let y = min(
      max(visibleFrame.minY + 12, preferredY - windowSize.height),
      visibleFrame.maxY - windowSize.height - verticalPadding
    )
    window.setFrameOrigin(NSPoint(x: x, y: y))
    if !window.isVisible {
      window.makeKeyAndOrderFront(nil)
    }
  }
}

@MainActor
enum AccessibilityPermission {
  static func isTrusted(prompt: Bool) -> Bool {
    let options = ["AXTrustedCheckOptionPrompt": prompt] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
  }
}

struct FocusedTextContext: @unchecked Sendable {
  let element: AXUIElement
  let fullText: String
  let replacementRange: NSRange
  let sentence: String
  let leadingWhitespace: String
  let trailingWhitespace: String
  let elementFrame: CGRect?
}

final class FocusInspector {
  func captureFocusedTextContext() -> FocusedTextContext? {
    let systemElement = AXUIElementCreateSystemWide()
    var focusedObject: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(systemElement, kAXFocusedUIElementAttribute as CFString, &focusedObject)
    guard result == .success, let focusedObject else { return nil }
    let element = unsafeDowncast(focusedObject, to: AXUIElement.self)
    
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &value)
    guard let fullText = value as? String, !fullText.isEmpty else { return nil }
    
    var rangeValue: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &rangeValue)
    guard let rangeVal = rangeValue, CFGetTypeID(rangeVal) == AXValueGetTypeID() else { return nil }
    var range = CFRange()
    AXValueGetValue(unsafeDowncast(rangeVal, to: AXValue.self), .cfRange, &range)
    
    guard let context = findSentenceContext(in: fullText, caretOffset: range.location) else { return nil }
    return FocusedTextContext(
      element: element,
      fullText: fullText,
      replacementRange: context.replacementRange,
      sentence: context.sentence,
      leadingWhitespace: context.leadingWhitespace,
      trailingWhitespace: context.trailingWhitespace,
      elementFrame: elementFrame(for: element)
    )
  }

  func replaceSentence(in context: FocusedTextContext, with rewrittenSentence: String) throws {
    let replacement = context.leadingWhitespace + rewrittenSentence + context.trailingWhitespace
    let updatedText = (context.fullText as NSString).replacingCharacters(in: context.replacementRange, with: replacement)
    AXUIElementSetAttributeValue(context.element, kAXValueAttribute as CFString, updatedText as CFString)
    
    var nextSelection = CFRange(location: context.replacementRange.location + (context.leadingWhitespace as NSString).length + (rewrittenSentence as NSString).length, length: 0)
    if let selectionValue = AXValueCreate(.cfRange, &nextSelection) {
      AXUIElementSetAttributeValue(context.element, kAXSelectedTextRangeAttribute as CFString, selectionValue)
    }
  }

  private func findSentenceContext(in text: String, caretOffset: Int) -> SentenceContext? {
    let nsText = text as NSString
    let safeCaret = max(0, min(caretOffset, nsText.length))
    var start = safeCaret
    while start > 0 {
      let char = nsText.character(at: start - 1)
      if char == 46 || char == 33 || char == 63 || char == 10 { break }
      start -= 1
    }
    var end = safeCaret
    while end < nsText.length {
      let char = nsText.character(at: end)
      if char == 46 || char == 33 || char == 63 { end += 1; break }
      if char == 10 { break }
      end += 1
    }
    let range = NSRange(location: start, length: end - start)
    let raw = nsText.substring(with: range)
    let lead = String(raw.prefix(while: \.isWhitespace))
    let trail = String(raw.reversed().prefix(while: \.isWhitespace).reversed())
    let sentence = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    return sentence.isEmpty ? nil : SentenceContext(replacementRange: range, sentence: sentence, leadingWhitespace: lead, trailingWhitespace: trail)
  }

  func frontmostAppName() -> String {
    NSWorkspace.shared.frontmostApplication?.localizedName ?? ""
  }

  private func elementFrame(for element: AXUIElement) -> CGRect? {
    var positionValue: CFTypeRef?
    var sizeValue: CFTypeRef?
    let positionResult = AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionValue)
    let sizeResult = AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeValue)
    guard positionResult == .success, sizeResult == .success,
          let positionValue,
          let sizeValue,
          CFGetTypeID(positionValue) == AXValueGetTypeID(),
          CFGetTypeID(sizeValue) == AXValueGetTypeID() else {
      return nil
    }

    let positionAX = unsafeDowncast(positionValue, to: AXValue.self)
    let sizeAX = unsafeDowncast(sizeValue, to: AXValue.self)

    var point = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(positionAX, .cgPoint, &point), AXValueGetValue(sizeAX, .cgSize, &size) else {
      return nil
    }

    return CGRect(origin: point, size: size)
  }
}

private struct SentenceContext {
  let replacementRange: NSRange
  let sentence: String
  let leadingWhitespace: String
  let trailingWhitespace: String
}

struct RewriteResult: Codable {
  let improvedText: String
  let finalText: String
}

private struct RewriteBridgePayload: Codable {
  let originalText: String
  let improvedText: String
  let finalText: String
}

private struct FocusContextPayload: Codable {
  let sentence: String
  let appName: String
  let hasAccess: Bool
  let status: String
}

private enum PanelMode: String {
  case follow
  case docked
  case hidden
}

final class RewriteService: Sendable {
  func rewrite(sentence: String, options: [String: String]) async throws -> RewriteResult {
    let provider = normalizedOption(options["provider"]) ?? "codex"
    let requestedModel = normalizedOption(options["model"])
    let tone = normalizedOption(options["tone"]) ?? "natural"

    if provider == "codex" {
      return try await rewriteWithCodex(sentence: sentence, model: requestedModel, tone: tone)
    }

    let resolved = try resolveProviderOptions(provider: provider, options: options)
    return try await rewriteWithCompatibleProvider(
      sentence: sentence,
      provider: resolved,
      tone: tone
    )
  }

  private func rewriteWithCodex(sentence: String, model: String?, tone: String) async throws -> RewriteResult {
    let fileManager = FileManager.default
    let tempDir = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true)
    defer { try? fileManager.removeItem(at: tempDir) }
    
    let schemaURL = tempDir.appendingPathComponent("schema.json")
    let outputURL = tempDir.appendingPathComponent("rewrite.json")
    let schema = """
    {"type":"object","properties":{"improvedText":{"type":"string"},"finalText":{"type":"string"}},"required":["improvedText","finalText"],"additionalProperties":false}
    """
    try schema.write(to: schemaURL, atomically: true, encoding: .utf8)
    
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    var args = [resolvedCodexBinary(), "exec", "--skip-git-repo-check", "--sandbox", "read-only", "--ephemeral", "--color", "never", "--output-schema", schemaURL.path, "--output-last-message", outputURL.path]
    if let m = model { args += ["--model", m] }
    args.append("-")
    process.arguments = args
    
    let stdin = Pipe()
    process.standardInput = stdin
    let prompt = GhostlineFiles.prompt(for: sentence, tone: tone)
    
    try process.run()
    stdin.fileHandleForWriting.write(prompt.data(using: .utf8)!)
    try stdin.fileHandleForWriting.close()
    process.waitUntilExit()

    guard process.terminationStatus == 0 else {
      throw GhostlineDesktopError(message: "Codex exited with status \(process.terminationStatus).")
    }

    guard fileManager.fileExists(atPath: outputURL.path) else {
      throw GhostlineDesktopError(message: "Codex did not return a rewrite payload.")
    }
    
    let data = try Data(contentsOf: outputURL)
    return try JSONDecoder().decode(RewriteResult.self, from: data)
  }

  private func rewriteWithCompatibleProvider(sentence: String, provider: ProviderOptions, tone: String) async throws -> RewriteResult {
    let improved = try await createCompatibleCompletion(
      provider: provider,
      instructions: GhostlineFiles.improveInstruction(for: tone),
      input: sentence
    )
    let final = try await createCompatibleCompletion(
      provider: provider,
      instructions: GhostlineFiles.humanizeInstruction(for: tone),
      input: "Original: \(sentence)\nImproved: \(improved)"
    )

    return RewriteResult(improvedText: improved, finalText: final)
  }

  private func createCompatibleCompletion(
    provider: ProviderOptions,
    instructions: String,
    input: String
  ) async throws -> String {
    var request = URLRequest(url: try responseURL(from: provider.endpoint))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if provider.provider != "ollama" {
      request.setValue("Bearer \(provider.apiKey)", forHTTPHeaderField: "Authorization")
    }

    if provider.provider == "openrouter" {
      request.setValue("https://github.com/Collab2Dev/Ghostline", forHTTPHeaderField: "HTTP-Referer")
      request.setValue("Ghostline", forHTTPHeaderField: "X-Title")
    }

    if provider.provider == "gemini" {
      request.setValue("collab2dev-ghostline/1.0.0", forHTTPHeaderField: "x-goog-api-client")
    }

    let body: [String: Any] = [
      "model": provider.model,
      "messages": [
        ["role": "system", "content": instructions],
        ["role": "user", "content": input]
      ],
      "temperature": 0.4,
      "max_completion_tokens": 180
    ]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await URLSession.shared.data(for: request)
    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

    if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
      let apiMessage = ((json?["error"] as? [String: Any])?["message"] as? String) ?? "Rewrite request failed."
      throw GhostlineDesktopError(message: apiMessage)
    }

    let content = ((json?["choices"] as? [[String: Any]])?.first?["message"] as? [String: Any])?["content"]
    if let text = content as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    if let contentArray = content as? [[String: Any]] {
      let text = contentArray
        .compactMap { $0["text"] as? String }
        .joined(separator: " ")
        .trimmingCharacters(in: .whitespacesAndNewlines)
      if !text.isEmpty {
        return text
      }
    }

    throw GhostlineDesktopError(message: "The provider returned an empty rewrite.")
  }

  private func normalizedOption(_ value: String?) -> String? {
    guard let value else {
      return nil
    }

    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private func resolvedCodexBinary() -> String {
    FileManager.default.fileExists(atPath: bundledCodexBinary) ? bundledCodexBinary : "codex"
  }

  private func responseURL(from baseURL: String) throws -> URL {
    let trimmed = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalized = trimmed.hasSuffix("/chat/completions") ? trimmed : "\(trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/chat/completions"

    guard let url = URL(string: normalized) else {
      throw GhostlineDesktopError(message: "The endpoint URL is invalid.")
    }

    return url
  }

  private func resolveProviderOptions(provider: String, options: [String: String]) throws -> ProviderOptions {
    let preset = providerPresets[provider] ?? providerPresets["custom"]!
    let endpoint = normalizedOption(options["endpoint"]) ?? preset.endpoint
    let model = normalizedOption(options["model"]) ?? preset.defaultModel
    let apiKey =
      normalizedOption(options["apiKey"]) ??
      (preset.apiKeyEnv.flatMap { normalizedOption(ProcessInfo.processInfo.environment[$0]) } ?? "")

    guard let endpoint, !endpoint.isEmpty else {
      throw GhostlineDesktopError(message: "No endpoint is configured for \(preset.label).")
    }

    guard !model.isEmpty else {
      throw GhostlineDesktopError(message: "Pick a model name for \(preset.label).")
    }

    if provider != "ollama" && apiKey.isEmpty {
      throw GhostlineDesktopError(message: "Add an API key for \(preset.label).")
    }

    return ProviderOptions(
      provider: provider,
      label: preset.label,
      endpoint: endpoint,
      model: model,
      apiKey: apiKey
    )
  }
}

private struct ProviderPreset {
  let label: String
  let defaultModel: String
  let endpoint: String?
  let apiKeyEnv: String?
}

private struct ProviderOptions {
  let provider: String
  let label: String
  let endpoint: String
  let model: String
  let apiKey: String
}

private let providerPresets: [String: ProviderPreset] = [
  "openai": ProviderPreset(
    label: "OpenAI",
    defaultModel: "gpt-5-mini",
    endpoint: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY"
  ),
  "claude": ProviderPreset(
    label: "Claude",
    defaultModel: "claude-sonnet-4-0",
    endpoint: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY"
  ),
  "gemini": ProviderPreset(
    label: "Gemini",
    defaultModel: "gemini-2.5-flash",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyEnv: "GEMINI_API_KEY"
  ),
  "kimi": ProviderPreset(
    label: "Kimi",
    defaultModel: "kimi-latest",
    endpoint: "https://api.moonshot.cn/v1",
    apiKeyEnv: "MOONSHOT_API_KEY"
  ),
  "qwen": ProviderPreset(
    label: "Qwen",
    defaultModel: "qwen-plus",
    endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY"
  ),
  "openrouter": ProviderPreset(
    label: "OpenRouter",
    defaultModel: "openai/gpt-5-mini",
    endpoint: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY"
  ),
  "groq": ProviderPreset(
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    endpoint: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY"
  ),
  "deepseek": ProviderPreset(
    label: "DeepSeek",
    defaultModel: "deepseek-chat",
    endpoint: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY"
  ),
  "ollama": ProviderPreset(
    label: "Ollama",
    defaultModel: "llama3.1:8b",
    endpoint: "http://localhost:11434/v1",
    apiKeyEnv: nil
  ),
  "custom": ProviderPreset(
    label: "Custom",
    defaultModel: "",
    endpoint: nil,
    apiKeyEnv: nil
  )
]

private enum GhostlineFiles {
  static func improveInstruction(for tone: String) -> String {
    "Rewrite the sentence so it reads cleaner, sharper, and more polished without changing the meaning, tone, or sentence count. Aim for a \(tone) voice. Return exactly one sentence."
  }

  static func humanizeInstruction(for tone: String) -> String {
    "Make the sentence sound more natural, warm, and human while keeping the original meaning. Aim for a \(tone) voice. Avoid cliches and AI-sounding phrasing. Return exactly one sentence."
  }
  
  static func prompt(for sentence: String, tone: String) -> String {
    "You are Ghostline. Return strict JSON with improvedText and finalText fields. improvedText should polish the sentence while keeping meaning and aiming for a \(tone) voice. finalText should sound natural and human with the same \(tone) voice.\\nSentence: \(sentence)"
  }
}

final class HotKeyController {
  func register() throws {
    let hotKeyID = EventHotKeyID(signature: OSType(0x47484f53), id: 1)
    RegisterEventHotKey(UInt32(kVK_ANSI_G), UInt32(controlKey | optionKey), hotKeyID, GetApplicationEventTarget(), 0, nil)
    
    var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), { (_, _, _) in
      Task { @MainActor in delegate.rewriteCurrentSentence() }
      return noErr
    }, 1, &eventType, nil, nil)
  }
}

struct GhostlineDesktopError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

private func jsStringLiteral(_ value: String) -> String {
  let data = try? JSONEncoder().encode(value)
  return String(data: data ?? Data("\"Rewrite failed.\"".utf8), encoding: .utf8) ?? "\"Rewrite failed.\""
}
