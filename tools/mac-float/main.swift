import Cocoa
import WebKit

final class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// Thin invisible strip at the top: drag to move the window, right-click to
/// reload/close. It deliberately does NOT cover the sprite, so clicks/tickles
/// still reach the page.
final class DragHandleView: NSView {
    weak var webView: WKWebView?

    override var mouseDownCanMoveWindow: Bool { true }

    override func menu(for event: NSEvent) -> NSMenu? {
        let menu = NSMenu()
        let codec = NSMenuItem(title: "Toggle Codec Mode", action: #selector(toggleCodec), keyEquivalent: "k")
        codec.target = self
        menu.addItem(codec)
        let reload = NSMenuItem(title: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
        reload.target = self
        menu.addItem(reload)
        menu.addItem(.separator())
        let close = NSMenuItem(title: "Close OtaClaw", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
        close.target = NSApp
        menu.addItem(close)
        return menu
    }

    @objc private func reloadPage() {
        webView?.reload()
    }

    @objc private func toggleCodec() {
        webView?.evaluateJavaScript(
            "window.otaclawApp?.easterEggs?.toggleCodecMode?.()",
            completionHandler: nil
        )
    }
}

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler {
    var panel: FloatingPanel!
    var webView: WKWebView!
    private var dragMonitor: Any?
    private var dragStartMouse: NSPoint = .zero
    private var dragStartOrigin: NSPoint = .zero
    private let originKey = "otaclawFloatOrigin"
    private let konamiSequence = [
        "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
        "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
        "b", "a",
    ]
    private var konamiBuffer: [String] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Fixed kiosk panel. The bubble lives inside a reserved strip; the
        // window never resizes (that was the "floating" drift).
        // 9:16 portrait, half size: bubble room above, compact footprint.
        let width: CGFloat = 180
        let height: CGFloat = 320
        let margin: CGFloat = 24
        // Restore where the user dragged it last time; otherwise start on the
        // screen under the pointer, bottom edge like the old kiosk.
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouse) }
            ?? NSScreen.main
            ?? NSScreen.screens.first
        let screenRect = screen?.visibleFrame
            ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        var rect = NSRect(
            x: screenRect.maxX - width - margin,
            y: screenRect.minY + margin,
            width: width,
            height: height
        )
        if let saved = savedOrigin() {
            rect.origin = saved
        }
        rect.origin = clamp(rect.origin, size: rect.size)

        panel = FloatingPanel(
            contentRect: rect,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.delegate = self
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.isMovableByWindowBackground = true
        panel.isFloatingPanel = true
        panel.becomesKeyOnlyIfNeeded = false
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.userContentController.add(self, name: "otaclawResize")
        config.userContentController.add(self, name: "otaclawDrag")
        // The page owns the whole canvas; ask it where the click landed so the
        // window can be dragged from anywhere EXCEPT the settings gear and Hal
        // himself (the only real click targets).
        let dragScript = """
        (function () {
          if (window.__otaclawDragInstalled) return;
          window.__otaclawDragInstalled = true;
          function inside(el, x, y) {
            if (!el) return false;
            var r = el.getBoundingClientRect();
            return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
          }
          document.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            var t = e.target;
            if (t && t.closest && t.closest('#display-tools-panel, #display-tools-toggle, #speech-bubble, #codec-subtitle')) return;
            var x = e.clientX, y = e.clientY;
            if (inside(document.getElementById('display-tools-toggle'), x, y)) return;
            if (inside(document.getElementById('speech-bubble'), x, y)) return;
            if (inside(document.getElementById('codec-subtitle'), x, y)) return;
            if (inside(document.getElementById('sprite-viewport'), x, y)) return;
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.otaclawDrag) {
              e.preventDefault();
              window.webkit.messageHandlers.otaclawDrag.postMessage({ x: x, y: y });
            }
          }, true);
        })();
        """
        config.userContentController.addUserScript(
            WKUserScript(source: dragScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: panel.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.wantsLayer = true
        webView.layer?.cornerRadius = 18
        webView.layer?.masksToBounds = true
        webView.layer?.backgroundColor = NSColor(calibratedRed: 0.17, green: 0.17, blue: 0.17, alpha: 1.0).cgColor
        webView.focusRingType = .none

        panel.contentView?.wantsLayer = true
        panel.contentView?.layer?.cornerRadius = 18
        panel.contentView?.layer?.masksToBounds = true
        panel.contentView?.focusRingType = .none
        panel.contentView?.addSubview(webView)

        let handle = DragHandleView(frame: NSRect(
            x: 0,
            y: panel.contentView!.bounds.height - 22,
            width: panel.contentView!.bounds.width,
            height: 22
        ))
        handle.autoresizingMask = [.width, .minYMargin]
        handle.webView = webView
        panel.contentView?.addSubview(handle)

        let urlString = CommandLine.arguments.count > 1
            ? CommandLine.arguments[1]
            : "http://127.0.0.1:8899/src/widget.html?host=127.0.0.1&port=18789&hal_ws=ws://127.0.0.1:18789/ws&compact=1"
        if let url = URL(string: urlString) {
            webView.load(URLRequest(url: url))
        }

        // Clicking the panel should make it key so keyboard easter eggs work.
        NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] event -> NSEvent? in
            if let panel = self?.panel, !panel.isKeyWindow {
                panel.makeKey()
            }
            return event
        }

        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event -> NSEvent? in
            guard let self else { return event }
            if event.modifierFlags.contains(.command),
               let key = event.charactersIgnoringModifiers?.lowercased() {
                if key == "r" {
                    self.webView.reload()
                    return nil
                }
                if key == "q" || key == "w" {
                    NSApp.terminate(nil)
                    return nil
                }
            }

            // Konami code, handled natively so it works even when the WKWebView
            // does not have first-responder status.
            if event.modifierFlags.intersection([.command, .control, .option]).isEmpty {
                let token: String?
                switch event.keyCode {
                case 126: token = "ArrowUp"
                case 125: token = "ArrowDown"
                case 123: token = "ArrowLeft"
                case 124: token = "ArrowRight"
                default: token = event.charactersIgnoringModifiers?.lowercased()
                }
                if let token, !token.isEmpty {
                    self.konamiBuffer.append(token)
                    if self.konamiBuffer.count > self.konamiSequence.count {
                        self.konamiBuffer.removeFirst()
                    }
                    if self.konamiBuffer == self.konamiSequence {
                        self.konamiBuffer.removeAll()
                        self.toggleCodec()
                        return nil
                    }
                }
            }
            return event
        }

        panel.orderFrontRegardless()
    }

    /// Deliberately fixed. The page used to report its natural height and the
    /// panel would grow/shrink, which read as the window "floating" and moving.
    /// The widget lays the bubble + sprite out inside 380x360 instead.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "otaclawDrag" {
            beginWindowDrag()
            return
        }
        guard message.name == "otaclawResize" else { return }
        guard
            let body = message.body as? [String: Any],
            let width = (body["width"] as? NSNumber)?.doubleValue,
            let height = (body["height"] as? NSNumber)?.doubleValue,
            width > 0, height > 0
        else { return }
        resizePanel(width: CGFloat(width), height: CGFloat(height))
    }

    /// Grow/shrink for the codec view while keeping the bottom-left corner
    /// anchored, then clamp to the visible screen.
    private func toggleCodec() {
        webView?.evaluateJavaScript(
            "window.otaclawApp?.easterEggs?.toggleCodecMode?.()",
            completionHandler: nil
        )
    }

    private func resizePanel(width: CGFloat, height: CGFloat) {
        guard let panel else { return }
        var frame = panel.frame
        frame.size = NSSize(width: width, height: height)
        if let visible = (panel.screen ?? NSScreen.main)?.visibleFrame {
            frame.origin.x = min(max(frame.origin.x, visible.minX + 8), visible.maxX - width - 8)
            frame.origin.y = min(max(frame.origin.y, visible.minY + 8), visible.maxY - height - 8)
        }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.22
            panel.animator().setFrame(frame, display: true)
        }
        // Keep keyboard easter eggs working after the codec resize.
        panel.makeKey()
    }

    /// Drag the panel from a page click that is not over the gear or the sprite.
    /// If AppKit still considers the mouse-down current, let it run the native
    /// drag loop; otherwise track the drag ourselves (the message callback can
    /// land one run-loop turn after the event).
    private func beginWindowDrag() {
        if let event = NSApp.currentEvent, event.type == .leftMouseDown {
            panel.performDrag(with: event)
            return
        }
        dragStartMouse = NSEvent.mouseLocation
        dragStartOrigin = panel.frame.origin
        if let monitor = dragMonitor {
            NSEvent.removeMonitor(monitor)
            dragMonitor = nil
        }
        dragMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDragged, .leftMouseUp]) { [weak self] event in
            guard let self else { return event }
            if event.type == .leftMouseUp {
                if let monitor = self.dragMonitor {
                    NSEvent.removeMonitor(monitor)
                    self.dragMonitor = nil
                }
                return event
            }
            let now = NSEvent.mouseLocation
            self.panel.setFrameOrigin(NSPoint(
                x: self.dragStartOrigin.x + (now.x - self.dragStartMouse.x),
                y: self.dragStartOrigin.y + (now.y - self.dragStartMouse.y)
            ))
            return nil
        }
    }

    func windowDidBecomeKey(_ notification: Notification) {
        panel.makeFirstResponder(webView)
    }

    func windowDidMove(_ notification: Notification) {
        // Keep the whole 9:16 panel on-screen while dragging; the bubble area
        // at the top must not disappear past the screen edge.
        let frame = panel.frame
        let clamped = clamp(frame.origin, size: frame.size)
        if clamped != frame.origin {
            panel.setFrameOrigin(clamped)
        }
        saveOriginSoon()
    }

    func windowWillClose(_ notification: Notification) {
        saveOriginNow()
        NSApp.terminate(nil)
    }

    private func savedOrigin() -> NSPoint? {
        guard let raw = UserDefaults.standard.string(forKey: originKey) else { return nil }
        let parts = raw.split(separator: ",")
        guard parts.count == 2,
              let x = Double(parts[0]),
              let y = Double(parts[1]) else { return nil }
        return NSPoint(x: x, y: y)
    }

    @objc private func saveOriginNow() {
        guard let panel else { return }
        let origin = panel.frame.origin
        UserDefaults.standard.set("\(origin.x),\(origin.y)", forKey: originKey)
    }

    private func saveOriginSoon() {
        NSObject.cancelPreviousPerformRequests(withTarget: self, selector: #selector(saveOriginNow), object: nil)
        perform(#selector(saveOriginNow), with: nil, afterDelay: 0.25)
    }

    /// Keep the window on a real screen even if the saved position is stale
    /// (monitor disconnected) or the drag went past the edge.
    private func clamp(_ origin: NSPoint, size: NSSize) -> NSPoint {
        let screens = NSScreen.screens
        let probe = NSRect(origin: origin, size: size)
        let target = screens.first { $0.visibleFrame.intersects(probe) }
            ?? screens.first { $0.frame.contains(origin) }
            ?? NSScreen.main
            ?? screens.first
        guard let vf = target?.visibleFrame else { return origin }
        let minX = vf.minX + 8
        let maxX = vf.maxX - size.width - 8
        let minY = vf.minY + 8
        let maxY = vf.maxY - size.height - 8
        return NSPoint(
            x: max(minX, min(maxX, origin.x)),
            y: max(minY, min(maxY, origin.y))
        )
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
