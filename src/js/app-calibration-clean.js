/**
 * OtaClaw with Sprite Calibration Tool - CLEAN VERSION
 * Minimal variant; some stubs reserved for future use.
 */
/* eslint-disable no-unused-vars */

const OTACON_GRID = {
  sheetW: 567,
  sheetH: 278,
  cols: 12,
  rows: 4,
  displayTargetH: 320,
  cellW: null,
  cellH: null,
  frames: {},
};

const cellW = () =>
  OTACON_GRID.cellW ?? Math.floor(OTACON_GRID.sheetW / OTACON_GRID.cols);
const cellH = () =>
  OTACON_GRID.cellH ?? Math.floor(OTACON_GRID.sheetH / OTACON_GRID.rows);

let SPRITE_CATALOG = null;

const DEFAULT_MAPPING = `idle: 0,0 1,0
thinking: 2,0 3,0 4,0 5,0
processing: 3,1 4,1 @0.9
success: 0,1 1,1 2,1 3,1
error: 2,2 3,2 4,2
laughing: 2,3 3,3 4,3
surprised: 9,0 10,0`;

// ... (rest of calibration functions unchanged) ...

const PRELOAD_TIMEOUT_MS = 6000;

function preloadWidgetSprites() {
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
  const load = Promise.all(
    all.map((f) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = basePath + "/" + f;
      });
    }),
  );
  const timeout = new Promise((resolve) =>
    setTimeout(resolve, PRELOAD_TIMEOUT_MS),
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

let _widgetFrameCyclerId = null;
let _widgetBubbleRepeatId = null;
const LIGHT_FADE_MS = 1200;

function startWidgetFrameCycler() {
  if (_widgetFrameCyclerId) {
    clearTimeout(_widgetFrameCyclerId);
    _widgetFrameCyclerId = null;
  }
  if (_widgetBubbleRepeatId) {
    clearInterval(_widgetBubbleRepeatId);
    _widgetBubbleRepeatId = null;
  }
  window.__otaclawBootComplete = false;

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
    if (splashEl) splashEl.classList.add("done");
    if (loadingEl) loadingEl.classList.add("done");
    if (overlay) {
      overlay.style.transition = `opacity ${LIGHT_FADE_MS}ms ease-out`;
      overlay.classList.remove(
        "boot-fade-1",
        "boot-fade-2",
        "boot-fade-3",
        "boot-fade-4",
      );
      overlay.classList.add("boot-fade-5");
    }
    setTimeout(() => {
      if (!document.body.classList.contains("widget-waiting")) return;
      if (spriteEl) spriteEl.classList.add("boot-rising");
      if (frame && startupSeq[0]) {
        frame.style.setProperty(
          "background-image",
          `url('${basePath}/${startupSeq[0]}')`,
          "important",
        );
        frame.style.setProperty("background-size", "contain", "important");
        frame.style.setProperty("background-position", "center", "important");
      }
      let idx = 0;
      const schedule = () => {
        if (!document.body.classList.contains("widget-waiting")) {
          _widgetFrameCyclerId = null;
          if (_widgetBubbleRepeatId) {
            clearInterval(_widgetBubbleRepeatId);
            _widgetBubbleRepeatId = null;
          }
          return;
        }
        if (frame && idx < startupSeq.length) {
          const url = `${basePath}/${startupSeq[idx]}`;
          frame.style.setProperty(
            "background-image",
            `url('${url}')`,
            "important",
          );
          frame.style.setProperty("background-size", "contain", "important");
          frame.style.setProperty("background-position", "center", "important");
          idx += 1;
        }
        if (idx < startupSeq.length) {
          _widgetFrameCyclerId = setTimeout(schedule, frameMs);
        } else {
          _widgetFrameCyclerId = null;
          setBootOverlayFade(5);
          setTimeout(() => {
            if (!document.body.classList.contains("widget-waiting")) return;
            if (spriteEl) spriteEl.classList.remove("boot-rising");
            if (_widgetBubbleRepeatId) {
              clearInterval(_widgetBubbleRepeatId);
              _widgetBubbleRepeatId = null;
            }
            window.__otaclawBootComplete = true;
            if (typeof window.__otaclawOnBootComplete === "function") {
              window.__otaclawOnBootComplete();
            }
          }, frameMs);
        }
      };
      schedule();
    }, LIGHT_FADE_MS);
    if (_widgetBubbleRepeatId) clearInterval(_widgetBubbleRepeatId);
    _widgetBubbleRepeatId = setInterval(() => {
      if (!document.body.classList.contains("widget-waiting")) return;
      const txt =
        (typeof window !== "undefined" && window.otaclawWaitingMsg) ||
        "Connecting...";
      if (typeof window.showWidgetConnectionMsgBrief === "function") {
        window.showWidgetConnectionMsgBrief(txt, 5000);
      }
    }, 12000);
  }

  if (splashFrame && splashEl && splashDurationMs > 0) {
    if (loadingEl) loadingEl.classList.add("done");
    splashEl.style.backgroundImage = `url('${basePath}/${splashFrame}')`;
    splashEl.classList.remove("done");
    _widgetFrameCyclerId = setTimeout(() => {
      if (!document.body.classList.contains("widget-waiting")) return;
      _widgetFrameCyclerId = null;
      runBootSequence();
    }, splashDurationMs);
  } else {
    runBootSequence();
  }
}

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
  const frame = document.querySelector("#sprite .otacon-frame");
  let idx = 0;
  const schedule = () => {
    if (!document.body.classList.contains("widget-asleep")) {
      _sleepFrameCyclerId = null;
      return;
    }
    if (frame && idx < sleepSeq.length) {
      const url = `${basePath}/${sleepSeq[idx]}`;
      frame.style.setProperty("background-image", `url('${url}')`, "important");
      frame.style.setProperty("background-size", "contain", "important");
      frame.style.setProperty("background-position", "center", "important");
      setBootOverlayFade(Math.max(1, 5 - idx));
      idx += 1;
    }
    if (idx < sleepSeq.length) {
      _sleepFrameCyclerId = setTimeout(schedule, frameMs);
    } else {
      _sleepFrameCyclerId = null;
      const overlay = document.getElementById("boot-black-overlay");
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
      if (typeof onComplete === "function") onComplete();
    }
  };
  setBootOverlayFade(4);
  schedule();
}

function runWakeSequence(onComplete) {
  document.body.classList.remove("widget-asleep");
  document.body.classList.add("widget-waiting");
  window.__otaclawAsleep = false;
  window.__otaclawBootComplete = false;
  const overlay = document.getElementById("boot-black-overlay");
  if (overlay) overlay.classList.remove("boot-sleep");
  _widgetFrameCyclerId = null;
  if (_widgetBubbleRepeatId) {
    clearInterval(_widgetBubbleRepeatId);
    _widgetBubbleRepeatId = null;
  }
  if (typeof onComplete === "function") {
    window.__otaclawOnBootComplete = onComplete;
  }
  startWidgetFrameCycler();
}

if (typeof window !== "undefined") {
  window.runSleepSequence = runSleepSequence;
  window.runWakeSequence = runWakeSequence;
}

// Rest of file continues...
