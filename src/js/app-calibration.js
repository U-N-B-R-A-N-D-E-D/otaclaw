/**
 * OtaClaw with Sprite Calibration Tool
 * Press C to enter calibration mode
 * Use arrows to adjust position
 * Press S to save coordinates
 * Press 0-9 to test different frames
 */

/**
 * OtaClaw sprite sheet - 12 cols × 4 rows (otaclock-original.png)
 * Sheet 567×278 px. Design ref: 2.43 cm × 1.73 cm per cell (W×H).
 * Override cellW/cellH for pixel-perfect alignment. Overflow: @0.9.
 */
const OTACON_GRID = {
  sheetW: 567,
  sheetH: 278,
  cols: 12,
  rows: 4,
  displayTargetH: 320,
  /** Override to fix bleed from neighbors. Match your export: e.g. cellW: 47, cellH: 69 */
  cellW: null,
  cellH: null,
  frames: {},
};

const cellW = () =>
  OTACON_GRID.cellW ?? Math.floor(OTACON_GRID.sheetW / OTACON_GRID.cols);
const cellH = () =>
  OTACON_GRID.cellH ?? Math.floor(OTACON_GRID.sheetH / OTACON_GRID.rows);

/** Individual sprite catalog (from sprite-catalog.json). When useIndividualFiles, each frame is a separate PNG. */
let SPRITE_CATALOG = null;

const DEFAULT_MAPPING = `idle: 0,0 1,0
thinking: 2,0 3,0 4,0 5,0
processing: 3,1 4,1 @0.9
success: 0,1 1,1 2,1 3,1
error: 2,2 3,2 4,2
laughing: 2,3 3,3 4,3
surprised: 9,0 10,0`;

function parseMapping(text) {
  const frames = {};
  text.split("\n").forEach((line) => {
    const m = line.trim().match(/^([a-z0-9_]+):\s*(.*)$/i);
    if (!m) return;
    const [, name, rest] = m;
    const stages = [];
    let emotionScale = null;
    rest
      .split(/\s+/)
      .filter(Boolean)
      .forEach((tok) => {
        if (tok.startsWith("@")) {
          emotionScale = parseFloat(tok.slice(1)) || null;
          return;
        }
        const cm = tok.match(/^(\d+),(\d+)(?:@([\d.]+))?$/);
        if (cm) {
          stages.push({
            col: parseInt(cm[1], 10),
            row: parseInt(cm[2], 10),
            scale: cm[3] ? parseFloat(cm[3]) : undefined,
          });
        }
      });
    if (stages.length) {
      frames[name] = {
        col: stages[0].col,
        row: stages[0].row,
        stages,
        scale: emotionScale,
      };
    }
  });
  return frames;
}

function applyMapping(text) {
  const parsed = parseMapping(text);
  Object.assign(OTACON_GRID.frames, parsed);
}

/** Position for a raw cell (col, row). Use for direct frame selection. */
function getOtaconPositionByCell(col, row, scaleMult = 1) {
  const fw = cellW();
  const fh = cellH();
  const baseScale = OTACON_GRID.displayTargetH / fh;
  return {
    x: Math.round(-col * fw),
    y: Math.round(-row * fh),
    frameW: Math.round(fw),
    frameH: Math.round(fh),
    sheetW: OTACON_GRID.sheetW,
    sheetH: OTACON_GRID.sheetH,
    scale: baseScale * scaleMult,
  };
}

function getAllStates() {
  const fromFrames = Object.keys(OTACON_GRID.frames);
  const saved = loadOtaconCal();
  const custom = saved._customEmotions || [];
  const combined = [
    ...new Set([...OTACLAW_CONFIG.states, ...fromFrames, ...custom]),
  ];
  return combined.filter((s) => s && !s.startsWith("_"));
}

function getOtaconPosition(state, stageIndex) {
  let frame = OTACON_GRID.frames[state];
  if (!frame) {
    frame = { col: 0, row: 0, stages: [{ col: 0, row: 0 }] };
  }
  const saved = loadOtaconCal()[state];
  const stages = saved?.stages ??
    frame.stages ?? [{ col: frame.col, row: frame.row }];
  const cell =
    stages[stageIndex != null ? stageIndex % stages.length : 0] || stages[0];
  const fw = cellW();
  const fh = cellH();
  const baseScale = OTACON_GRID.displayTargetH / fh;
  const cropL = frame.cropLeft ?? 0;
  const cropR = frame.cropRight ?? 0;
  const w = fw - cropL - cropR;
  const scaleMult = cell.scale ?? frame.scale ?? 1;
  return {
    x: Math.round(-cell.col * fw + cropL),
    y: Math.round(-cell.row * fh),
    frameW: Math.round(w),
    frameH: Math.round(fh),
    sheetW: OTACON_GRID.sheetW,
    sheetH: OTACON_GRID.sheetH,
    scale: baseScale * scaleMult,
  };
}

// Default configuration
const OTACLAW_CONFIG = {
  useOtaconSprite: true,
  behavior: {
    idleTimeout: 30000,
    animations: true,
    lowPowerMode: true,
    sounds: false,
    touchEnabled: true,
    debug: false,
    showStatusBar: true,
  },
  states: [
    "idle",
    "thinking",
    "processing",
    "success",
    "error",
    "laughing",
    "surprised",
  ],
  stateDurations: {
    thinking: 0,
    processing: 0,
    success: 3000,
    error: 5000,
    laughing: 4000,
    surprised: 2500,
  },
};

const isDebug = () =>
  typeof window !== "undefined" &&
  (window.OTACLAW_CONFIG?.behavior?.debug || OTACLAW_CONFIG?.behavior?.debug);

// Calibration state - sethen/otaclock reference (Konami OtaClock)
let calibrationMode = false;
let calX = -489;
let calY = 0;
let calScale = 2.8;
let calStep = 10;
let calOtaconSprite = false;

// State management
let currentState = "idle";
let demoInterval = null;
let isOfflineMode = false;

// Frame presets - sethen/otaclock reference mapping
const FRAME_PRESETS = {
  0: { x: -489, y: 0, name: "stationary (idle)" },
  1: { x: 0, y: -392, name: "thumbs-up-1" },
  2: { x: -214, y: -391, name: "thumbs-up-2" },
  3: { x: -452, y: -452, name: "thumbs-up-3" },
  4: { x: -489, y: 0, name: "stationary" },
  5: { x: 0, y: -392, name: "thumbs-up-1" },
  6: { x: 0, y: -392, name: "thumbs-up-1 (laugh)" },
  7: { x: -452, y: -452, name: "thumbs-up-3 (surprised)" },
  8: { x: -214, y: -391, name: "thumbs-up-2" },
  9: { x: -452, y: -452, name: "thumbs-up-3" },
};

const OTACON_CAL_KEY = "otaclaw-otacon-cal";

function loadOtaconCal() {
  try {
    const raw = localStorage.getItem(OTACON_CAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOtaconCal(cal) {
  try {
    localStorage.setItem(OTACON_CAL_KEY, JSON.stringify(cal));
  } catch (e) {
    console.warn("[OtaClaw] Could not save otacon cal to localStorage", e);
  }
}

function injectOtaconVars() {
  if (!OTACLAW_CONFIG.useOtaconSprite) return;
  const saved = loadOtaconCal();
  const root = document.documentElement;
  const basePos = getOtaconPosition("idle");
  if (!basePos) return;

  const scale = SPRITE_CATALOG?.useIndividualFiles
    ? 1
    : (saved._scale ?? basePos.scale);
  root.style.setProperty("--otacon-scale", String(scale));
  root.style.setProperty("--otacon-sheet-w", String(basePos.sheetW));
  root.style.setProperty("--otacon-sheet-h", String(basePos.sheetH));
  root.style.setProperty("--otacon-frame-h", String(basePos.frameH));

  for (const state of getAllStates()) {
    const pos = getOtaconPosition(state);
    if (!pos) continue;
    root.style.setProperty(`--otacon-${state}-x`, String(Math.round(pos.x)));
    root.style.setProperty(`--otacon-${state}-y`, String(Math.round(pos.y)));
    root.style.setProperty(`--otacon-${state}-frame-w`, String(pos.frameW));
  }

  document.body.classList.add("use-otacon-sprite");
  injectCustomStateStyles();
}

function injectCustomStateStyles() {
  const names = Object.keys(OTACON_GRID.frames).filter(
    (s) => s && !s.startsWith("_"),
  );
  let el = document.getElementById("otacon-custom-styles");
  if (!el) {
    el = document.createElement("style");
    el.id = "otacon-custom-styles";
    document.head.appendChild(el);
  }
  const rules = names
    .map(
      (s) =>
        `body.use-otacon-sprite .state-${s} .otacon-frame{width:calc(var(--otacon-${s}-frame-w,59)*1px);background-position:calc(var(--otacon-${s}-x,0)*1px) calc(var(--otacon-${s}-y,0)*1px)}`,
    )
    .join("\n");
  el.textContent = rules;
}

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  if (isDebug()) console.log("[OtaClaw] Starting with calibration tool...");
  const isWidget = document.body.classList.contains("otaclaw-widget");
  /* Widget: run critical init first so app's setFrame works before fetch completes */
  const saved = loadOtaconCal();
  const mappingText = saved._mapping ?? DEFAULT_MAPPING;
  applyMapping(mappingText);
  injectOtaconVars();
  try {
    const cat = await fetch("data/sprite-catalog.json").then((r) => r.json());
    if (cat) SPRITE_CATALOG = cat;
    if (cat?.useIndividualFiles && cat?.sprites?.length && !isWidget) {
      document.body.classList.add("use-individual-sprites");
      if (isDebug()) console.log("[OtaClaw] Using individual sprites:", cat.sprites.length);
    }
  } catch {}
  if (!isWidget) {
    showConnectionOverlay();
    setState("idle");
  }

  if (!isWidget) {
    showDemoOption();
    setTimeout(() => {
      const overlay = document.getElementById("connection-overlay");
      if (overlay && !overlay.classList.contains("hidden") && !isOfflineMode) {
        enableDemoMode();
      }
    }, 1000);
  }

  /* Widget: preload boot sprites, then show boot sequence. Skip when ?emotions=1 */
  if (isWidget && !document.body.classList.contains("emotions-demo")) {
    // DEBUG: Visual log on screen (only when behavior.debug is true)
    const debugLog = (msg) => {
      if (!isDebug()) return;
      console.log("[OtaClaw DEBUG]", msg);
      const loadingEl = document.getElementById("boot-loading");
      if (loadingEl) loadingEl.textContent = msg;
    };
    debugLog("INIT: isWidget=true");
    const style = document.createElement("style");
    style.id = "widget-waiting-override";
    style.textContent = `
      .otaclaw-widget.widget-waiting #sprite .otacon-frame{width:47px!important;height:70px!important;background-size:567px 278px!important}
      @keyframes boot-rise-from-floor{from{transform:translateY(80%) scale(var(--otacon-scale, 4.5))}to{transform:translateY(0) scale(var(--otacon-scale, 4.5))}}
      .otaclaw-widget #sprite.boot-rising .otacon-frame{animation:boot-rise-from-floor 3s ease-out forwards!important}
      @keyframes boot-sink-to-floor{from{transform:translateY(0) scale(var(--otacon-scale, 4.5))}to{transform:translateY(80%) scale(var(--otacon-scale, 4.5))}}
      .otaclaw-widget #sprite.boot-sinking .otacon-frame{animation:boot-sink-to-floor 3.5s ease-in forwards!important}
    `;
    document.head.appendChild(style);
    debugLog("STYLE: added");
    // Always start boot sequence after max 3s regardless of preload
    let bootStarted = false;
    const startBoot = () => {
      if (bootStarted) {
        debugLog("BOOT: already started, skipping");
        return;
      }
      bootStarted = true;
      debugLog("BOOT: starting...");
      if (typeof startWidgetFrameCycler !== "function") {
        debugLog("ERROR: startWidgetFrameCycler not found!");
        return;
      }
      debugLog("BOOT: calling startWidgetFrameCycler...");
      // Clear any stuck state
      if (_widgetFrameCyclerId) {
        clearTimeout(_widgetFrameCyclerId);
        _widgetFrameCyclerId = null;
      }
      startWidgetFrameCycler();
      debugLog("BOOT: done");
    };
    debugLog("PRELOAD: starting...");
    startBoot(); /* Show splash immediately; preload runs in background */
    /* Fallback: force-hide boot overlay after 15s if normal path never completed (e.g. at cold reboot) */
    const FALLBACK_OVERLAY_MS = 15000;
    setTimeout(() => {
      const ov = document.getElementById("boot-black-overlay");
      const stillVisible =
        ov &&
        !ov.classList.contains("boot-sleep") &&
        window.getComputedStyle(ov).display !== "none";
      if (stillVisible) {
        if (isDebug()) console.log("[OtaClaw Boot] Fallback: hiding overlay after", FALLBACK_OVERLAY_MS, "ms");
        ov.style.display = "none";
        const wov = document.getElementById("widget-sprite-overlay");
        if (wov) wov.style.display = "none";
      }
    }, FALLBACK_OVERLAY_MS);
    preloadWidgetSprites()
      .then(() => {
        debugLog("PRELOAD: done");
      })
      .catch((e) => {
        debugLog("PRELOAD: error " + e);
      });
  }
  setupKeyboardShortcuts();
  setupUI();
  setupEyes();
  setupCalibrationStudio();
});

/** Show connection msg – bubble above head. brief(text, ms) = show then hide. */
function showWidgetConnectionMsg(text) {
  if (!document.body.classList.contains("otaclaw-widget")) return;
  const st = document.getElementById("speech-text");
  const sb = document.getElementById("speech-bubble");
  if (st) st.textContent = text || "";
  if (sb) sb.classList.toggle("has-text", !!text);
}
function showWidgetConnectionMsgBrief(text, ms) {
  if (!text) return;
  showWidgetConnectionMsg(text);
  setTimeout(() => {
    showWidgetConnectionMsg("");
  }, ms);
}
if (typeof window !== "undefined") {
  window.showWidgetConnectionMsg = showWidgetConnectionMsg;
  window.showWidgetConnectionMsgBrief = showWidgetConnectionMsgBrief;
}

/** Preload boot + first idle sprites. Timeout so Pi never freezes. */
const PRELOAD_TIMEOUT_MS = 6000;
function preloadWidgetSprites() {
  if (isDebug()) console.log("[OtaClaw Boot] preloadWidgetSprites started");
  const cfg = typeof window !== "undefined" ? window.OTACLAW_CONFIG : {};
  const basePath = (cfg?.sprites?.basePath || "assets/sprites/").replace(
    /\/$/,
    "",
  );
  const splash = cfg?.sprites?.splashFrame ? [cfg.sprites.splashFrame] : [];
  const boot = cfg?.sprites?.startupSequence || [
    "otacon_sprite_boot_00.png",
    "otacon_sprite_boot_01.png",
    "otacon_sprite_boot_02.png",
    "otacon_sprite_boot_03.png",
    "otacon_sprite_boot_04.png",
  ];
  const idle = (cfg?.sprites?.idleSprites || []).slice(0, 5);
  const all = [...splash, ...boot, ...idle];
  if (isDebug()) console.log("[OtaClaw Boot] preloading", all.length, "images");
  const load = Promise.all(
    all.map((f) => {
      const url = basePath + "/" + f;
      const loadImg = (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            if (isDebug()) console.log("[OtaClaw Boot] loaded:", f);
            resolve();
          };
          img.onerror = () => {
            if (isDebug()) console.log("[OtaClaw Boot] error loading:", f);
            resolve();
          };
          img.src = src;
        });
      const src =
        typeof window.otaclawAssetUrl === "function"
          ? window.otaclawAssetUrl(url)
          : url;
      return loadImg(src);
    }),
  );
  const timeout = new Promise((resolve) =>
    setTimeout(() => {
      if (isDebug()) console.log("[OtaClaw Boot] preload timeout");
      resolve();
    }, PRELOAD_TIMEOUT_MS),
  );
  return Promise.race([load, timeout]);
}

function setBootOverlayFade(step) {
  const el = document.getElementById("boot-black-overlay");
  if (!el) return;
  el.classList.remove(
    "boot-fade-1",
    "boot-fade-2",
    "boot-fade-3",
    "boot-fade-4",
    "boot-fade-5",
    "boot-done",
  );
  if (step >= 1) el.classList.add("boot-fade-" + Math.min(step, 5));
  if (step >= 5) el.classList.add("boot-done");
}

/** Widget startup: 0) splash (OtIcon), 1) light on (overlay fades), 2) sprite rises with boot_00..04. */
let _widgetFrameCyclerId = null;
let _widgetBubbleRepeatId = null;
const LIGHT_FADE_MS = 1200;
function startWidgetFrameCycler(opts = {}) {
  const skipSplash = opts.skipSplash === true;
  const bootStartIdx = opts.bootStartIdx ?? 0;
  try {
    const debugEl = document.getElementById("boot-loading");
    const debugLog = (msg) => {
      if (!isDebug()) return;
      console.log("[OtaClaw FRAME]", msg);
      if (debugEl) debugEl.textContent = msg;
    };
    debugLog("FRAME: ENTRY");
    // Clear any stuck previous state
    if (_widgetFrameCyclerId) {
      debugLog("FRAME: clearing previous timer");
      clearTimeout(_widgetFrameCyclerId);
      _widgetFrameCyclerId = null;
    }
    if (_widgetBubbleRepeatId) {
      clearInterval(_widgetBubbleRepeatId);
      _widgetBubbleRepeatId = null;
    }
    window.__otaclawBootComplete = false;
    debugLog("FRAME: init...");
    const spriteEl = document.getElementById("sprite");
    const frame = document.querySelector("#sprite .otacon-frame");
    const overlay = document.getElementById("boot-black-overlay");
    const splashEl = document.getElementById("boot-splash");
    const loadingEl = document.getElementById("boot-loading");
    const cfg = typeof window !== "undefined" ? window.OTACLAW_CONFIG : {};
    const basePath = (cfg?.sprites?.basePath || "assets/sprites/").replace(
      /\/$/,
      "",
    );
    const splashFrame = cfg?.sprites?.splashFrame;
    const splashDurationMs = Number(cfg?.sprites?.splashDurationMs || 1500);
    const startupSeq = cfg?.sprites?.startupSequence || [
      "otacon_sprite_boot_00.png",
      "otacon_sprite_boot_01.png",
      "otacon_sprite_boot_02.png",
      "otacon_sprite_boot_03.png",
      "otacon_sprite_boot_04.png",
    ];
    const frameMs = Number(cfg?.sprites?.startupFrameMs || 600);

    function runBootSequence() {
      const debugEl2 = document.getElementById("boot-loading");
      if (isDebug()) console.log("[OtaClaw Boot] runBootSequence started");
      if (splashEl) splashEl.classList.add("done");
      const overlayEl2 = document.getElementById("boot-sprite-overlay");
      overlayEl2?.querySelectorAll(".splash-sprite-img").forEach((el) => {
        el.style.display = "none";
      });
      /* Keep loading hidden – no text during boot; overlay stays opaque until boot completes */
      if (loadingEl) loadingEl.classList.add("done");
      /* Phase 1: keep overlay opaque; show boot sequence immediately (no fade during sequence) */
      if (overlay) {
        overlay.classList.remove(
          "boot-fade-1",
          "boot-fade-2",
          "boot-fade-3",
          "boot-fade-4",
          "boot-fade-5",
        );
        overlay.style.transition = "";
      }
      setTimeout(() => {
        const hasWidgetWaiting =
          document.body.classList.contains("widget-waiting");
        if (debugEl2) debugEl2.textContent = "BOOT: phase 2 check";
        if (isDebug()) console.log(
          "[OtaClaw Boot] phase 2 timeout, widget-waiting:",
          hasWidgetWaiting,
        );
        if (!hasWidgetWaiting) {
          if (isDebug()) console.log("[OtaClaw Boot] ABORT: not widget-waiting");
          if (debugEl2) debugEl2.textContent = "BOOT: ABORT - not waiting";
          return;
        }
        /* Phase 2: light on – now rise sprite with boot sequence */
        if (debugEl2) debugEl2.textContent = "BOOT: phase 2 START";
        if (isDebug()) console.log(
          "[OtaClaw Boot] Phase 2: spriteEl=",
          !!spriteEl,
          "frame=",
          !!frame,
        );
        if (spriteEl) {
          spriteEl.classList.add("boot-rising");
          if (debugEl2) debugEl2.textContent = "BOOT: rising added";
        }
        if (frame && startupSeq[0]) {
          const firstIdx = Math.min(bootStartIdx, startupSeq.length - 1);
          if (debugEl2) debugEl2.textContent = "BOOT: showing frame " + firstIdx;
          const raw0 = `${basePath}/${startupSeq[firstIdx]}`;
          const url0 =
            typeof window.otaclawAssetUrl === "function"
              ? window.otaclawAssetUrl(raw0)
              : raw0;
          /* Show in overlay – same layer as loading text, guaranteed visible */
          const overlayEl = document.getElementById("boot-sprite-overlay");
          if (overlayEl) {
            let bootImg = overlayEl.querySelector(".boot-sprite-img");
            if (!bootImg) {
              bootImg = document.createElement("img");
              bootImg.className = "boot-sprite-img boot-overlay-img";
              overlayEl.appendChild(bootImg);
            }
            bootImg.src = url0;
            bootImg.style.display = "";
          }
        } else {
          if (debugEl2) debugEl2.textContent = "BOOT: NO FRAME!";
        }
        let idx = bootStartIdx;
        const schedule = () => {
          if (debugEl2) debugEl2.textContent = "BOOT: schedule idx=" + idx;
          if (!document.body.classList.contains("widget-waiting")) {
            if (debugEl2) debugEl2.textContent = "BOOT: schedule abort";
            _widgetFrameCyclerId = null;
            if (_widgetBubbleRepeatId) {
              clearInterval(_widgetBubbleRepeatId);
              _widgetBubbleRepeatId = null;
            }
            return;
          }
          if (frame && idx < startupSeq.length) {
            const rawUrl = `${basePath}/${startupSeq[idx]}`;
            if (debugEl2)
              debugEl2.textContent =
                "BOOT: frame " + idx + "/" + startupSeq.length;
            const url =
              typeof window.otaclawAssetUrl === "function"
                ? window.otaclawAssetUrl(rawUrl)
                : rawUrl;
            const overlayEl = document.getElementById("boot-sprite-overlay");
            const bootImg = overlayEl?.querySelector(".boot-sprite-img");
            if (bootImg) {
              bootImg.src = url;
              bootImg.style.display = "";
            }
            idx += 1;
          }
          if (idx < startupSeq.length) {
            if (debugEl2)
              debugEl2.textContent = "BOOT: next in " + frameMs + "ms";
            _widgetFrameCyclerId = setTimeout(schedule, frameMs);
          } else {
            _widgetFrameCyclerId = null;
            /* boot-rise-from-floor is 3s; frames end at 2.4s – wait for animation to finish */
            setTimeout(() => {
              if (!document.body.classList.contains("widget-waiting")) return;
              if (spriteEl) spriteEl.classList.remove("boot-rising");
              const overlayEl = document.getElementById("boot-sprite-overlay");
              const bootImg = overlayEl?.querySelector(".boot-sprite-img");
              if (bootImg) bootImg.style.display = "none";
              const loadingEl = document.getElementById("boot-loading");
              if (loadingEl) loadingEl.classList.add("done");
              if (_widgetBubbleRepeatId) {
                clearInterval(_widgetBubbleRepeatId);
                _widgetBubbleRepeatId = null;
              }
              window.__otaclawBootComplete = true;
              /* Keep Hal in boot overlay (no fade yet) – swap boot img for idle sprite */
              const cfg =
                typeof window !== "undefined" ? window.OTACLAW_CONFIG : {};
              const idleSprites = cfg?.sprites?.idleSprites;
              const first =
                Array.isArray(idleSprites) && idleSprites[0]
                  ? idleSprites[0]
                  : "otacon_sprite.png_0004_Sprite-5.png";
              const basePath = (
                cfg?.sprites?.basePath || "assets/sprites/"
              ).replace(/\/$/, "");
              const rawUrl = `${basePath}/${first}`;
              const url =
                typeof window.otaclawAssetUrl === "function"
                  ? window.otaclawAssetUrl(rawUrl)
                  : rawUrl;
              const bootOverlayEl = document.getElementById(
                "boot-sprite-overlay",
              );
              if (bootOverlayEl) {
                const bootImg = bootOverlayEl.querySelector(".boot-sprite-img");
                if (bootImg) {
                  bootImg.src = url;
                  bootImg.style.display = "";
                } else {
                  const img = document.createElement("img");
                  img.className = "boot-sprite-img boot-overlay-img";
                  img.src = url;
                  bootOverlayEl.appendChild(img);
                }
              }
              /* Also show in widget overlay for when we fade */
              const widgetOv = document.getElementById("widget-sprite-overlay");
              if (widgetOv) {
                widgetOv
                  .querySelector(".widget-sheet-img")
                  ?.style.setProperty("display", "none");
                let img = widgetOv.querySelector(".widget-sprite-img");
                if (!img) {
                  img = document.createElement("img");
                  img.className = "widget-sprite-img boot-overlay-img";
                  widgetOv.appendChild(img);
                }
                img.src = url;
                img.style.display = "";
              }
              if (typeof window.__otaclawOnBootComplete === "function") {
                window.__otaclawOnBootComplete();
              } else if (
                document.body.classList.contains("widget-waiting") &&
                typeof window.otaclawApp?.startWaitingAnimation === "function"
              ) {
                window.otaclawApp.startWaitingAnimation();
              } else {
                /* Fallback: run idle cycle when app not ready – cycle through idle sprites */
                window.__otaclawFallbackIdleActive = true;
                const idleSeq = cfg?.sprites?.idleSequence || [
                  0, 0, 1, 7, 8, 9, 3, 0, 4, 1, 7, 8, 9, 0, 5, 0, 2, 6, 0, 1, 7,
                  8, 9, 0,
                ];
                const blinkIdx = [7, 8, 9];
                let fallbackIdx = 0;
                const runFallbackIdle = () => {
                  if (!window.__otaclawFallbackIdleActive) return;
                  const ov = document.getElementById("widget-sprite-overlay");
                  const bootOv = document.getElementById("boot-sprite-overlay");
                  if (!ov) return;
                  const frameIdx = idleSeq[fallbackIdx % idleSeq.length];
                  const sprite =
                    Array.isArray(idleSprites) && idleSprites[frameIdx]
                      ? idleSprites[frameIdx]
                      : first;
                  const u =
                    typeof window.otaclawAssetUrl === "function"
                      ? window.otaclawAssetUrl(`${basePath}/${sprite}`)
                      : `${basePath}/${sprite}`;
                  const wImg = ov?.querySelector(".widget-sprite-img");
                  const bImg = bootOv?.querySelector(".boot-sprite-img");
                  if (wImg) {
                    wImg.src = u;
                    wImg.style.display = "";
                  }
                  if (bImg) {
                    bImg.src = u;
                    bImg.style.display = "";
                  }
                  fallbackIdx += 1;
                  const delay = blinkIdx.includes(frameIdx)
                    ? 50
                    : 450 + Math.random() * 150;
                  if (window.__otaclawFallbackIdleActive) {
                    _widgetFrameCyclerId = setTimeout(runFallbackIdle, delay);
                  }
                };
                runFallbackIdle();
              }
              /* Fade boot overlay after a short delay so Hal is visible first; hide widget overlay to reveal main content (gray + bubble) */
              setTimeout(() => {
                if (overlay) {
                  overlay.style.transition = `opacity ${LIGHT_FADE_MS}ms ease-out`;
                  setBootOverlayFade(5);
                }
                const widgetOv = document.getElementById("widget-sprite-overlay");
                if (widgetOv) widgetOv.style.display = "none";
                setTimeout(() => {
                  if (overlay) overlay.style.display = "none";
                }, LIGHT_FADE_MS + 100);
              }, 300);
            }, frameMs);
          }
        };
        schedule();
      }, 0);
      /* Re-show bubble every 12s while connecting – user sees it more than once */
      if (_widgetBubbleRepeatId) clearInterval(_widgetBubbleRepeatId);
      _widgetBubbleRepeatId = setInterval(() => {
        if (!document.body.classList.contains("widget-waiting")) return;
        const txt =
          (typeof window !== "undefined" && window.otaclawWaitingMsg) ||
          (typeof window !== "undefined" &&
            window.OTACLAW_CONFIG?.i18n?.connecting) ||
          "Connecting...";
        showWidgetConnectionMsgBrief(txt, 5000);
      }, 12000);
    }

    /* Phase 0: splash (OtIcon) on black, then run boot sequence. Wake: skip splash, light already on. */
    if (!skipSplash && splashFrame && splashEl && splashDurationMs > 0) {
      if (loadingEl) loadingEl.classList.add("done");
      const splashRaw = `${basePath}/${splashFrame}`;
      const splashUrl =
        typeof window.otaclawAssetUrl === "function"
          ? window.otaclawAssetUrl(splashRaw)
          : splashRaw;
      /* Show in overlay – same layer as loading, guaranteed visible */
      const overlayEl = document.getElementById("boot-sprite-overlay");
      if (overlayEl) {
        let splashImg = overlayEl.querySelector(".splash-sprite-img");
        if (!splashImg) {
          splashImg = document.createElement("img");
          splashImg.className = "splash-sprite-img boot-overlay-img";
          overlayEl.appendChild(splashImg);
        }
        splashImg.src = splashUrl;
        splashImg.style.display = "";
      }
      _widgetFrameCyclerId = setTimeout(() => {
        if (!document.body.classList.contains("widget-waiting")) return;
        _widgetFrameCyclerId = null;
        runBootSequence();
      }, splashDurationMs);
    } else {
      runBootSequence();
    }
  } catch (e) {
    const debugEl = document.getElementById("boot-loading");
    if (debugEl) debugEl.textContent = "ERROR: " + e.message;
    console.error("[OtaClaw FRAME CRASH]", e);
  }
}

/** Sleep: reverse boot sequence (sink into floor), then full black. Wake on connection or touch. */
let _sleepFrameCyclerId = null;
function runSleepSequence(onComplete) {
  if (_sleepFrameCyclerId) return;
  if (_widgetBubbleRepeatId) {
    clearInterval(_widgetBubbleRepeatId);
    _widgetBubbleRepeatId = null;
  }
  document.body.classList.add("widget-asleep");
  document.body.classList.remove("widget-waiting");
  const spriteEl = document.getElementById("sprite");
  if (spriteEl) {
    spriteEl.classList.remove("boot-rising");
    spriteEl.classList.add("boot-sinking");
  }
  const cfg = typeof window !== "undefined" ? window.OTACLAW_CONFIG : {};
  const basePath = (cfg?.sprites?.basePath || "assets/sprites/").replace(
    /\/$/,
    "",
  );
  const startupSeq = cfg?.sprites?.startupSequence || [
    "otacon_sprite_boot_00.png",
    "otacon_sprite_boot_01.png",
    "otacon_sprite_boot_02.png",
    "otacon_sprite_boot_03.png",
    "otacon_sprite_boot_04.png",
  ];
  const sleepSeq = [...startupSeq].reverse();
  const frameMs = Number(cfg?.sprites?.startupFrameMs || 700);
  const overlayEl = document.getElementById("boot-sprite-overlay");
  let idx = 0;
  const schedule = () => {
    if (!document.body.classList.contains("widget-asleep")) {
      _sleepFrameCyclerId = null;
      return;
    }
    if (overlayEl && idx < sleepSeq.length) {
      const rawUrl = `${basePath}/${sleepSeq[idx]}`;
      const url =
        typeof window.otaclawAssetUrl === "function"
          ? window.otaclawAssetUrl(rawUrl)
          : rawUrl;
      let bootImg = overlayEl.querySelector(".boot-sprite-img");
      if (!bootImg) {
        bootImg = document.createElement("img");
        bootImg.className = "boot-sprite-img boot-overlay-img";
        overlayEl.appendChild(bootImg);
      }
      bootImg.src = url;
      bootImg.style.display = "";
      setBootOverlayFade(Math.max(1, 5 - idx));
      idx += 1;
    }
    if (idx < sleepSeq.length) {
      _sleepFrameCyclerId = setTimeout(schedule, frameMs);
    } else {
      _sleepFrameCyclerId = null;
      const overlay = document.getElementById("boot-black-overlay");
      const bootSpriteOv = document.getElementById("boot-sprite-overlay");
      if (bootSpriteOv) {
        bootSpriteOv.querySelector(".boot-sprite-img")?.style.setProperty("display", "none");
      }
      if (overlay) {
        overlay.classList.remove(
          "boot-fade-1",
          "boot-fade-2",
          "boot-fade-3",
          "boot-fade-4",
          "boot-fade-5",
          "boot-done",
        );
        overlay.classList.add("boot-sleep");
      }
      if (spriteEl) spriteEl.classList.remove("boot-sinking");
      window.__otaclawAsleep = true;
      /* Ensure overlay receives touch/click for wake – kiosk may not bubble to document */
      if (overlay) {
        overlay.style.pointerEvents = "auto";
        const wakeHandler = () => {
          if (!window.__otaclawAsleep) return;
          overlay.removeEventListener("click", wakeHandler);
          overlay.removeEventListener("touchstart", wakeHandler);
          document.dispatchEvent(new CustomEvent("otaclaw-wake-request"));
        };
        overlay.addEventListener("click", wakeHandler);
        overlay.addEventListener("touchstart", wakeHandler, { passive: false });
      }
      if (typeof onComplete === "function") onComplete();
    }
  };
  /* Show boot overlay (was faded) and run sleep sequence */
  const overlay = document.getElementById("boot-black-overlay");
  if (overlay) {
    overlay.classList.remove("boot-done");
    overlay.classList.add("boot-fade-4");
    overlay.style.transition = "";
    overlay.style.display = ""; /* re-show for sleep (was hidden after boot) */
  }
  schedule();
}

function runWakeSequence(onComplete) {
  document.body.classList.remove("widget-asleep");
  document.body.classList.add("widget-waiting");
  window.__otaclawAsleep = false;
  window.__otaclawBootComplete = false;
  const overlay = document.getElementById("boot-black-overlay");
  const bootSpriteOv = document.getElementById("boot-sprite-overlay");
  const cfg = typeof window !== "undefined" ? window.OTACLAW_CONFIG : {};
  const basePath = (cfg?.sprites?.basePath || "assets/sprites/").replace(
    /\/$/,
    "",
  );
  const startupSeq = cfg?.sprites?.startupSequence || [
    "otacon_sprite_boot_00.png",
    "otacon_sprite_boot_01.png",
    "otacon_sprite_boot_02.png",
    "otacon_sprite_boot_03.png",
    "otacon_sprite_boot_04.png",
  ];
  if (overlay) {
    overlay.classList.remove("boot-sleep");
    overlay.style.pointerEvents = "";
    overlay.style.display = "";
  }
  /* Re-show boot sprite (hidden during sleep) and set boot_00 for light phase */
  if (bootSpriteOv && startupSeq[0]) {
    let bootImg = bootSpriteOv.querySelector(".boot-sprite-img");
    if (!bootImg) {
      bootImg = document.createElement("img");
      bootImg.className = "boot-sprite-img boot-overlay-img";
      bootSpriteOv.appendChild(bootImg);
    }
    const url =
      typeof window.otaclawAssetUrl === "function"
        ? window.otaclawAssetUrl(`${basePath}/${startupSeq[0]}`)
        : `${basePath}/${startupSeq[0]}`;
    bootImg.src = url;
    bootImg.style.display = "";
  }
  _widgetFrameCyclerId = null;
  if (_widgetBubbleRepeatId) {
    clearInterval(_widgetBubbleRepeatId);
    _widgetBubbleRepeatId = null;
  }
  if (typeof onComplete === "function") {
    window.__otaclawOnBootComplete = onComplete;
  }
  /* Phase 1: light on (fade from black), then Phase 2: Hal rises */
  if (overlay) {
    overlay.classList.remove(
      "boot-fade-1",
      "boot-fade-2",
      "boot-fade-3",
      "boot-fade-4",
      "boot-fade-5",
    );
    overlay.style.transition = `opacity ${LIGHT_FADE_MS}ms ease-out`;
    overlay.offsetHeight; /* force reflow */
    setBootOverlayFade(4);
  }
  setTimeout(() => {
    if (!document.body.classList.contains("widget-waiting")) return;
    startWidgetFrameCycler({ skipSplash: true, bootStartIdx: 1 });
  }, LIGHT_FADE_MS);
}

if (typeof window !== "undefined") {
  window.runSleepSequence = runSleepSequence;
  window.runWakeSequence = runWakeSequence;
}

function showConnectionOverlay() {
  const overlay = document.getElementById("connection-overlay");
  if (overlay) {
    overlay.classList.remove("hidden");
  }
}

function hideConnectionOverlay() {
  const overlay = document.getElementById("connection-overlay");
  if (overlay) {
    overlay.classList.add("hidden");
  }
}

function showDemoOption() {
  const overlay = document.getElementById("connection-overlay");
  if (!overlay || overlay.classList.contains("hidden")) return;

  const content = overlay.querySelector(".connection-content");
  if (!content) return;

  if (content.querySelector(".demo-btn")) return;

  const demoBtn = document.createElement("button");
  demoBtn.className = "demo-btn";
  demoBtn.textContent = "✨ Try Demo Mode";
  demoBtn.style.cssText = `
    margin-top: 20px;
    padding: 15px 30px;
    background: linear-gradient(135deg, #4ade80, #22c55e);
    color: #000;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(74, 222, 128, 0.3);
  `;

  demoBtn.addEventListener("click", enableDemoMode);
  content.appendChild(demoBtn);

  const hint = document.createElement("p");
  hint.innerHTML =
    "<br><kbd>1-7</kbd> states | <kbd>X</kbd> xythobuz | <kbd>C</kbd> cal | <kbd>Y</kbd> studio | <kbd>Esc</kbd> stop | <kbd>D</kbd> debug";
  hint.style.cssText = `
    margin-top: 15px;
    font-size: 13px;
    color: #8b8b9a;
    line-height: 1.6;
  `;
  content.appendChild(hint);
}

function enableDemoMode() {
  isOfflineMode = true;
  hideConnectionOverlay();
  updateStatusBadge("DEMO", "#fbbf24");

  const states = getAllStates();
  if (!states.length) return;
  let index = 0;
  setState(states[0]);
  index++;

  demoInterval = setInterval(() => {
    setState(states[index]);
    index = (index + 1) % states.length;
  }, 2000);

  /* Escape stops demo (see main keydown handler for full-range) */
}

function stopDemoCycle() {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
  }
}

/** i18n helper: config overrides, then fallbacks. */
function t(key) {
  const cfg = typeof window !== "undefined" ? window.OTACLAW_CONFIG : null;
  return cfg?.i18n?.[key] ?? REACTION_MAP[key] ?? STATE_SPEECH[key] ?? key;
}

/** NES-style reaction lines – small bank of canned phrases, like game dialogue. Config i18n overrides. */
const REACTION_MAP = {
  thinking: "Hmmm....",
  confused: "Huh?",
  contemplative: "Hmmm....",
  processing: "Processing",
  success: "Got it!",
  happy: "Nice!",
  positive: "Nice!",
  approval: "Okay!",
  laughing: "Haha!",
  funny: "Heh!",
  excited: "Whoa!",
  surprised: "Woah!",
  shocked: "Woah!",
  alarmed: "Yikes!",
  scared: "Eep!",
  sad: "Aw...",
  error: "Oops...",
  disappointed: "Darn.",
  worried: "Hmm...",
  concerned: "Hmm...",
  unpleasant: "Yeesh.",
  idle: "",
  calm: "",
  neutral: "",
  resting: "",
  base: "",
  waving: "Hey!",
  greeting: "Hi there!",
  talking: "...",
  listening: "...",
  confident: "Heh.",
  wink: "Heh.",
  playful: "Oh?",
  cold: "Brr...",
  tired: "Zzz...",
  presenting: "Ta-da!",
  explaining: "So...",
};

function getReaction(s) {
  const tags = (s.tags || []).map((t) => t.toLowerCase().split(/[:\s]/)[0]);
  for (const tag of tags) {
    const r = t(tag);
    if (r && r !== tag) return r;
  }
  return ["...", "Hmm.", "Okay.", "—"][s.idx % 4];
}

/** If (col,row) is the first stage of a multi-stage emotion, return its stages; else null. */
function getStagesForFrame(col, row) {
  for (const [, frame] of Object.entries(OTACON_GRID.frames)) {
    if (!frame?.stages || frame.stages.length <= 1) continue;
    const first = frame.stages[0];
    if (first.col === col && first.row === row) return frame.stages;
  }
  return null;
}

/** Full range: cycle through ALL frames. Uses sprite-catalog (individual) or frame-catalog (sheet). Press F to toggle.
 * @param {Object} opts - { singlePass: boolean, onComplete: () => void }
 */
let fullRangeInterval = null;
let fullRangeTimeoutId = null;
async function startFullRangeDemo(opts = {}) {
  const { singlePass = false, onComplete } = opts;
  if (fullRangeInterval || fullRangeTimeoutId) {
    if (fullRangeInterval) clearInterval(fullRangeInterval);
    if (fullRangeTimeoutId) clearTimeout(fullRangeTimeoutId);
    fullRangeInterval = null;
    fullRangeTimeoutId = null;
    setState("idle");
    if (isDebug()) console.log("[OtaClaw] Full range stopped");
    return;
  }
  stopDemoCycle();
  /* Widget uses sprite sheet; prefer frame-catalog to avoid individual-file 404s */
  const useSheet =
    document.body.classList.contains("otaclaw-widget") ||
    !SPRITE_CATALOG?.useIndividualFiles;
  const list = useSheet ? [] : (SPRITE_CATALOG?.sprites?.filter((s) => !s.skip) ?? []);
  if (list.length) {
    let i = 0;
    const cycle = () => {
      const s = list[i];
      setFrame(s.col, s.row, { speech: getReaction(s), badge: `#${s.idx}` });
      i += 1;
      if (singlePass && i >= list.length) {
        clearInterval(fullRangeInterval);
        fullRangeInterval = null;
        onComplete?.();
        return;
      }
      i = i % list.length;
    };
    cycle();
    fullRangeInterval = setInterval(cycle, 1500);
    if (isDebug()) console.log(
      "[OtaClaw] Full range: cycling",
      list.length,
      "sprites (individual). Press F to stop.",
    );
    return;
  }
  try {
    const catalog = await fetch("data/frame-catalog.json").then((r) =>
      r.json(),
    );
    const skipSet = new Set(
      (catalog.skip || []).map((s) => `${s.col},${s.row}`),
    );
    const frames = (catalog.frames || []).filter(
      (f) => !skipSet.has(`${f.col},${f.row}`),
    );
    if (!frames.length) return;
    const STAGE_MS = 400;
    const FRAME_MS = 1500;
    let i = 0;
    fullRangeInterval = "timeout";
    const scheduleNext = (delay) => {
      fullRangeTimeoutId = setTimeout(() => {
        if (!fullRangeInterval) return;
        const f = frames[i];
        const reaction = getReaction({ tags: f.tags || [], idx: i });
        const stages = getStagesForFrame(f.col, f.row);
        if (stages && stages.length > 1) {
          let si = 0;
          const playStage = () => {
            const cell = stages[si];
            setFrame(cell.col, cell.row, { speech: reaction, badge: `#${i}/${frames.length}` });
            si += 1;
            if (si < stages.length) {
              fullRangeTimeoutId = setTimeout(playStage, STAGE_MS);
            } else {
              i += stages.length;
              if (singlePass && i >= frames.length) {
                fullRangeInterval = null;
                fullRangeTimeoutId = null;
                onComplete?.();
                return;
              }
              i = i % frames.length;
              scheduleNext(FRAME_MS);
            }
          };
          playStage();
        } else {
          setFrame(f.col, f.row, { speech: reaction, badge: `#${i}/${frames.length}` });
          i += 1;
          if (singlePass && i >= frames.length) {
            fullRangeInterval = null;
            fullRangeTimeoutId = null;
            onComplete?.();
            return;
          }
          i = i % frames.length;
          scheduleNext(FRAME_MS);
        }
      }, delay);
    };
    scheduleNext(0);
    if (isDebug()) console.log(
      "[OtaClaw] Full range: cycling",
      frames.length,
      "frames (sheet). Press F to stop.",
    );
  } catch (e) {
    console.warn("[OtaClaw] Could not load catalog:", e);
  }
}

function stopFullRangeDemo() {
  if (fullRangeInterval && typeof fullRangeInterval === "number") {
    clearInterval(fullRangeInterval);
  }
  if (fullRangeTimeoutId) {
    clearTimeout(fullRangeTimeoutId);
  }
  fullRangeInterval = null;
  fullRangeTimeoutId = null;
  setState("idle");
}

// State → NES-style canned reaction lines (dialogue bank). Config i18n overrides.
const STATE_SPEECH = {
  idle: "",
  thinking: "Hmmm....",
  processing: "Processing",
  success: "Got it!",
  error: "Oops...",
  laughing: "Haha!",
  surprised: "Woah!",
};

/**
 * Set frame directly by cell (col, row). Bypasses emotion mapping.
 * Clawdbot can use this for semantic selection (e.g. unpleasant topic → 9,0).
 * Overflow frames (4,1) get scale 0.9 automatically.
 */
function setFrame(col, row, options = {}) {
  if (
    document.body.classList.contains("otaclaw-widget") &&
    !window.__otaclawBootComplete
  )
    return;
  const spriteContainer = document.getElementById("sprite");
  const stateBadge = document.getElementById("current-state");
  const speechText = document.getElementById("speech-text");
  const speechBubble = document.getElementById("speech-bubble");
  const frameEl = spriteContainer?.querySelector(".otacon-frame");

  if (!spriteContainer || !frameEl) return;

  /* Use individual sprites when catalog says so – no sprite sheet, we have beautiful individual PNGs */
  if (SPRITE_CATALOG?.useIndividualFiles) {
    const spr = SPRITE_CATALOG.sprites.find(
      (s) => s.col === col && s.row === row && !s.skip,
    );
    if (spr) {
      const base = SPRITE_CATALOG.basePath || "assets/sprites/";
      const raw = base.replace(/\/$/, "") + "/" + spr.file;
      const url =
        typeof window.otaclawAssetUrl === "function"
          ? window.otaclawAssetUrl(raw)
          : raw;
      frameEl.style.backgroundImage = `url('${url}')`;
      frameEl.style.backgroundSize = "contain";
      frameEl.style.backgroundPosition = "center";
      frameEl.style.width = "";
      frameEl.style.height = "";
      if (!document.body.classList.contains("otaclaw-widget")) {
        document.documentElement.style.setProperty("--otacon-scale", "1");
      }
    }
  } else if (document.body.classList.contains("use-otacon-sprite")) {
    const scaleMult = col === 4 && row === 1 ? 0.9 : 1;
    const pos = getOtaconPositionByCell(col, row, scaleMult);
    const root = document.documentElement;
    root.style.setProperty("--otacon-frame-x", String(Math.round(pos.x)));
    root.style.setProperty("--otacon-frame-y", String(Math.round(pos.y)));
    root.style.setProperty("--otacon-frame-w", String(pos.frameW));
    root.style.setProperty("--otacon-frame-h", String(pos.frameH));
    root.style.setProperty("--otacon-sheet-w", String(OTACON_GRID.sheetW));
    root.style.setProperty("--otacon-sheet-h", String(OTACON_GRID.sheetH));
    root.style.setProperty("--otacon-scale", String(pos.scale));
    const sheetRaw = "assets/sprites/otaclock-original.png";
    const sheetUrl =
      typeof window.otaclawAssetUrl === "function"
        ? window.otaclawAssetUrl(sheetRaw)
        : sheetRaw;
    frameEl.style.backgroundImage = `url('${sheetUrl}')`;
    frameEl.style.backgroundSize = `${OTACON_GRID.sheetW}px ${OTACON_GRID.sheetH}px`;
    frameEl.style.backgroundPosition = "";
  }

  Array.from(spriteContainer.classList)
    .filter((c) => c.startsWith("state-"))
    .forEach((c) => spriteContainer.classList.remove(c));
  spriteContainer.classList.add("state-frame");
  spriteContainer.dataset.frame = `${col},${row}`;

  if (stateBadge) {
    stateBadge.textContent = options.badge ?? `frame ${col},${row}`;
    stateBadge.setAttribute("data-state", options.badge ?? "_frame");
  }
  if (speechText) speechText.textContent = options.speech ?? "";
  if (speechBubble)
    speechBubble.classList.toggle("has-text", !!(options.speech ?? ""));

  currentState = "_frame";
}

function setState(state) {
  const spriteContainer = document.getElementById("sprite");
  const stateBadge = document.getElementById("current-state");
  const speechText = document.getElementById("speech-text");
  const speechBubble = document.getElementById("speech-bubble");

  if (!spriteContainer) return;

  if (SPRITE_CATALOG?.useIndividualFiles) {
    const frame = OTACON_GRID.frames[state];
    const stages = frame?.stages ?? [{ col: 0, row: 0 }];
    const stageIdx = stages.length
      ? Math.floor(Math.random() * stages.length)
      : 0;
    const cell = stages[stageIdx] || stages[0];
    setFrame(cell.col, cell.row, { speech: t(state) ?? "", badge: state });
    return;
  }

  if (document.body.classList.contains("use-otacon-sprite")) {
    const frame = OTACON_GRID.frames[state];
    const stages = frame?.stages;
    const stageIdx = stages?.length
      ? Math.floor(Math.random() * stages.length)
      : 0;
    const pos = getOtaconPosition(state, stageIdx);
    if (pos) {
      document.documentElement.style.setProperty(
        `--otacon-${state}-x`,
        String(Math.round(pos.x)),
      );
      document.documentElement.style.setProperty(
        `--otacon-${state}-y`,
        String(Math.round(pos.y)),
      );
      document.documentElement.style.setProperty(
        `--otacon-${state}-frame-w`,
        String(pos.frameW),
      );
    }
  }

  // Remove all state-* classes
  Array.from(spriteContainer.classList)
    .filter((c) => c.startsWith("state-"))
    .forEach((c) => spriteContainer.classList.remove(c));
  spriteContainer.classList.add(`state-${state}`);

  if (stateBadge) {
    stateBadge.textContent = state;
    stateBadge.setAttribute("data-state", state);
  }

  if (speechText) speechText.textContent = t(state) || "";
  if (speechBubble)
    speechBubble.classList.toggle("has-text", !!(t(state) || ""));

  currentState = state;

  const duration = OTACLAW_CONFIG.stateDurations[state];
  if (duration && duration > 0 && !demoInterval) {
    setTimeout(() => {
      if (calibrationMode) return;
      if (currentState === state && !demoInterval) {
        setState("idle");
      }
    }, duration);
  }
}

function updateStatusBadge(text, color) {
  const statusIndicator = document.getElementById("connection-status");
  if (statusIndicator) {
    const dot = statusIndicator.querySelector(".status-dot");
    const textSpan = statusIndicator.querySelector(".status-text");

    if (dot) dot.style.background = color;
    if (textSpan) {
      textSpan.textContent = text;
      textSpan.style.color = color;
    }
  }
}

// ==================== CALIBRATION TOOL ====================

function toggleCalibrationMode() {
  calibrationMode = !calibrationMode;
  const body = document.body;
  const spriteContainer = document.getElementById("sprite");
  const frame = spriteContainer?.querySelector(".otacon-frame");

  if (calibrationMode) {
    stopDemoCycle();
    body.classList.add("calibration-mode");
    hideConnectionOverlay();

    calOtaconSprite = body.classList.contains("use-otacon-sprite");

    if (calOtaconSprite) {
      calStep = 0.5;
      const pos = getOtaconPosition(currentState);
      if (pos) {
        calX = pos.x;
        calY = pos.y;
        calScale = pos.scale;
      }
      if (isDebug()) console.log(
        `[Calibration] Sprite ${currentState} - arrows: position, [ ]: scale, S: save`,
      );
    } else if (spriteContainer) {
      spriteContainer.classList.remove(
        "state-idle",
        "state-thinking",
        "state-processing",
        "state-success",
        "state-error",
        "state-laughing",
        "state-surprised",
      );
      if (isDebug()) console.log("[Calibration] Sethen - Use arrows, 0-9 presets, S to save");
    }

    createCalibrationUI();
    updateCalibrationFrame();
  } else {
    body.classList.remove("calibration-mode");
    removeCalibrationUI();

    if (frame) {
      frame.style.backgroundPosition = "";
      frame.style.animation = "";
      frame.style.transform = "";
    }
    if (spriteContainer && !calOtaconSprite) {
      spriteContainer.classList.add("state-idle");
    }
  }
}

function escapeHtml(v) {
  const s = String(v ?? "");
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function createCalibrationUI() {
  if (document.getElementById("calibration-ui")) return;

  const scaleRow = calOtaconSprite
    ? `<div class="calibration-row">
      <label>Scale:</label>
      <span id="cal-scale-display">${escapeHtml(calScale.toFixed(1))}</span>
    </div>`
    : "";

  const ui = document.createElement("div");
  ui.id = "calibration-ui";
  ui.className = "calibration-controls";
  ui.innerHTML = `
    <h3>🎯 ${calOtaconSprite ? "Sprite" : "Sprite"} Calibration</h3>
    <div class="calibration-row">
      <label>X position:</label>
      <span id="cal-x-display">${escapeHtml(calX)}px</span>
    </div>
    <div class="calibration-row">
      <label>Y position:</label>
      <span id="cal-y-display">${escapeHtml(calY)}px</span>
    </div>
    ${scaleRow}
    <div class="calibration-row">
      <label>Step size:</label>
      <span id="cal-step">${escapeHtml(calStep)}px</span>
    </div>
    <div class="calibration-row" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;">
      <label>Output:</label>
      <span id="cal-css" style="font-size: 11px; color: #0f0;">${escapeHtml(calOtaconSprite ? `x:${calX} y:${calY} scale:${calScale.toFixed(1)}` : `background-position: ${calX}px ${calY}px`)}</span>
    </div>
    <div class="calibration-help">
      <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> Position
      ${calOtaconSprite ? "<br><kbd>[</kbd><kbd>]</kbd> Scale up/down" : ""}
      <br><kbd>+</kbd>/<kbd>-</kbd> Step (0.5–5px)
      ${calOtaconSprite ? "" : "<br><kbd>0-9</kbd> Presets"}
      <br><kbd>S</kbd> Save (persists)
      ${calOtaconSprite ? "<br><kbd>Shift+S</kbd> Clear saved" : ""}
      <br><kbd>C</kbd> Exit
    </div>
  `;

  document.body.appendChild(ui);

  updateCalibrationFrame();
}

function removeCalibrationUI() {
  const ui = document.getElementById("calibration-ui");
  if (ui) ui.remove();
}

function updateCalibrationUI() {
  const xEl = document.getElementById("cal-x-display");
  const yEl = document.getElementById("cal-y-display");
  const scaleEl = document.getElementById("cal-scale-display");
  const stepEl = document.getElementById("cal-step");
  const cssEl = document.getElementById("cal-css");

  if (xEl)
    xEl.textContent =
      (typeof calX === "number" ? calX : parseFloat(calX) || 0).toFixed(1) +
      "px";
  if (yEl)
    yEl.textContent =
      (typeof calY === "number" ? calY : parseFloat(calY) || 0).toFixed(1) +
      "px";
  if (scaleEl) scaleEl.textContent = calScale.toFixed(1);
  if (stepEl) stepEl.textContent = calStep + "px";
  if (cssEl) {
    cssEl.textContent = calOtaconSprite
      ? `${currentState}: x:${calX} y:${calY} scale:${calScale.toFixed(1)}`
      : `background-position: ${calX}px ${calY}px;`;
  }
}

function updateCalibrationFrame() {
  const spriteContainer = document.getElementById("sprite");
  const frame = spriteContainer?.querySelector(".otacon-frame");

  if (frame && calibrationMode) {
    frame.style.animation = "none";
    const x = typeof calX === "number" ? calX : parseFloat(calX) || 0;
    const y = typeof calY === "number" ? calY : parseFloat(calY) || 0;
    frame.style.backgroundPosition = `${x}px ${y}px`;
    if (calOtaconSprite) {
      frame.style.transform = `scale(${calScale})`;
    }
  }
}

function saveCalibration() {
  if (calOtaconSprite) {
    const saved = loadOtaconCal();
    saved._scale = Math.round(calScale * 10) / 10;
    saveOtaconCal(saved);
    injectOtaconVars();
    if (isDebug()) console.log(
      "%c[Sprite] Saved to localStorage — will persist after refresh",
      "color: #0f0; font-weight: bold;",
    );
  } else {
    if (isDebug()) console.log("%c[Calibration]", "color: #0f0; font-weight: bold;", {
      x: calX,
      y: calY,
      css: `background-position: ${calX}px ${calY}px;`,
    });
  }

  const ui = document.getElementById("calibration-ui");
  if (ui) {
    ui.style.outline = "2px solid #0f0";
    setTimeout(() => {
      ui.style.outline = "";
    }, 300);
  }
}

function loadPreset(num) {
  if (!calibrationMode) {
    if (isDebug()) console.log("[Calibration] Press C first to enter calibration mode");
    return;
  }

  const preset = FRAME_PRESETS[num];
  if (preset) {
    calX = preset.x;
    calY = preset.y;
    if (isDebug()) console.log(`[Calibration] Loaded preset ${num}: ${preset.name}`);
    updateCalibrationUI();
    updateCalibrationFrame();
  }
}

// ==================== KEYBOARD SHORTCUTS ====================

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Calibration mode controls
    if (calibrationMode) {
      switch (e.key) {
        case "ArrowUp":
          calY += calStep;
          updateCalibrationUI();
          updateCalibrationFrame();
          e.preventDefault();
          break;
        case "ArrowDown":
          calY -= calStep;
          updateCalibrationUI();
          updateCalibrationFrame();
          e.preventDefault();
          break;
        case "ArrowLeft":
          calX += calStep;
          updateCalibrationUI();
          updateCalibrationFrame();
          e.preventDefault();
          break;
        case "ArrowRight":
          calX -= calStep;
          updateCalibrationUI();
          updateCalibrationFrame();
          e.preventDefault();
          break;
        case "+":
        case "=":
          calStep += calOtaconSprite ? 0.5 : 1;
          updateCalibrationUI();
          e.preventDefault();
          break;
        case "-":
          calStep = calOtaconSprite
            ? Math.max(0.5, calStep - 0.5)
            : Math.max(1, calStep - 1);
          updateCalibrationUI();
          e.preventDefault();
          break;
        case "[":
          if (calOtaconSprite) {
            calScale = Math.max(1, calScale - 0.1);
            updateCalibrationUI();
            updateCalibrationFrame();
          }
          e.preventDefault();
          break;
        case "]":
          if (calOtaconSprite) {
            calScale = Math.min(5, calScale + 0.1);
            updateCalibrationUI();
            updateCalibrationFrame();
          }
          e.preventDefault();
          break;
        case "s":
        case "S":
          if (e.shiftKey && calOtaconSprite) {
            saveOtaconCal({});
            injectOtaconVars();
            calX = Math.round(getOtaconPosition(currentState)?.x ?? calX);
            calY = Math.round(getOtaconPosition(currentState)?.y ?? calY);
            calScale = getOtaconPosition(currentState)?.scale ?? calScale;
            updateCalibrationUI();
            updateCalibrationFrame();
            if (isDebug()) console.log("%c[Sprite] Cleared saved calibration", "color: #f80;");
          } else {
            saveCalibration();
          }
          e.preventDefault();
          break;
        case "c":
        case "C":
          toggleCalibrationMode();
          e.preventDefault();
          break;
      }

      // Number keys for presets
      if (e.key >= "0" && e.key <= "9") {
        loadPreset(e.key);
      }

      return; // Don't process other keys in calibration mode
    }

    // Normal mode
    switch (e.key) {
      case "Escape":
        if (fullRangeInterval) {
          clearInterval(fullRangeInterval);
          fullRangeInterval = null;
          setState("idle");
          if (isDebug()) console.log("[OtaClaw] Full range stopped");
        }
        stopDemoCycle();
        break;
      case "c":
      case "C":
        toggleCalibrationMode();
        break;
      case "f":
      case "F":
        if (!document.body.classList.contains("otaclaw-widget")) startFullRangeDemo();
        e.preventDefault();
        break;
      case "d":
      case "D":
        toggleDebugPanel();
        break;
      case "x":
      case "X":
        document.body.classList.toggle("use-xythobuz");
        if (isDebug()) console.log(
          "[OtaClaw] Sprite source:",
          document.body.classList.contains("use-xythobuz")
            ? "xythobuz"
            : "sethen",
        );
        break;
    }

    // Number keys for states
    const stateMap = {
      1: "idle",
      2: "thinking",
      3: "processing",
      4: "success",
      5: "error",
      6: "laughing",
      7: "surprised",
    };

    if (stateMap[e.key]) {
      stopDemoCycle();
      setState(stateMap[e.key]);
    }
  });
}

function toggleDebugPanel() {
  const debugPanel = document.getElementById("debug-panel");
  if (debugPanel) {
    debugPanel.classList.toggle("hidden");
  }
}

// Eyes overlay (xythobuz): from Render.m - eyes at EYE_X/Y_OFFSET, follow mouse + blink.
// Smooth transition: brief opacity fade when switching to avoid hard pop.
let _eyesCleanup = null;

function teardownEyes() {
  if (_eyesCleanup) {
    _eyesCleanup();
    _eyesCleanup = null;
  }
}

function setupEyes() {
  const eyesLayer = document.getElementById("eyes-layer");
  if (!eyesLayer) return;

  // Clean up any existing eyes setup
  teardownEyes();

  const EYE_BLINK = 0,
    EYE_TOP_RIGHT = 4,
    EYE_TOP_LEFT = 2,
    EYE_BOTTOM_RIGHT = 3,
    EYE_BOTTOM_LEFT = 1;
  const base = 'url("assets/sprites/otaclock-xythobuz/eyes_';
  let lastEye = EYE_TOP_LEFT;
  let blinking = false;
  let blinkTimer = null;
  let raf = null;

  function setEye(id, smooth) {
    if (blinking && id !== EYE_BLINK) return;
    const url = base + id + '.png")';
    if (
      smooth &&
      eyesLayer.style.backgroundImage &&
      eyesLayer.style.backgroundImage !== url
    ) {
      eyesLayer.style.opacity = "0";
      requestAnimationFrame(() => {
        eyesLayer.style.backgroundImage = url;
        requestAnimationFrame(() => {
          eyesLayer.style.opacity = "";
        });
      });
    } else {
      eyesLayer.style.backgroundImage = url;
    }
    lastEye = id;
  }

  function doBlink() {
    if (!document.body.classList.contains("use-xythobuz")) return;
    blinking = true;
    setEye(EYE_BLINK);
    setTimeout(() => {
      blinking = false;
      setEye(lastEye);
    }, 100);
    blinkTimer = setTimeout(doBlink, 2000 + Math.random() * 3000);
  }

  function updateEyesFromMouse(e) {
    if (!document.body.classList.contains("use-xythobuz")) return;
    const sprite = document.getElementById("sprite");
    const rect = sprite?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const top = e.clientY < cy;
    const right = e.clientX > cx;
    let id = EYE_BOTTOM_LEFT;
    if (top && right) id = EYE_TOP_RIGHT;
    else if (top && !right) id = EYE_TOP_LEFT;
    else if (!top && right) id = EYE_BOTTOM_RIGHT;
    setEye(id, true);
  }

  const onMouseMove = (e) => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => updateEyesFromMouse(e));
  };
  const onPointerMove = (e) => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => updateEyesFromMouse(e));
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointermove", onPointerMove);

  setEye(EYE_TOP_LEFT);
  blinkTimer = setTimeout(doBlink, 3000);

  // Store cleanup function
  _eyesCleanup = function () {
    clearTimeout(blinkTimer);
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("pointermove", onPointerMove);
  };
}

function setupUI() {
  const closeDebug = document.getElementById("close-debug");
  if (closeDebug) {
    closeDebug.addEventListener("click", () => {
      const debugPanel = document.getElementById("debug-panel");
      if (debugPanel) debugPanel.classList.add("hidden");
    });
  }

  const testButtons = document.querySelectorAll(".test-btn");
  testButtons.forEach((btn) => {
    if (btn.id === "open-studio-btn") return;
    btn.addEventListener("click", () => {
      const state = btn.dataset.state;
      if (state) {
        stopDemoCycle();
        setState(state);
      }
    });
  });

  /* Widget: otaclaw handles tap (thinking) and tickle (laughing); skip to avoid overriding laugh */
  const touchOverlay = document.getElementById("touch-overlay");
  if (touchOverlay && !document.body.classList.contains("otaclaw-widget")) {
    touchOverlay.addEventListener("click", () => {
      if (!demoInterval && currentState === "idle") {
        setState("thinking");
        setTimeout(() => {
          if (currentState === "thinking") {
            setState("idle");
          }
        }, 1000);
      }
    });
  }
}

// ==================== CALIBRATION STUDIO ====================

function setupCalibrationStudio() {
  const studio = document.getElementById("calibration-studio");
  const studioClose = document.getElementById("studio-close");
  const safeZoneCheck = document.getElementById("studio-safe-zone");
  const gridCheck = document.getElementById("studio-grid");
  const safeZoneOverlay = document.getElementById("safe-zone-overlay");
  const sheetPreview = document.getElementById("studio-sheet-preview");
  const sheetGridOverlay = document.getElementById("sheet-grid-overlay");
  const studioMappingText = document.getElementById("studio-mapping-text");
  const studioScale = document.getElementById("studio-scale");
  const studioApply = document.getElementById("studio-apply");

  if (!studio) return;

  function openStudio() {
    studio.classList.remove("hidden");
    const saved = loadOtaconCal();
    if (studioMappingText)
      studioMappingText.value = saved._mapping ?? DEFAULT_MAPPING;
    if (studioScale) studioScale.value = saved._scale ?? 4;
    if (sheetGridOverlay)
      sheetGridOverlay.style.backgroundSize = `${100 / OTACON_GRID.cols}% ${100 / OTACON_GRID.rows}%`;
    if (gridCheck?.checked) sheetPreview?.classList.add("grid-active");
    updateSafeZone();
  }

  function closeStudio() {
    studio.classList.add("hidden");
    if (safeZoneOverlay) safeZoneOverlay.classList.add("hidden");
    if (sheetPreview) sheetPreview.classList.remove("grid-active");
  }

  function updateSafeZone() {
    if (!safeZoneCheck?.checked || !safeZoneOverlay) {
      safeZoneOverlay?.classList.add("hidden");
      return;
    }
    const viewport = document.getElementById("sprite-viewport");
    const el = viewport || document.querySelector(".otacon-frame");
    if (!el) return;
    const rect = el.getBoundingClientRect();
    safeZoneOverlay.style.width = `${rect.width}px`;
    safeZoneOverlay.style.height = `${rect.height}px`;
    safeZoneOverlay.style.left = `${rect.left}px`;
    safeZoneOverlay.style.top = `${rect.top}px`;
    safeZoneOverlay.style.position = "fixed";
    safeZoneOverlay.style.transform = "none";
    safeZoneOverlay.classList.remove("hidden");
  }

  studioClose?.addEventListener("click", closeStudio);
  safeZoneCheck?.addEventListener("change", updateSafeZone);
  gridCheck?.addEventListener("change", () => {
    sheetPreview?.classList.toggle("grid-active", gridCheck.checked);
  });

  studioApply?.addEventListener("click", () => {
    const text = studioMappingText?.value?.trim() || DEFAULT_MAPPING;
    const scale = parseFloat(studioScale?.value) || 4;
    const saved = loadOtaconCal();
    saved._mapping = text;
    saved._scale = scale;
    saveOtaconCal(saved);
    applyMapping(text);
    injectOtaconVars();
    document.documentElement.style.setProperty("--otacon-scale", String(scale));
    if (isDebug()) console.log(
      "[Studio] Applied:",
      Object.keys(OTACON_GRID.frames).length,
      "emotions",
    );
  });

  window.addEventListener("resize", () => {
    if (!studio.classList.contains("hidden") && safeZoneCheck?.checked)
      updateSafeZone();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "y" || e.key === "Y") {
      studio.classList.toggle("hidden", !studio.classList.contains("hidden"));
      if (!studio.classList.contains("hidden")) openStudio();
      else closeStudio();
      e.preventDefault();
    }
  });

  const openStudioBtn = document.getElementById("open-studio-btn");
  if (openStudioBtn) openStudioBtn.addEventListener("click", openStudio);

  if (window.otaclaw) {
    window.otaclaw.openCalibrationStudio = openStudio;
    window.otaclaw.closeCalibrationStudio = closeStudio;
  }
}

// Expose to global
/** Set frame by index (0–47). Use when sprites are individual files. */
function setFrameByIndex(idx, options = {}) {
  const s = SPRITE_CATALOG?.sprites?.find((sp) => sp.idx === idx);
  if (s) setFrame(s.col, s.row, options);
}

window.otaclaw = {
  setState,
  setFrame,
  __rawSetFrame: setFrame,
  setFrameByIndex,
  startFullRangeDemo,
  stopFullRangeDemo,
  getSpriteCatalog: () => SPRITE_CATALOG,
  getState: () => currentState,
  getFrameCatalog: () => fetch("data/frame-catalog.json").then((r) => r.json()),
  enableDemoMode,
  stopDemoCycle,
  toggleDebugPanel,
  toggleCalibrationMode,
  calibration: {
    setPos: (x, y) => {
      calX = x;
      calY = y;
      updateCalibrationFrame();
    },
    getPos: () => ({ x: calX, y: calY }),
  },
};
