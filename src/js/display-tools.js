/**
 * OtaClaw Display Tools – ClawedBot language
 * Configure your window to OtaClaw's face: rotation, fullscreen, backdrop.
 * Preferences stored in localStorage.
 */

(function () {
  "use strict";

  /** Resolve asset path to absolute URL so sprites load reliably (iframe, kiosk, etc.). */
  window.otaclawAssetUrl = function (path) {
    if (!path || typeof path !== "string") return path || "";
    if (path.startsWith("http") || path.startsWith("blob:")) return path;
    try {
      const base = window.location.href.replace(/\/[^/]*$/, "/");
      return new URL(path, base).href;
    } catch {
      return path;
    }
  };

  const STORAGE_KEY = "otaclaw-display";
  const DEFAULTS = { rotationDeg: 0, fullscreen: true, backdrop: "#2C2C2C" };

  const ROTATION_OPTIONS = [
    { deg: 0, label: "0°" },
    { deg: 90, label: "90° CW" },
    { deg: 180, label: "180°" },
    { deg: 270, label: "270° CW" },
  ];

  const BACKDROP_PRESETS = [
    { hex: "#2C2C2C", label: "Dark" },
    { hex: "#1a1a1a", label: "Black" },
    { hex: "#0f3460", label: "Deep blue" },
    { hex: "#1e3a5f", label: "Navy" },
    { hex: "#2d1b4e", label: "Purple" },
    { hex: "#1b4332", label: "Forest" },
    { hex: "#3d2c1a", label: "Brown" },
    { hex: "#ffffff", label: "White" },
  ];

  function loadPrefs() {
    try {
      const params = new URLSearchParams(window.location.search);
      const rotationParam = params.get("rotation");
      if (rotationParam !== null) {
        const deg = parseInt(rotationParam, 10);
        if (!isNaN(deg) && [0, 90, 180, 270].includes(deg)) {
          return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")), rotationDeg: deg };
        }
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      const prefs = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
      /* Widget without ?rotation=: force 0, persist so refresh keeps it */
      if (document.body.classList.contains("otaclaw-widget") && rotationParam === null) {
        prefs.rotationDeg = 0;
        savePrefs(prefs);
      }
      return prefs;
    } catch {
      return { ...DEFAULTS };
    }
  }

  function savePrefs(p) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {}
  }

  function applyPrefs(p) {
    const deg = p.rotationDeg ?? 0;
    const isWidget = document.body.classList.contains("otaclaw-widget");
    const wrapper = document.getElementById("otaclaw-wrapper");
    const target = wrapper || document.body;
    /* Rotate ONLY Hal/sprite, never the whole canvas – avoids descuadre */
    target.style.width = target.style.height = target.style.minWidth = target.style.minHeight = "";
    target.style.position = target.style.top = target.style.left = "";
    target.style.marginLeft = target.style.marginTop = target.style.transform = target.style.transformOrigin = "";
    const rotTarget = isWidget ? document.body : wrapper || document.body;
    rotTarget.setAttribute("data-rotation", String(deg));
    let backdrop = p.backdrop || DEFAULTS.backdrop;
    if (isWidget && (backdrop === "#ffffff" || backdrop === "#fff")) {
      backdrop = DEFAULTS.backdrop;
      savePrefs({ ...p, backdrop });
    }

    /* Override widget.html's !important stylesheet – inject style so backdrop actually applies */
    let styleEl = document.getElementById("otaclaw-backdrop-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "otaclaw-backdrop-style";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `html,body,.otaclaw-container,.sprite-container,#otaclaw-wrapper,.otaclaw-widget-main,#boot-black-overlay{background:${backdrop}!important}`;
    /* Do NOT auto-request fullscreen on every prefs change – only via Toggle fullscreen button */
  }

  /** Panel: full overlay, tap backdrop to close. Sheet scrolls; header (with Close) stays visible. */
  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "display-tools-panel";
    panel.className = "display-tools-panel hidden";
    panel.innerHTML = `
      <div class="display-tools-sheet">
        <div class="display-tools-header">
          <span>Your window to OtaClaw</span>
          <button id="display-tools-close" aria-label="Close" type="button">× Close</button>
        </div>
        <div class="display-tools-body">
          <section>
            <label>Face rotation</label>
            <div id="display-rotation-btns" class="tool-buttons"></div>
          </section>
          <section>
            <label>Full window</label>
            <button id="display-fullscreen-btn" class="tool-btn">Toggle fullscreen</button>
          </section>
          <section>
            <label>Backdrop</label>
            <div id="display-backdrop-btns" class="tool-buttons tool-buttons-wrap"></div>
            <input type="color" id="display-backdrop-custom" value="#2C2C2C" class="tool-color" title="Custom color">
          </section>
          <section id="display-demo-section" class="display-demo-section">
            <label>Demo (no inference)</label>
            <button id="display-demo-btn" class="tool-btn">Cycle emotions</button>
          </section>
        </div>
      </div>
    `;
    /* Overlay: full viewport, tap backdrop to close. Safe-area for notched/small screens. */
    panel.style.cssText = `
      position: fixed;
      top: env(safe-area-inset-top, 0); right: env(safe-area-inset-right, 0);
      bottom: env(safe-area-inset-bottom, 0); left: env(safe-area-inset-left, 0);
      max-height: 100vh; max-height: 100dvh;
      background: rgba(0,0,0,0.85); z-index: 9999;
      display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
      padding: min(12px, 3vw); box-sizing: border-box;
      font-family: system-ui, sans-serif; color: #eaeaea;
      overflow: hidden;
    `;
    /* Sheet: scrollable content, max 90vh so header+close stay visible on small screens */
    const sheet = panel.querySelector(".display-tools-sheet");
    sheet.style.cssText = `
      width: 100%; max-width: 400px; max-height: min(90vh, 90dvh);
      display: flex; flex-direction: column; overflow: hidden;
      background: rgba(40,40,40,0.95); border-radius: 12px; padding: min(16px, 4vw);
      flex-shrink: 1; min-height: 0;
    `;
    panel.querySelector(".display-tools-header").style.cssText =
      "display:flex;justify-content:space-between;align-items:center;margin-bottom:min(12px,3vh);font-size:clamp(13px,3.5vw,16px);flex-shrink:0;";
    panel.querySelector(".display-tools-body").style.cssText =
      "flex:1;min-height:0;display:flex;flex-direction:column;gap:min(16px,3vh);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;";
    panel.querySelectorAll("section").forEach((s) => {
      s.style.cssText = "display:flex;flex-direction:column;gap:min(6px,1.5vh);flex-shrink:0;";
      const label = s.querySelector("label");
      if (label) label.style.cssText = "font-size:clamp(11px,3vw,13px);color:#8b8b9a;";
    });
    panel.querySelector("#display-tools-close").style.cssText =
      "background:#555;border:1px solid #666;border-radius:8px;color:#eaeaea;font-size:clamp(14px,3.5vw,16px);cursor:pointer;padding:min(10px,2.5vw) min(14px,3.5vw);min-height:44px;touch-action:manipulation;flex-shrink:0;";

    return panel;
  }

  function createToolButtons(container, items, current, onClick) {
    container.innerHTML = "";
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "tool-btn";
      btn.textContent = item.label;
      btn.style.cssText =
        "min-height:44px;border:1px solid #444;border-radius:8px;background:#333;color:#eaeaea;cursor:pointer;touch-action:manipulation;";
      if (typeof current === "number" && item.deg === current)
        btn.style.background = "#e94560";
      else if (
        typeof current === "string" &&
        (item.hex || "").toLowerCase() === (current || "").toLowerCase()
      )
        btn.style.background = "#e94560";
      btn.addEventListener("click", () => onClick(item));
      container.appendChild(btn);
    });
  }

  function init() {
    const isWidget = document.body.classList.contains("otaclaw-widget");
    if (isWidget) {
      const sb = document.getElementById("status-bar");
      if (sb && sb.parentNode === document.body) {
        document.documentElement.appendChild(sb);
      }
    }
    const prefs = loadPrefs();
    /* Tunnel/desktop tab (localhost): OOTB rotation 0. Config rotation is for Pi kiosk. */
    const isTunnelOrDesktop =
      typeof window.location?.hostname === "string" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (!isTunnelOrDesktop && typeof window.OTACLAW_CONFIG?.display?.rotationDeg === "number") {
      prefs.rotationDeg = window.OTACLAW_CONFIG.display.rotationDeg;
      savePrefs(prefs);
    } else if (isTunnelOrDesktop && prefs.rotationDeg !== 0) {
      prefs.rotationDeg = 0;
      savePrefs(prefs);
    }
    applyPrefs(prefs);

    const panel = createPanel();
    const mount = isWidget ? document.documentElement : document.body;
    mount.appendChild(panel);

    const rotationBtns = panel.querySelector("#display-rotation-btns");
    const backdropBtns = panel.querySelector("#display-backdrop-btns");
    const fullscreenBtn = panel.querySelector("#display-fullscreen-btn");
    const customColor = panel.querySelector("#display-backdrop-custom");
    const closeBtn = panel.querySelector("#display-tools-close");

    function refreshRotationButtons() {
      createToolButtons(
        rotationBtns,
        ROTATION_OPTIONS,
        prefs.rotationDeg,
        (opt) => {
          prefs.rotationDeg = opt.deg;
          savePrefs(prefs);
          applyPrefs(prefs);
          refreshRotationButtons();
        },
      );
    }
    function refreshBackdropButtons() {
      createToolButtons(
        backdropBtns,
        BACKDROP_PRESETS,
        prefs.backdrop,
        (opt) => {
          prefs.backdrop = opt.hex;
          savePrefs(prefs);
          applyPrefs(prefs);
          customColor.value = opt.hex;
          refreshBackdropButtons();
        },
      );
    }

    refreshRotationButtons();
    refreshBackdropButtons();
    customColor.value = prefs.backdrop || DEFAULTS.backdrop;
    customColor.style.cssText =
      "width:48px;height:32px;border:none;border-radius:6px;cursor:pointer;";
    customColor.addEventListener("input", () => {
      prefs.backdrop = customColor.value;
      savePrefs(prefs);
      applyPrefs(prefs);
      refreshBackdropButtons();
    });

    const demoBtn = panel.querySelector("#display-demo-btn");
    const demoSection = panel.querySelector("#display-demo-section");
    if (demoSection && document.body.classList.contains("otaclaw-widget")) {
      demoSection.style.display = "none";
    }
    if (demoBtn) {
      demoBtn.style.minHeight = "44px";
      demoBtn.style.touchAction = "manipulation";
      demoBtn.addEventListener("click", () => {
        if (typeof window.otaclaw?.startFullRangeDemo === "function") {
          window.otaclaw.startFullRangeDemo();
        }
      });
    }

    fullscreenBtn.style.minHeight = "44px";
    fullscreenBtn.style.touchAction = "manipulation";
    fullscreenBtn.addEventListener("click", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
        prefs.fullscreen = false;
      } else {
        document.documentElement
          .requestFullscreen?.()
          .then(() => {
            prefs.fullscreen = true;
          })
          .catch(() => {});
      }
      savePrefs(prefs);
    });

    function closePanel() {
      closePanelAndRestoreCursor();
    }
    closeBtn.addEventListener("click", closePanel);
    closeBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      closePanel();
    });
    /* Tap backdrop (outside sheet) to close – for small screens where Close may be off-view */
    panel.addEventListener("click", (e) => {
      if (e.target === panel) closePanel();
    });
    panel.addEventListener("touchend", (e) => {
      if (e.target === panel) closePanel();
    }, { passive: true });

    function openPanel() {
      panel.classList.remove("hidden");
      document.body.classList.add("cursor-visible");
    }
    function closePanelAndRestoreCursor() {
      panel.classList.add("hidden");
      document.body.classList.remove("cursor-visible");
    }
    function togglePanel() {
      if (panel.classList.contains("hidden")) {
        openPanel();
      } else {
        closePanelAndRestoreCursor();
      }
    }

    const toolsBtn = document.createElement("button");
    toolsBtn.id = "display-tools-toggle";
    toolsBtn.setAttribute(
      "aria-label",
      "Display tools – rotation, fullscreen, backdrop",
    );
    toolsBtn.innerHTML = "⚙";
    toolsBtn.title = "Long-press anywhere or press S to open";
    /* Widget: bottom-left to avoid status bar (bottom-right). Non-widget: bottom-right. */
    toolsBtn.style.cssText =
      `position:fixed;bottom:12px;${isWidget ? "left:12px" : "right:12px"};width:48px;height:48px;min-width:48px;min-height:48px;border-radius:50%;border:2px solid #555;background:#333;color:#eaeaea;font-size:24px;cursor:pointer;z-index:9998;display:flex;align-items:center;justify-content:center;touch-action:manipulation;`;
    toolsBtn.addEventListener("click", togglePanel);
    toolsBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      togglePanel();
    });
    /* Widget: hide gear on touch devices (kiosk); show gear on pointer devices (desktop tab) */
    const hasPointer = window.matchMedia("(pointer: fine)").matches;
    if (isWidget && !hasPointer) toolsBtn.style.display = "none";
    mount.appendChild(toolsBtn);

    /* Long-press anywhere (1.5s) opens settings – touch and mouse (desktop).
       Movement threshold: don't cancel on micro-jitter (resistive touchscreens). */
    let longPressTimer = null;
    let longPressStart = null;
    const LONG_PRESS_MS = 1500;
    const LONG_PRESS_MOVE_THRESHOLD_PX = 15;
    function startLongPress(e) {
      const x = e.touches?.[0]?.clientX ?? e.clientX;
      const y = e.touches?.[0]?.clientY ?? e.clientY;
      longPressStart = x != null && y != null ? { x, y } : null;
      longPressTimer = setTimeout(() => {
        openPanel();
        longPressTimer = null;
        longPressStart = null;
      }, LONG_PRESS_MS);
    }
    function cancelLongPress() {
      if (!longPressTimer) return;
      clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressStart = null;
    }
    function cancelLongPressOnMove(e) {
      if (!longPressTimer || !longPressStart) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dx = t.clientX - longPressStart.x;
      const dy = t.clientY - longPressStart.y;
      if (Math.sqrt(dx * dx + dy * dy) >= LONG_PRESS_MOVE_THRESHOLD_PX) cancelLongPress();
    }
    document.addEventListener("touchstart", startLongPress, { passive: true });
    document.addEventListener("touchend", cancelLongPress);
    document.addEventListener("touchmove", cancelLongPressOnMove, { passive: true });
    document.addEventListener("mousedown", startLongPress, { capture: true });
    document.addEventListener("mouseleave", cancelLongPress);
    document.addEventListener("mouseup", cancelLongPress, { capture: true });
    document.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget || !document.contains(e.relatedTarget))
        cancelLongPress();
    });
    window.addEventListener("blur", cancelLongPress);

    /* Keyboard shortcut: 's' or 'g' opens settings (desktop tab, no long-press) */
    document.addEventListener("keydown", (e) => {
      if ((e.key === "s" || e.key === "g") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
          return;
        e.preventDefault();
        openPanel();
      }
    });

    panel.classList.add("hidden");
    const style = document.createElement("style");
    style.textContent =
      "html{overflow:hidden}#display-tools-panel.hidden{display:none!important}#display-tools-panel:not(.hidden){display:flex!important}.tool-buttons{display:flex;gap:min(8px,2vw);flex-wrap:wrap}.tool-buttons-wrap{flex-wrap:wrap}.display-tools-panel .tool-btn{min-height:44px;padding:min(10px,2.5vw) min(14px,3.5vw);font-size:clamp(12px,3.5vw,14px)}";
    document.head.appendChild(style);
  }

  function setupCursorHide() {
    if (document.body.classList.contains("otaclaw-widget"))
      return; /* never show cursor in widget */
    let hideTimer = null;
    const IDLE_MS = 2500;
    const body = document.body;
    function showCursor() {
      body.classList.add("cursor-visible");
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(
        () => body.classList.remove("cursor-visible"),
        IDLE_MS,
      );
    }
    document.addEventListener("mousemove", showCursor);
    document.addEventListener("mousedown", showCursor);
    document.addEventListener("keydown", showCursor);
  }

  function runInit() {
    init();
    setupCursorHide();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runInit);
  } else {
    runInit();
  }
})();
