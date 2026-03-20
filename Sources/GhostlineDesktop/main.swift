import AppKit
import ApplicationServices
import Carbon
import Foundation

private let app = NSApplication.shared
private let delegate = GhostlineDesktopApp()

app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()

@MainActor
final class GhostlineDesktopApp: NSObject, NSApplicationDelegate {
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let statusLine = NSMenuItem(title: "Starting Ghostline Desktop...", action: nil, keyEquivalent: "")
  private let openEditorMenuItem = NSMenuItem(
    title: "Open Editor",
    action: #selector(openGhostlineDemo),
    keyEquivalent: "o"
  )
  private let rewriteMenuItem = NSMenuItem(
    title: "Rewrite Current Sentence",
    action: #selector(rewriteCurrentSentence),
    keyEquivalent: "g"
  )
  private let settingsMenuItem = NSMenuItem(
    title: "Settings",
    action: #selector(openSettings),
    keyEquivalent: ","
  )
  private let accessMenuItem = NSMenuItem(
    title: "Request Accessibility Access",
    action: #selector(requestAccessibilityAccess),
    keyEquivalent: "a"
  )
  private let quitMenuItem = NSMenuItem(title: "Quit Ghostline Desktop", action: #selector(quit), keyEquivalent: "q")

  private let focusInspector = FocusInspector()
  private let rewriteService = RewriteService()
  private var currentContext: FocusedTextContext?
  private var pollTimer: Timer?
  private var isBusy = false
  private var hotKeyController: HotKeyController?
  private var serverProcess: Process?

  func applicationDidFinishLaunching(_ notification: Notification) {
    configureMenu()
    registerHotKey()
    startPolling()
    startNodeServer()
    refreshFocusedContext()
    
    // Open editor on first launch
    let hasLaunchedBefore = UserDefaults.standard.bool(forKey: "hasLaunchedBefore")
    if !hasLaunchedBefore {
      openGhostlineDemo()
      UserDefaults.standard.set(true, forKey: "hasLaunchedBefore")
    }
  }

  func applicationWillTerminate(_ notification: Notification) {
    pollTimer?.invalidate()
    serverProcess?.terminate()
  }

  private func configureMenu() {
    if let button = statusItem.button {
      button.image = NSImage(systemSymbolName: "pencil.and.sparkles", accessibilityDescription: "Ghostline")
      button.image?.isTemplate = true
    }

    openEditorMenuItem.target = self
    rewriteMenuItem.target = self
    rewriteMenuItem.keyEquivalentModifierMask = [.control, .option]
    settingsMenuItem.target = self
    accessMenuItem.target = self
    quitMenuItem.target = self

    let menu = NSMenu()
    menu.addItem(statusLine)
    menu.addItem(.separator())
    menu.addItem(openEditorMenuItem)
    menu.addItem(rewriteMenuItem)
    menu.addItem(settingsMenuItem)
    menu.addItem(accessMenuItem)
    menu.addItem(.separator())
    menu.addItem(quitMenuItem)
    statusItem.menu = menu
  }

  private func startNodeServer() {
    guard let serverPath = Bundle.main.path(forResource: "server", ofType: "mjs") else {
      statusLine.title = "Could not find server.mjs in bundle."
      return
    }
    
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = ["node", serverPath]
    
    var env = ProcessInfo.processInfo.environment
    
    // Ensure Node can be found when launched from Finder
    let currentPath = env["PATH"] ?? ""
    let commonPaths = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"]
    let newPath = (commonPaths + [currentPath]).joined(separator: ":")
    env["PATH"] = newPath
    
    // Point to bundled public folder
    if let publicPath = Bundle.main.path(forResource: "public", ofType: nil) {
      env["PUBLIC_DIR"] = publicPath
    }
    
    process.environment = env
    
    do {
      try process.run()
      self.serverProcess = process
    } catch {
      statusLine.title = "Failed to start Node server: \(error.localizedDescription)"
    }
  }

  @objc private func openSettings() {
    // For now, since it's a web-based UI, open settings in the web view
    guard let url = URL(string: "http://127.0.0.1:3000") else {
      return
    }
    NSWorkspace.shared.open(url)
    // We can't easily trigger the gear icon from here without more complex communication,
    // so we'll just open the main UI which has the gear icon.
  }

  private func registerHotKey() {
    hotKeyController = HotKeyController { [weak self] in
      guard let self else {
        return
      }

      self.rewriteCurrentSentence()
    }

    do {
      try hotKeyController?.register()
    } catch {
      statusLine.title = error.localizedDescription
    }
  }

  private func startPolling() {
    pollTimer = Timer.scheduledTimer(
      timeInterval: 0.7,
      target: self,
      selector: #selector(refreshFocusedContext),
      userInfo: nil,
      repeats: true
    )
  }

  @objc private func refreshFocusedContext() {
    let hasAccess = AccessibilityPermission.isTrusted(prompt: false)

    accessMenuItem.isHidden = hasAccess

    guard hasAccess else {
      currentContext = nil
      rewriteMenuItem.isEnabled = false
      statusLine.title = "Grant Accessibility access so Ghostline can see the focused text field."
      return
    }

    guard !isBusy else {
      rewriteMenuItem.isEnabled = false
      statusLine.title = "Rewriting the current sentence..."
      return
    }

    currentContext = focusInspector.captureFocusedTextContext()
    rewriteMenuItem.isEnabled = currentContext != nil

    if let context = currentContext {
      let appName = NSWorkspace.shared.frontmostApplication?.localizedName ?? "the active app"
      statusLine.title = "Ready in \(appName). Press Control+Option+G: \(context.sentence)"
    } else {
      statusLine.title = "No editable text field is focused right now."
    }
  }

  @objc private func rewriteCurrentSentence() {
    guard !isBusy else {
      return
    }

    guard AccessibilityPermission.isTrusted(prompt: false) else {
      statusLine.title = "Accessibility access is required before Ghostline can rewrite in place."
      return
    }

    guard let context = focusInspector.captureFocusedTextContext() else {
      statusLine.title = "Focus a text field and place the caret inside a sentence first."
      return
    }

    isBusy = true
    rewriteMenuItem.isEnabled = false
    statusLine.title = "Rewriting the current sentence..."
    let rewriteService = self.rewriteService
    let sentence = context.sentence

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let rewrite = try rewriteService.rewrite(sentence: sentence)

        DispatchQueue.main.async {
          do {
            try self.focusInspector.replaceSentence(in: context, with: rewrite.finalText)
            self.isBusy = false
            self.statusLine.title = "Rewrote: \(rewrite.finalText)"
            self.refreshFocusedContext()
          } catch {
            self.isBusy = false
            self.statusLine.title = error.localizedDescription
            self.refreshFocusedContext()
          }
        }
      } catch {
        DispatchQueue.main.async {
          self.isBusy = false
          self.statusLine.title = error.localizedDescription
          self.refreshFocusedContext()
        }
      }
    }
  }

  @objc private func requestAccessibilityAccess() {
    _ = AccessibilityPermission.isTrusted(prompt: true)
    refreshFocusedContext()
  }

  @objc private func openGhostlineDemo() {
    guard let url = URL(string: "http://127.0.0.1:3000") else {
      return
    }

    NSWorkspace.shared.open(url)
  }

  @objc private func quit() {
    NSApplication.shared.terminate(nil)
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
}

final class FocusInspector {
  func captureFocusedTextContext() -> FocusedTextContext? {
    let systemElement = AXUIElementCreateSystemWide()
    var focusedObject: CFTypeRef?
    let focusedResult = AXUIElementCopyAttributeValue(
      systemElement,
      kAXFocusedUIElementAttribute as CFString,
      &focusedObject
    )

    guard
      focusedResult == .success,
      let focusedObject,
      CFGetTypeID(focusedObject) == AXUIElementGetTypeID()
    else {
      return nil
    }

    let focusedElement = unsafeDowncast(focusedObject, to: AXUIElement.self)

    guard isEditable(focusedElement) else {
      return nil
    }

    guard let fullText = copyStringAttribute(focusedElement, kAXValueAttribute as CFString), !fullText.isEmpty else {
      return nil
    }

    guard let selectedRange = copySelectedRangeAttribute(focusedElement) else {
      return nil
    }

    guard let sentenceContext = findSentenceContext(in: fullText, caretOffset: selectedRange.location) else {
      return nil
    }

    return FocusedTextContext(
      element: focusedElement,
      fullText: fullText,
      replacementRange: sentenceContext.replacementRange,
      sentence: sentenceContext.sentence,
      leadingWhitespace: sentenceContext.leadingWhitespace,
      trailingWhitespace: sentenceContext.trailingWhitespace
    )
  }

  func replaceSentence(in context: FocusedTextContext, with rewrittenSentence: String) throws {
    let replacement = context.leadingWhitespace + rewrittenSentence + context.trailingWhitespace
    let updatedText = (context.fullText as NSString).replacingCharacters(
      in: context.replacementRange,
      with: replacement
    )

    let setValueResult = AXUIElementSetAttributeValue(
      context.element,
      kAXValueAttribute as CFString,
      updatedText as CFString
    )

    guard setValueResult == .success else {
      throw GhostlineDesktopError(
        "Ghostline could not write back into the focused field. Some apps block Accessibility edits."
      )
    }

    var nextSelection = CFRange(
      location: context.replacementRange.location
        + (context.leadingWhitespace as NSString).length
        + (rewrittenSentence as NSString).length,
      length: 0
    )

    guard let selectionValue = AXValueCreate(.cfRange, &nextSelection) else {
      return
    }

    _ = AXUIElementSetAttributeValue(
      context.element,
      kAXSelectedTextRangeAttribute as CFString,
      selectionValue
    )
  }

  private func isEditable(_ element: AXUIElement) -> Bool {
    if let editable = copyBoolAttribute(element, "AXEditable" as CFString), editable {
      return true
    }

    guard let role = copyStringAttribute(element, kAXRoleAttribute as CFString) else {
      return false
    }

    return [
      kAXTextAreaRole as String,
      kAXTextFieldRole as String,
      "AXSearchField",
      kAXComboBoxRole as String
    ].contains(role)
  }

  private func copyStringAttribute(_ element: AXUIElement, _ attribute: CFString) -> String? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute, &value)
    guard result == .success else {
      return nil
    }

    return value as? String
  }

  private func copyBoolAttribute(_ element: AXUIElement, _ attribute: CFString) -> Bool? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute, &value)
    guard result == .success else {
      return nil
    }

    return value as? Bool
  }

  private func copySelectedRangeAttribute(_ element: AXUIElement) -> CFRange? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &value)
    guard
      result == .success,
      let value,
      CFGetTypeID(value) == AXValueGetTypeID()
    else {
      return nil
    }

    let rangeValue = unsafeDowncast(value, to: AXValue.self)

    guard AXValueGetType(rangeValue) == .cfRange else {
      return nil
    }

    var selectedRange = CFRange()
    guard AXValueGetValue(rangeValue, .cfRange, &selectedRange) else {
      return nil
    }

    return selectedRange
  }

  private func findSentenceContext(in text: String, caretOffset: Int) -> SentenceContext? {
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return nil
    }

    let nsText = text as NSString
    let safeCaret = max(0, min(caretOffset, nsText.length))
    let startBoundary = findStartBoundary(in: nsText, caretOffset: safeCaret)
    let endBoundary = findEndBoundary(in: nsText, caretOffset: safeCaret)
    let replacementRange = NSRange(location: startBoundary, length: max(0, endBoundary - startBoundary))

    guard replacementRange.length > 0 else {
      return nil
    }

    let rawText = nsText.substring(with: replacementRange)
    let leadingWhitespace = String(rawText.prefix(while: \.isWhitespace))
    let trailingWhitespace = String(rawText.reversed().prefix(while: \.isWhitespace).reversed())
    let sentence = rawText.trimmingCharacters(in: .whitespacesAndNewlines)

    guard !sentence.isEmpty else {
      return nil
    }

    return SentenceContext(
      replacementRange: replacementRange,
      sentence: sentence,
      leadingWhitespace: leadingWhitespace,
      trailingWhitespace: trailingWhitespace
    )
  }

  private func findStartBoundary(in text: NSString, caretOffset: Int) -> Int {
    var index = max(0, caretOffset - 1)

    while index >= 0 {
      let character = text.character(at: index)

      if isSentenceBoundary(character) || character == 10 {
        return index + 1
      }

      if index == 0 {
        break
      }

      index -= 1
    }

    return 0
  }

  private func findEndBoundary(in text: NSString, caretOffset: Int) -> Int {
    guard text.length > 0 else {
      return 0
    }

    for index in caretOffset..<text.length {
      let character = text.character(at: index)

      if isSentenceBoundary(character) {
        return index + 1
      }

      if character == 10 {
        return index
      }
    }

    return text.length
  }

  private func isSentenceBoundary(_ character: unichar) -> Bool {
    character == 46 || character == 33 || character == 63
  }
}

private struct SentenceContext {
  let replacementRange: NSRange
  let sentence: String
  let leadingWhitespace: String
  let trailingWhitespace: String
}

struct RewriteResult: Decodable {
  let improvedText: String
  let finalText: String
}

final class RewriteService: @unchecked Sendable {
  private let codexCommand: CodexCommand
  private let model: String?
  private let fileManager = FileManager.default

  init() {
    codexCommand = CodexCommand.detected()
    let configuredModel = ProcessInfo.processInfo.environment["CODEX_MODEL"]
    model = configuredModel?.isEmpty == false ? configuredModel : nil
  }

  func rewrite(sentence: String) throws -> RewriteResult {
    let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
      "ghostline-desktop-\(UUID().uuidString)",
      isDirectory: true
    )
    let schemaURL = tempDirectory.appendingPathComponent("schema.json")
    let outputURL = tempDirectory.appendingPathComponent("rewrite.json")

    try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    defer {
      try? fileManager.removeItem(at: tempDirectory)
    }

    try GhostlineDesktopFiles.schema.write(to: schemaURL, atomically: true, encoding: .utf8)

    var arguments = codexCommand.prefixArguments + [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--color",
      "never",
      "--output-schema",
      schemaURL.path,
      "--output-last-message",
      outputURL.path
    ]

    if let model {
      arguments.append(contentsOf: ["--model", model])
    }

    arguments.append("-")

    let process = Process()
    process.executableURL = URL(fileURLWithPath: codexCommand.executablePath)
    process.arguments = arguments

    let stdoutPipe = Pipe()
    let stderrPipe = Pipe()
    let stdinPipe = Pipe()

    process.standardOutput = stdoutPipe
    process.standardError = stderrPipe
    process.standardInput = stdinPipe

    do {
      try process.run()
    } catch {
      throw GhostlineDesktopError(
        "Ghostline Desktop could not launch Codex. Install Codex or set CODEX_BIN first."
      )
    }

    if let promptData = GhostlineDesktopFiles.prompt(for: sentence).data(using: .utf8) {
      stdinPipe.fileHandleForWriting.write(promptData)
    }
    try? stdinPipe.fileHandleForWriting.close()

    process.waitUntilExit()

    let stdout = String(data: stdoutPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let stderr = String(data: stderrPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""

    guard process.terminationStatus == 0 else {
      let combined = [stdout, stderr].filter { !$0.isEmpty }.joined(separator: "\n")
      throw GhostlineDesktopError(formatCodexError(from: combined))
    }

    let data: Data

    do {
      data = try Data(contentsOf: outputURL)
    } catch {
      throw GhostlineDesktopError("Codex finished, but Ghostline Desktop could not read the rewrite output.")
    }

    let decoded: RewriteResult

    do {
      decoded = try JSONDecoder().decode(RewriteResult.self, from: data)
    } catch {
      throw GhostlineDesktopError("Codex returned malformed rewrite JSON.")
    }

    return RewriteResult(
      improvedText: cleanSentence(decoded.improvedText),
      finalText: cleanSentence(decoded.finalText)
    )
  }

  private func cleanSentence(_ value: String) -> String {
    let collapsedLines = value.replacingOccurrences(
      of: #"\s*\n+\s*"#,
      with: " ",
      options: .regularExpression
    )
    let collapsedSpaces = collapsedLines.replacingOccurrences(
      of: #"\s{2,}"#,
      with: " ",
      options: .regularExpression
    )
    let trims = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\"'“”"))
    return collapsedSpaces.trimmingCharacters(in: trims)
  }

  private func formatCodexError(from output: String) -> String {
    if output.range(of: "sign in", options: .caseInsensitive) != nil
      || output.range(of: "codex login", options: .caseInsensitive) != nil
      || output.range(of: "authentication", options: .caseInsensitive) != nil {
      return "Codex is not signed in. Run `/Applications/Codex.app/Contents/Resources/codex login` first."
    }

    if output.range(of: "lookup address information", options: .caseInsensitive) != nil
      || output.range(of: "websocket", options: .caseInsensitive) != nil
      || output.range(of: "network", options: .caseInsensitive) != nil {
      return "Codex could not reach its service. Check your internet connection and try again."
    }

    return "Ghostline Desktop could not rewrite the sentence. Make sure Codex is installed and logged in."
  }
}

private struct CodexCommand {
  let executablePath: String
  let prefixArguments: [String]

  static func detected() -> CodexCommand {
    let environment = ProcessInfo.processInfo.environment

    if let configured = environment["CODEX_BIN"], !configured.isEmpty {
      return CodexCommand(executablePath: configured, prefixArguments: [])
    }

    let bundled = "/Applications/Codex.app/Contents/Resources/codex"

    if FileManager.default.isExecutableFile(atPath: bundled) {
      return CodexCommand(executablePath: bundled, prefixArguments: [])
    }

    return CodexCommand(executablePath: "/usr/bin/env", prefixArguments: ["codex"])
  }
}

private enum GhostlineDesktopFiles {
  static let schema = """
  {
    "type": "object",
    "properties": {
      "improvedText": { "type": "string" },
      "finalText": { "type": "string" }
    },
    "required": ["improvedText", "finalText"],
    "additionalProperties": false
  }
  """

  static func prompt(for sentence: String) -> String {
    [
      "You are Ghostline, a silent writing assistant.",
      "Return strict JSON that matches the provided schema.",
      "Do not use tools, commands, or file access.",
      "",
      "Produce two fields:",
      "1. improvedText: Rewrite the sentence so it reads cleaner, sharper, and more polished without changing the meaning, point of view, tone, or sentence count.",
      "2. finalText: Starting from improvedText, make it sound more natural, warm, and human while keeping the original meaning intact. Avoid cliches, corporate filler, em dashes, and obviously AI-sounding phrasing.",
      "",
      "Both fields must be exactly one sentence.",
      "Sentence: \(sentence)"
    ].joined(separator: "\n")
  }
}

struct GhostlineDesktopError: LocalizedError {
  let message: String

  init(_ message: String) {
    self.message = message
  }

  var errorDescription: String? {
    message
  }
}

final class HotKeyController: @unchecked Sendable {
  private var hotKeyRef: EventHotKeyRef?
  private var handlerRef: EventHandlerRef?
  private let handler: @MainActor () -> Void

  init(handler: @escaping @MainActor () -> Void) {
    self.handler = handler
  }

  func register() throws {
    var eventType = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard),
      eventKind: UInt32(kEventHotKeyPressed)
    )
    let callback: EventHandlerUPP = { _, event, userData in
      guard let event, let userData else {
        return noErr
      }

      let controller = Unmanaged<HotKeyController>.fromOpaque(userData).takeUnretainedValue()
      var hotKeyID = EventHotKeyID()
      let status = GetEventParameter(
        event,
        EventParamName(kEventParamDirectObject),
        EventParamType(typeEventHotKeyID),
        nil,
        MemoryLayout<EventHotKeyID>.size,
        nil,
        &hotKeyID
      )

      guard status == noErr, hotKeyID.id == 1 else {
        return noErr
      }

      Task { @MainActor in
        controller.handler()
      }

      return noErr
    }

    InstallEventHandler(
      GetApplicationEventTarget(),
      callback,
      1,
      &eventType,
      Unmanaged.passUnretained(self).toOpaque(),
      &handlerRef
    )

    let hotKeyID = EventHotKeyID(signature: OSType(0x47484f53), id: 1)
    let status = RegisterEventHotKey(
      UInt32(kVK_ANSI_G),
      UInt32(controlKey | optionKey),
      hotKeyID,
      GetApplicationEventTarget(),
      0,
      &hotKeyRef
    )

    guard status == noErr else {
      throw GhostlineDesktopError("Ghostline Desktop could not register the global hotkey.")
    }
  }

  deinit {
    if let hotKeyRef {
      UnregisterEventHotKey(hotKeyRef)
    }

    if let handlerRef {
      RemoveEventHandler(handlerRef)
    }
  }
}
