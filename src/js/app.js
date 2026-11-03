/**
 * OtaClaw for OpenClaw - Main Application (WebSocket / Agent Orchestrator)
 *
 * Entry point that wires the WebSocket client to the sprite engine.
 *
 * ## Load order (enforced by HTML)
 *   1. `sprite-runtime.js`   (ES module, imported first) — installs sprite globals:
 *          window.otaclaw, window.runSleepSequence, window.runWakeSequence,
 *          window.showWidgetConnectionMsg, window.__otaclawBootComplete, ...
 *   2. `app.js`              (ES module, THIS FILE) — consumes those globals
 *          to drive states from OpenClaw / any compatible WS gateway events.
 *
 * `app.js` MUST run after `sprite-runtime.js`; the boot sequence in the
 * runtime module owns the `widget-waiting` class on body.
 *
 * ## Sprite engine (single path)
 * All organic frame selection and work/idle animation loops live in
 * `AnimationController`. This file only orchestrates: WS events → context →
 * `animator.startIdle()` / `startWork()` / terminal sequences. DOM helpers
 * (waiting overlay, blink overlay, sleep) stay here.
 *
 * Config: inline in HTML (window.OTACLAW_CONFIG) or config.js when MIME types correct.
 */

import "./sprite-runtime.js?v=22";
import { WebSocketClient } from "./websocket-client.js?v=48";
import { OtaClawEngine } from "./otaclaw.js?v=48";
import { otaclawMonitor as monitor } from "./core/monitor.js";
import { CharacterExpressionEngine } from "./core/character-expression.js";
import { detectEmotion, detectNotification, RECENT_WINDOW } from "./core/emotion-patterns.js";
import { AnimationController } from "./core/animation-controller.js";
import { TimerManager } from "./core/timer-manager.js";
import {
  StateCoordinator,
  coherentEventState,
  endsRun,
  getStateSprite,
  getStateTable,
  isMappingEnabled,
} from "./core/state-sprite-map.js";
import { normalizeGatewayConfig } from "./core/config-validator.js";
import {
  findSpriteFunction,
  findToolFunction,
  spriteSignalMap,
} from "./core/sprite-functions.js";
import { resolveAvatar } from "./core/avatar-director.js";
import { summarizeSpeech } from "./core/speech-policy.js";

// Tool -> the exact Hal pose (Vibeconf's ACTIVITY_EMOJIS, 1:1 here).
const TOOL_SPRITE = {
  search: "curious",
  read: "explain_left",
  write: "explain_right",
  terminal: "hand_on_hip",
  memory: "contemplate",
  web: "curious",
  delegate: "dynamic_confident",
  clarify: "shrug",
  vision: "shocked_left",
};

// Director sequences: human pacing per state (ms per frame). Work states loop
// while the state persists; terminal states play once, hold, then idle.
const DIRECTOR_SEQ_FRAME_MS = {
  idle: 10000,
  thinking: 1000,
  processing: 700,
  success: 600,
  laughing: 550,
  error: 750,
  surprised: 550,
  curious: 1000,
  confused: 1000,
  excited: 650,
  worried: 850,
  presenting: 850,
  greeting: 750,
  sad: 850,
  scared: 700,
  confident: 850,
  tool: 700,
};
const DIRECTOR_SEQ_LOOP = new Set([
  "idle",
  "thinking",
  "processing",
  "curious",
  "confused",
  "worried",
  "presenting",
  "confident",
  "tool",
]);
const DIRECTOR_SEQ_HOLD_MS = {
  success: 2200,
  laughing: 1600,
  error: 2200,
  surprised: 1500,
  excited: 1500,
  greeting: 1200,
};
const DIRECTOR_IDLE_SEQ = [
  [0, 0],
  [3, 0],
  [11, 0],
  [8, 0],
];

/** Copy helper shared by the speech bubble and the codec subtitle. */
async function copyTextToClipboard(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
if (typeof window !== "undefined") window.otaclawCopyText = copyTextToClipboard;
import { EasterEggs } from "./easter-eggs.js";

// Early preload so catalog is ready before boot/waiting/idle start.
if (typeof window !== "undefined" && typeof fetch === "function") {
  const earlyAsset = (p) =>
    typeof window.otaclawAssetUrl === "function" ? window.otaclawAssetUrl(p) : p;
  fetch(earlyAsset("data/frame-catalog.json?early=" + Date.now()))
    .then((r) => (r && r.ok ? r.json() : null))
    .then((cat) => {
      if (cat && !window.__otaclawEarlyCatalog) window.__otaclawEarlyCatalog = cat;
    })
    .catch(() => {});
}

class OtaClawApp {
  constructor() {
    try {
      if (new URLSearchParams(window.location.search).get("compact") === "1") {
        document.body.classList.add("otaclaw-compact");
      }
    } catch (_) {
      /* ignore */
    }
    this.config = null;
    this.wsClient = null;
    this.otaclaw = null;
    this.isRunning = false;
    this.debugMode = false;
    this.isOfflineMode = false;
    this._lastFrame = null;
    this._overlaySavedFrame = null;
    this._frameGeneration = 0;
    this._blinkOverlayHandle = null;
    this._blinkRestoreTimer = null;
    this._blinkResolve = null;

    // For organic, context-aware sprite selection (category from tools, emotion lock, etc.)
    this._lastContext = null;
    this._lastFrameKey = null;
    this._activeWorkUntil = 0;
    this._poolCycleIndex = {};
    this._lastDisconnectAt = 0;
    this._lastGreetingAt = 0;
    this.animator = null;
    this._timers = null;
    this._lastSpokenText = "";
    this._lastSpokenAt = 0;
    this._speechClearTimer = null;

    // Streaming speech bubble state (like Discord message editing)
    this._currentMessageId = null;
    this._accumulatedText = "";
    this._lastDeltaUpdateAt = 0;
    this._streamingSpeechActive = false;
    this._streamStartTime = 0;

    // Character expression engine for speech bubble content
    this._expressionEngine = new CharacterExpressionEngine();

    // Bind methods
    this.init = this.init.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.updateConnectionUI = this.updateConnectionUI.bind(this);
    this.enableOfflineMode = this.enableOfflineMode.bind(this);
    this.getSpriteSheetUrl = this.getSpriteSheetUrl.bind(this);
    this.getSpriteSheetMetrics = this.getSpriteSheetMetrics.bind(this);
  }

  /**
   * Get i18n string by key. Falls back to English default if not in config.
   * Supports personality presets and array values (random pick for variety).
   */
  _t(key) {
    const fallbacks = {
      thinking: "Hmmm....",
      processing: "Processing",
      success: "Got it!",
      error: "Oops...",
      laughing: "Haha!",
      surprised: "Woah!",
      curious: "Hmm?",
      confused: "Huh?",
      excited: "Wow!",
      contemplative: "Hmmm....",
      waving: "Hey!",
      worried: "Hmm...",
      presenting: "Ta-da!",
      scared: "Yikes!",
      confident: "Ready.",
      tool: "Working…",
      attention: "Waiting for you…",
      playful: "Hehe.",
      wink: ";)",
      sad: "Aww...",
      timeout: "Timeout",
      listenerTimeout: "Listener timeout",
      connectionError: "Connection error",
      runTimeout: "Run timeout",
      networkError: "Network error",
      rejected: "Rejected",
      unknownError: "Unknown error",
      connecting: "Connecting...",
      checkConfig: "Check config",
      reconnecting: "Reconnecting...",
      connected: "Connected",
      disconnected: "Disconnected",
      offline: "Demo Mode",
      configRequired: "Edit config/config.js with your gateway host.",
      configError: "Configuration error: Copy config.example.js to config.js",
      runtimeError: "Runtime error: ",
      loading: "Loading…",
      // StockAgent trading expressions
      tradeOpened: "Trade opened!",
      tradeClosedProfit: "Profit!",
      tradeClosedLoss: "Loss...",
      analyzingMarket: "Analyzing...",
    };
    let val =
      this.config?.personalities?.[this.config?.personality]?.[key] ??
      this.config?.i18n?.[key] ??
      fallbacks[key] ??
      key;
    if (Array.isArray(val) && val.length > 0) {
      val = val[Math.floor(Math.random() * val.length)];
    }
    return typeof val === "string" ? val : String(val);
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      // Load configuration
      await this.loadConfig();

      // Force demo mode via ?demo=1 URL param (for testing/screenshots)
      const params =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : null;
      if (params?.get("demo") === "1") {
        this.isOfflineMode = true;
      }
      // Full emotional range demo: ?emotions=1 cycles through all frames (no connection needed)
      this.emotionsDemo = params?.get("emotions") === "1";
      if (this.emotionsDemo) this.isOfflineMode = true;

      // Force kiosk mode via ?kiosk=1 URL param
      if (params?.get("kiosk") === "1") {
        this.config.display = this.config.display || {};
        this.config.display.kioskMode = true;
        document.documentElement.classList.add("otaclaw-kiosk");
      } else if (this.config.display?.kioskMode) {
        document.documentElement.classList.add("otaclaw-kiosk");
      }

      // Initialize components
      this.otaclaw = new OtaClawEngine(this.config);
      this.wsClient = new WebSocketClient(this.config);

      // Single sprite engine — all organic selection + idle/work loops
      this._timers = new TimerManager();
      this._spriteOverrides = {};
      this._spriteSpeaking = null;
      this._lastEmotionSprite = null;
      this._lastToolSprite = null;
      this._spriteError = false;
      this._gatewayOffline = false;
      this._hearing = false;
      this._idleTick = 0;
      this._spriteHoldTimer = null;
      this._sequenceActive = false;
      this._sequenceToken = 0;
      this._sequenceTimer = null;
      this._sequenceHoldTimer = null;
      this._lastDirectorState = null;
      this._avatarMode = this.config?.avatar?.mode || "active";
      this._directorEnabled = this.config?.avatar?.director !== false;
      this.animator = new AnimationController(this.config, this._timers);
      this.animator.setFrameCallback((col, row, speech, options) => {
        if (options?.type === "individual" && options.url) {
          this._setFrameFromSprite(options.url, speech);
        } else {
          this._setFrameDirect(col, row, speech);
        }
      });
      if (window.__otaclawEarlyCatalog) {
        this._frameCatalog = window.__otaclawEarlyCatalog;
        this.animator.setCatalog(this._frameCatalog);
      }

      // Coherent state->sprite mapping: debounced, priority-aware state changes.
      // Disable with `stateSprites: { enabled: false }` to get the legacy behaviour.
      this._coordinator = isMappingEnabled(this.config)
        ? new StateCoordinator({
            table: getStateTable(this.config),
            apply: (state, opts) => this.otaclaw.setState(state, opts),
          })
        : null;

      // Setup event listeners
      this.setupEventListeners();

      // Preload frame catalog (also pick up early one from module top-level for t=0 organic idle)
      const assetUrl =
        typeof window.otaclawAssetUrl === "function"
          ? (p) => window.otaclawAssetUrl(p)
          : (p) => p;
      if (window.__otaclawEarlyCatalog && !this._frameCatalog) {
        this._frameCatalog = window.__otaclawEarlyCatalog;
        this.animator.setCatalog(this._frameCatalog);
      }
      fetch(assetUrl("data/frame-catalog.json?v=20" + Date.now()))
        .then((r) => r.json())
        .then((catalog) => {
          this._frameCatalog = catalog;
          this.animator?.setCatalog(catalog);
          if (typeof window !== "undefined") window.__otaclawFrameCatalog = catalog;
        })
        .catch(() => {});
      this._loadSpriteFunctions(assetUrl);

      // Vibeconf-style liveness: the rest state breathes through the calm poses
      // instead of freezing on idle[0,1,2]. The agent can pin one via
      // agent.sprite {slot:"idle"}.
      this._idleSpriteTimer = setInterval(() => {
        if (this._spriteHoldTimer) return;
        if ((this.otaclaw?.getState?.() || "idle") !== "idle") return;
        this._idleTick = (this._idleTick || 0) + 1;
        this._refreshDirector({ idle: true });
      }, 9000);

      // Initialize OtaClaw engine
      this.otaclaw.init();

      // Merge calibration API (setFrame, demo) onto engine – calibration loads first
      const cal = window.otaclaw;
      if (cal?.setFrame) this.otaclaw.setFrame = cal.setFrame;
      if (cal?.__rawSetFrame) this.otaclaw.__rawSetFrame = cal.__rawSetFrame;
      if (cal?.setFrameByIndex)
        this.otaclaw.setFrameByIndex = cal.setFrameByIndex;
      if (cal?.startFullRangeDemo)
        this.otaclaw.startFullRangeDemo = cal.startFullRangeDemo;
      if (cal?.stopFullRangeDemo)
        this.otaclaw.stopFullRangeDemo = cal.stopFullRangeDemo;
      if (cal?.enableDemoMode) this.otaclaw.enableDemoMode = cal.enableDemoMode;
      if (cal?.stopDemoCycle) this.otaclaw.stopDemoCycle = cal.stopDemoCycle;
      window.otaclaw = this.otaclaw;
      window.wsClient = this.wsClient;
      // Expose monitor for debug panel and console inspection
      window.otaclawMonitor = monitor;

      // Wire the sprite catalog into the animator so config catalog references resolve.
      this._adoptSpriteCatalog();

      // Wire Easter eggs (Konami / Gray Fox / Panic / Codec)
      this.easterEggs = new EasterEggs(this.otaclaw, null, {
        enabled: this.config?.easterEggs?.enabled !== false,
        debug: this.config?.easterEggs?.debug || this.debugMode,
      });
      this.easterEggs.init();
      this.wsClient.on("easter.konami", () => this.easterEggs?.toggleCodecMode());
      // ?codec=1 opens the codec view after boot (handy for kiosks and QA).
      if (new URLSearchParams(window.location.search).get("codec") === "1") {
        setTimeout(() => this.easterEggs?.toggleCodecMode(), 4000);
      }
      this.wsClient.on("easter.grayfox", () => this.easterEggs?.enableGrayFox());
      this.wsClient.on("easter.panic", () => this.easterEggs?.triggerPanic());
      this.wsClient.on("codecCommand", () => this.easterEggs?.toggleCodecMode());

      // Setup UI interactions
      this.setupUIInteractions();

      // Preload critical images to prevent them from disappearing or flashing
      const sheetUrl = this.getSpriteSheetUrl();
      const basePath = (this.config?.sprites?.basePath || "assets/sprites/").replace(/\/$/, "");

      const individualSprites = [];
      const addIndividual = (prefix, count) => {
        for (let i = 0; i <= count; i++) {
          const idx = String(i).padStart(2, "0");
          individualSprites.push(`${basePath}/otacon_sprite_${prefix}_${idx}.png`);
        }
      };
      addIndividual("boot", 4);
      addIndividual("thumbs", 6);
      addIndividual("laugh", 2);
      addIndividual("shrug", 1);
      addIndividual("frustration", 1);
      addIndividual("coat", 3);
      addIndividual("blink", 2);

      // Every 1:1 frame the director can swap to. Without this, the first use of
      // a pose decodes on the fly and can flash a blank frame mid-transition.
      const spriteCat = window.otaclaw?.getSpriteCatalog?.();
      if (Array.isArray(spriteCat?.sprites)) {
        spriteCat.sprites.forEach((s) => {
          if (s?.file) individualSprites.push(`${basePath}/${s.file}`);
        });
      }

      const preloadUrls = [sheetUrl, ...individualSprites];
      preloadUrls.forEach(url => {
          const img = new Image();
          img.src = typeof window.otaclawAssetUrl === "function" ? window.otaclawAssetUrl(url) : url;
          if (typeof img.decode === "function") img.decode().catch(() => {});
      });

      // Eager preload of frame-catalog (async, non-blocking) so the *first* visible idle/waiting
      // after boot uses _getOrganicFramePool + catalog tags (idle_base, base, context bias)
      // instead of falling back to the small hardcoded seqs. This is the production path for kiosk.
      if (typeof window !== "undefined" && !this._frameCatalog) {
        const assetUrlFn = typeof window.otaclawAssetUrl === "function" ? window.otaclawAssetUrl : (p) => p;
        fetch(assetUrlFn("data/frame-catalog.json?v=20"))
          .then((r) => r.json())
          .then((catalog) => {
            this._frameCatalog = catalog;
            if (typeof window !== "undefined") window.__otaclawFrameCatalog = catalog;
          })
          .catch(() => {});
      }

      if (document.body.classList.contains("otaclaw-widget")) {
        this.hideConnectionOverlay();
        const runWaiting = () => {
          this.startWaitingAnimation(this._t("connecting"));
          this._scheduleSleep();
          this._widgetConnectingTimer = setTimeout(() => {
            if (this.wsClient && !this.wsClient.isConnected) {
              this.startWaitingAnimation(this._t("checkConfig"));
            }
            this._widgetConnectingTimer = null;
          }, 8000);
        };
        if (window.__otaclawBootComplete) {
          runWaiting();
        } else {
          window.__otaclawOnBootComplete = runWaiting;
        }
      } else {
        this.showConnectionOverlay();
      }
      return true;
    } catch (error) {
      monitor.error("init.failed", { error: String(error) });
      console.error("[OtaClaw] Initialization failed:", error);
      this.showConfigError(error);
      return false;
    }
  }

  /**
   * Apply behavior profile overrides (eventMap, stateDurations)
   */
  _applyProfile() {
    const profileName = this.config?.behavior?.profile || "default";
    const profile = this.config?.profiles?.[profileName];
    if (!profile || profileName === "default") return;
    if (profile.eventMap) {
      this.config.eventMap = { ...this.config.eventMap, ...profile.eventMap };
    }
    if (profile.stateDurations) {
      this.config.stateDurations = {
        ...this.config.stateDurations,
        ...profile.stateDurations,
      };
    }
  }

  /**
   * Apply personality preset. _t() reads from config.personalities[personality] when set.
   */
  _applyPersonality() {
    /* Personality speech is resolved in _t() via config.personalities[personality][key] */
  }

  /**
   * Load configuration file
   * Deep-merges inline window.OTACLAW_CONFIG (widget defaults) with config.js.
   * config.js wins on keys it defines; inline values provide the base layer.
   */
  async loadConfig() {
    const inlineConfig =
      typeof window !== "undefined" && window.OTACLAW_CONFIG
        ? { ...window.OTACLAW_CONFIG }
        : {};

    let fileConfig = {};
    try {
      const configModule = await import("./config.js?v=21");
      fileConfig = configModule.OTACLAW_CONFIG || configModule.default || {};
    } catch (error) {
      // If there is no inline fallback, the config.js failure is fatal.
      if (!inlineConfig || Object.keys(inlineConfig).length === 0) {
        monitor.error("config.load.failed", { error: String(error) });
        console.error("[OtaClaw] Failed to load configuration:", error);
        throw new Error(
          this.config?.i18n?.configError ??
            "Configuration error: Copy config.example.js to config.js",
        );
      }
    }

    this.config = this._deepMerge(inlineConfig, fileConfig);

    if (!this.config || Object.keys(this.config).length === 0) {
      throw new Error("Configuration not found");
    }

    normalizeGatewayConfig(this.config);

    // Enable debug mode if configured
    this.debugMode = this.config.behavior?.debug || false;

    // Apply monitor configuration now that real config is available
    monitor.configure(this.config);

    // Apply behavior profile (minimal, expressive, etc.)
    this._applyProfile();
    this._applyPersonality();
  }

  /**
   * Deep merge two plain objects. `override` wins on keys it defines.
   * Arrays are replaced, not concatenated. Null values clear the target key.
   */
  _deepMerge(base, override) {
    if (!override || typeof override !== "object") return base;
    if (!base || typeof base !== "object") return { ...override };

    const result = { ...base };
    for (const key of Object.keys(override)) {
      const val = override[key];
      if (val === null) {
        delete result[key];
      } else if (Array.isArray(val)) {
        result[key] = [...val];
      } else if (typeof val === "object" && typeof result[key] === "object") {
        result[key] = this._deepMerge(result[key], val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  /**
   * Setup event listeners between components
   */
  setupEventListeners() {
    this.wsClient.on("connecting", () => {
      monitor.log("websocket.connecting");
      document.body.classList.add("widget-waiting");
      this.updateConnectionUI("connecting");
      if (
        document.body.classList.contains("otaclaw-widget") &&
        window.__otaclawBootComplete
      ) {
        this.startWaitingAnimation(this._t("connecting"));
        this._scheduleSleep();
      }
    });

    this.wsClient.on("connected", () => {
      monitor.log("websocket.connected");
      this._cancelSleep();
      if (this._widgetConnectingTimer) {
        clearTimeout(this._widgetConnectingTimer);
        this._widgetConnectingTimer = null;
      }
      const doTransition = () => {
        // Don't remove widget-waiting until boot animation is complete
        // The boot sequence in sprite-runtime.js needs widget-waiting to show frames
        const finishTransition = () => {
          document.body.classList.remove("widget-waiting");
          const bootOv = document.getElementById("boot-black-overlay");
          const widgetOv = document.getElementById("widget-sprite-overlay");
          if (bootOv) bootOv.style.display = "none";
          if (widgetOv) widgetOv.style.display = "none";
          const spriteEl = document.getElementById("sprite");
          if (spriteEl) spriteEl.classList.remove("boot-rising");
          this.stopWaitingAnimation();
          this.updateConnectionUI("connected");
          if (document.body.classList.contains("otaclaw-widget")) {
            if (typeof window.showWidgetConnectionMsg === "function")
              window.showWidgetConnectionMsg("");
            this.otaclaw.setState("idle", { speech: "" });
            this._playGreetingIfDue();
            this.startIdleAnimation();
            this.startBlinkOverlay();
            this._scheduleSleep();
          }
        };
        // If boot is still running, wait for it
        if (!window.__otaclawBootComplete) {
          window.__otaclawOnBootComplete = finishTransition;
        } else {
          finishTransition();
        }
        this.hideConnectionOverlay();
        if (this.demoInterval) {
          clearInterval(this.demoInterval);
          this.demoInterval = null;
        }
      };
      if (document.body.classList.contains("widget-asleep")) {
        if (typeof window.runWakeSequence === "function") {
          window.runWakeSequence(doTransition);
        } else {
          doTransition();
        }
        return;
      }
      const bootStart = window.__otaclawBootStartTime || 0;
      const splashMs = Number(
        window.OTACLAW_CONFIG?.sprites?.splashDurationMs || 0,
      );
      const minBootMs =
        6000 + splashMs; /* splash + LIGHT_FADE_MS(1200) + boot-rise(3000) */
      const elapsed = Date.now() - bootStart;
      if (elapsed >= minBootMs) {
        doTransition();
      } else {
        setTimeout(doTransition, minBootMs - elapsed);
      }
    });

    this.wsClient.on("disconnected", (data = {}) => {
      monitor.log("websocket.disconnected", { code: data.code, reason: data.reason });
      this._lastDisconnectAt = Date.now();
      document.body.classList.add("widget-waiting");
      this.updateConnectionUI("disconnected");
      if (document.body.classList.contains("otaclaw-widget")) {
        this.stopIdleAnimation();
        if (this._widgetConnectingTimer) {
          clearTimeout(this._widgetConnectingTimer);
          this._widgetConnectingTimer = null;
        }
        if (window.__otaclawBootComplete)
          this.startWaitingAnimation(this._t("checkConfig"));
        this._scheduleSleep();
        /* Show close reason when on localhost (tunnel) to help debug */
        const host = window.location?.hostname || "";
        if (
          (host === "localhost" || host === "127.0.0.1") &&
          typeof window.showWidgetConnectionMsgBrief === "function" &&
          (data.code !== 1000 || data.reason)
        ) {
          const hint =
            data.reason || `code ${data.code}` || "unknown";
          window.showWidgetConnectionMsgBrief(
            `Closed: ${hint}. Try ?oc_token=TOKEN or stop kiosk on Pi`,
            8000,
          );
        }
      } else if (!this.isOfflineMode) {
        this.showConnectionOverlay();
      }
    });

    this.wsClient.on("reconnecting", () => {
      monitor.log("websocket.reconnecting");
      monitor.recordReconnect();
      this.updateConnectionUI("connecting");
      const activeState = this.otaclaw.getState();
      if (activeState === "thinking" || activeState === "processing") {
        return;
      }
      if (
        document.body.classList.contains("otaclaw-widget") &&
        window.__otaclawBootComplete
      ) {
        this.startWaitingAnimation(this._t("reconnecting"));
        this._scheduleSleep();
      }
    });

    this.wsClient.on("maxReconnectReached", () => {
      monitor.warn("websocket.max_reconnect_reached");
      this.updateConnectionUI("disconnected");
      if (
        document.body.classList.contains("otaclaw-widget") &&
        window.__otaclawBootComplete
      ) {
        this.startWaitingAnimation(this._t("checkConfig"));
        this._scheduleSleep();
      }
    });

    this.wsClient.on("offlineSuggested", () => {
      monitor.warn("websocket.offline_suggested");
      const offlineAfter = Number(
        this.config?.gateway?.offlineAfterReconnects ||
        this.config?.openclaw?.offlineAfterReconnects ||
        0,
      );
      if (offlineAfter > 0 && !this.isOfflineMode) {
        this.enableOfflineMode(true);
        this.updateConnectionUI("offline");
      }
    });

    this.wsClient.on("error", (err) => {
      monitor.error("websocket.error", { error: String(err) });
    });

    this.wsClient.on("stateChange", (data) => {
      this._lastActivityTime = Date.now();
      // agentComplete owns the terminal state (success or a detected mood) and
      // the bubble; don't flash the generic success first.
      if (data.trigger === "agent.message.complete") return;
      if (this._coordinator) {
        // The coordinator owns returns to idle; ignore the client's blind idle timer.
        if (data.trigger === "timeout") return;
        // Coherent mode: tool events collapse into one "tool" state, noisy
        // events are dropped, priority/debounce is handled by the coordinator.
        const resolved = coherentEventState(this.config, data.trigger, data.state);
        if (!resolved) return;
        data.state = resolved;
      } else {
        const eventPriority = this.config?.eventPriority || {};
        const newPriority = data.priority ?? 0;
        const currentPriority =
          this._currentStatePriority ?? eventPriority[data.trigger] ?? 0;
        if (
          newPriority < currentPriority &&
          !["agent.tool.call", "agent.message.delta"].includes(data.trigger)
        ) {
          return;
        }
        this._currentStatePriority = newPriority;
      }

      const opts = { trigger: data.trigger, data: data.data };
      
      // During active LLM/tool work, ignore delta→processing remaps so sprites stay task-coherent.
      if (data.trigger === "agent.message.delta") {
        const st = this.otaclaw.getState();
        if (
          this._isActiveWorkState(st) ||
          (this._activeWorkUntil && Date.now() < this._activeWorkUntil)
        ) {
          return;
        }
        if (st !== "thinking" && st !== "processing" && st !== "error" && st !== "idle") {
          // Do not allow generic "processing" to override heuristic terminal states (laughing, etc.)
          return;
        }
      }

      // Category-aware tool reactions instead of generic surprised for every tool call.
      if (data.trigger === "agent.tool.call") {
        const cat =
          data?.category ||
          data?.data?.category ||
          this._lastContext?.category ||
          "neutral";
        const toolName = data?.data?.tool || data?.data?.name;
        this._setLastContext({ category: cat, tool: toolName });
        this._activeWorkUntil = Date.now() + 120000;
        if (!this._coordinator || this.config?.stateSprites?.toolCategoryReactions === true) {
          data.state = this._categoryToToolReaction(cat);
        }
      }
      if (data.state === "error")
        opts.speech = this._briefErrorReason(data.data ?? data);
      else if (data.state === "thinking") opts.speech = this._t("thinking");
      else if (data.state === "processing") opts.speech = this._t("processing");
      else if (data.state === "success") {
        const explicitBubble = [
          data?.data?.bubble,
          data?.data?.summary,
          data?.bubble,
          data?.summary,
        ].find((v) => typeof v === "string" && v.trim());
        const reply =
          data?.data?.content ??
          data?.data?.message ??
          data?.content ??
          data?.message ??
          "";
        const alert = detectNotification(explicitBubble || reply);
        if (alert) data.state = alert;
        const speech = explicitBubble
          ? this._shortSpeech(explicitBubble)
          : this._shortSpeech(reply) || this._t("success");
        opts.speech = speech;
        this._completionSpeech = speech;
      }
      else if (data.state === "surprised") opts.speech = this._t("surprised");
      else if (data.state === "laughing") opts.speech = this._t("laughing");
      else if (data.state === "curious") opts.speech = this._t("curious");
      else if (data.state === "confused") opts.speech = this._t("confused");
      else if (data.state === "excited") opts.speech = this._t("excited");
      else if (data.state === "waving") opts.speech = this._t("waving");
      else if (data.state === "worried") opts.speech = this._t("worried");
      else if (data.state === "presenting") opts.speech = this._t("presenting");
      else if (data.state === "scared") opts.speech = this._t("scared");
      else if (data.state === "confident") opts.speech = this._t("confident");
      else if (data.state === "wink") opts.speech = this._t("wink");
      else if (data.state === "sad") opts.speech = this._t("sad");
      else if (data.state === "tool" || data.state === "attention") opts.speech = this._t(data.state);
      else if (data.state === "idle") {
        opts.speech = "";
        this._currentStatePriority = 0;
      }
      // A tool detail label beats the canned state phrase, so the pose and the
      // bubble tell the same story (search/files/terminal...).
      if (data.trigger === "agent.tool.call") {
        const toolBubble =
          data?.data?.bubble ??
          data?.bubble ??
          data?.data?.summary ??
          data?.summary;
        if (typeof toolBubble === "string" && toolBubble.trim()) {
          opts.speech = this._shortSpeech(toolBubble);
        }
      }
      const applyState = () => {
        const prevState = this.otaclaw?.getState?.();
        // If the incoming event carries category (from the gateway or another emitter), keep it for sprite bias
        if (data?.category) {
          this._setLastContext({ category: data.category });
        }
        if (this._coordinator) {
          this._requestState(data.state, { ...opts, endsRun: endsRun(data.trigger) });
          return;
        }
        this.otaclaw.setState(data.state, { ...opts, force: data.state === "error" });
        if (data.trigger === "agent.tool.call") {
          const reaction = data.state;
          const dur = Math.min(
            this.config?.stateDurations?.surprised ?? 2500,
            1400,
          );
          setTimeout(() => {
            const st = this.otaclaw.getState();
            const workState = this._resolveWorkState();
            if (st === reaction || this._isActiveWorkState(st)) {
              this.otaclaw.setState(workState, {
                trigger: "tool.work",
                speech: this._t(workState),
              });
            }
          }, dur);
        }
      };
      /* Wake from sleep when activity arrives (user wrote, agent started, etc.) */
      if (
        document.body.classList.contains("otaclaw-widget") &&
        document.body.classList.contains("widget-asleep") &&
        data.state !== "idle"
      ) {
        this._quickWake();
        applyState();
        this.startBlinkOverlay();
        return;
      }
      applyState();
    });

    // Monitor to auto-return to idle if we get stuck in processing/thinking due to dropped connections or Gateway TTLs
    setInterval(() => {
      const state = this.otaclaw?.getState?.();
      if (state !== "idle" && state !== "sleeping") {
         const now = Date.now();
         const lastActivity = Math.max(this._lastActivityTime || 0, this._lastDeltaUpdateAt || 0);
         const timeSinceActivity = now - lastActivity;
         
         // If stuck for 45 seconds without ANY activity (deltas, state changes), force idle
         if (timeSinceActivity > 45000) {
            monitor.warn("activity.timeout.forcing_idle", { timeSinceActivity });
            this.otaclaw.setState("idle", { trigger: "activity.timeout", speech: "", force: true });
            this._lastActivityTime = now;
            this._scheduleSleep();
         }
      }
    }, 5000);

    this.wsClient.on("gatewayError", (data) => {
      const brief = this._briefErrorReason(data);
      this._requestState("error", {
        trigger: "gateway.error",
        data,
        speech: brief,
        force: true
      });
    });

    // Specific OpenClaw events
    this._accumulatedText = "";

    this._extractDiscordTarget = (data) => {
      if (data.channel === "discord" && data.target) return data.target;
      if (data.sessionKey && data.sessionKey.startsWith("agent:discord:")) {
        const parts = data.sessionKey.split(":");
        if (parts.length >= 5) {
          if (parts[3] === "direct") return `user:${parts[4]}`;
          if (parts[3] === "guild") return `channel:${parts[4]}`;
          return `channel:${parts[4]}`;
        }
      }
      return null;
    };

    this.wsClient.on("agentStart", (data) => {
      const target = this._extractDiscordTarget(data);
      if (target) this._lastDiscordTarget = target;

      // Reset streaming state for new message
      this._currentMessageId = data.messageId || data.id || `msg-${Date.now()}`;
      this._accumulatedText = "";
      this._streamingSpeechActive = false;
      this._currentEmotionLock = null;
      this._streamStartTime = Date.now();

      this._expressionEngine.reset();
      this._activeWorkUntil = Date.now() + 120000;

      const opener = this._expressionEngine.getExpression({
        state: "thinking",
        activity: "thinking",
      });
      this._requestState("thinking", {
        trigger: "agent.start",
        data,
        speech: opener,
      });

      // Vibeconf hearing state: the user just spoke, so listen first (phone),
      // then think once the turn settles.
      this._hearing = true;
      this._spriteSpeaking = null;
      this._lastToolSprite = null;
      this._spriteError = false;
      this._directorState = "thinking";
      this._directorSpeech = opener;
      if (this._hearTimer) clearTimeout(this._hearTimer);
      this._hearTimer = setTimeout(() => {
        this._hearTimer = null;
        this._hearing = false;
        this._refreshDirector();
      }, 4000);

      // One calm opener, then silence — face does the rest
      this._updateSpeechBubble(opener, { force: true, holdMs: 4500 });
    });

    this.wsClient.on("agentDelta", (data) => {
      const target = this._extractDiscordTarget(data);
      if (target) this._lastDiscordTarget = target;

      const messageId = data.messageId || data.id || "default";
      if (messageId !== this._currentMessageId) {
        this._currentMessageId = messageId;
        this._accumulatedText = "";
        this._streamStartTime = Date.now();
        this._expressionEngine.reset();
      }

      const text = data.message || data.delta || data.content || "";
      if (text) {
        this._accumulatedText += text;
      }

      const throttleMs = 150;
      const now = Date.now();
      if (
        this._lastDeltaUpdateAt &&
        now - this._lastDeltaUpdateAt < throttleMs
      ) {
        return;
      }
      this._lastDeltaUpdateAt = now;

      const currentState = this.otaclaw.getState();
      const inActiveWork =
        this._isActiveWorkState(currentState) ||
        (this._activeWorkUntil && Date.now() < this._activeWorkUntil);

      // No per-delta bubble updates — that was the notification spam.
      if (inActiveWork) {
        return;
      }

      const lower = this._accumulatedText.toLowerCase();
      const recentText = lower.slice(-RECENT_WINDOW);

      const emotion = detectEmotion(recentText);
      if (emotion) {
        this._currentEmotionLock = emotion;
      }

      const targetEmotion = this._currentEmotionLock || "processing";

      if (targetEmotion !== "processing" && !this._streamingSpeechActive) {
          if (currentState !== targetEmotion) {
              this._requestState(targetEmotion, {
                  trigger: "agent.delta.heuristic",
                  data,
                  speech: this._t(targetEmotion)
              });
              this._updateSpeechBubble(this._t(targetEmotion), { force: true, holdMs: 2500 });
              if (!this._coordinator) {
                if (targetEmotion === "laughing") this.startLaughingAnimation();
                else if (targetEmotion === "surprised") this.startSurprisedAnimation();
              }
          }
      }
    });

    this.wsClient.on("agentComplete", (data) => {
      const lastActivity = this._expressionEngine.detectActivity(this._accumulatedText);
      const completionExpression = this._expressionEngine.getCompletionExpression(lastActivity, true);

      // Prefer the agent's real reply over a canned "Got it!". The gateway
      // (Discord, Hermes, BYOA) puts it in message/content.
      const explicitBubble = [
        data?.bubble,
        data?.summary,
        data?.data?.bubble,
        data?.data?.summary,
      ].find((v) => typeof v === "string" && v.trim());
      const raw =
        data?.message ??
        data?.content ??
        data?.data?.message ??
        data?.data?.content ??
        this._accumulatedText ??
        "";
      const speech = explicitBubble
        ? this._shortSpeech(explicitBubble)
        : this._shortSpeech(raw) || completionExpression;

      // Local, no tokens: explicit laugh/surprise/apology/confusion in the full
      // reply picks the terminal pose; otherwise the normal confirm.
      const fullText = this._cleanThinkingTokens(String(raw))
        .replace(/\s+/g, " ")
        .trim();
      const alert = detectNotification(explicitBubble || raw);
      const mood = alert || detectEmotion(fullText);
      const terminal = alert
        ? alert
        : ["laughing", "surprised", "confused", "sad", "worried"].includes(mood)
          ? mood
          : "success";

      this._completionSpeech = speech;

      this._hearing = false;
      if (this._hearTimer) { clearTimeout(this._hearTimer); this._hearTimer = null; }
      this._clearStreamingState();

      // Vibeconf per-response face: the detected mood (or the agent's own
      // agent.sprite override) is what the room sees while the reply lands.
      const EMO = {
        laughing: "laugh",
        surprised: "shocked_left",
        confused: "shrug",
        sad: "sad",
        worried: "worried",
        curious: "curious",
        error: "sad_intense",
      };
      this._lastEmotionSprite = EMO[mood] || null;
      if (!this._spriteSpeaking) {
        this._spriteSpeaking = this._lastEmotionSprite || "thumbs_up_right";
      }
      this._spriteError = false;
      this._directorSpeech = speech;

      this._requestState(terminal, {
        trigger: "agent.complete",
        data,
        speech,
      });
      this._updateSpeechBubble(speech, { force: true, holdMs: 7000 });
      // The success sequence writes the generic expression on its first frame
      // (via the animator). Re-apply the real reply once that frame has landed.
      if (this._completionBubbleTimer) clearTimeout(this._completionBubbleTimer);
      this._completionBubbleTimer = setTimeout(() => {
        this._completionBubbleTimer = null;
        this._updateSpeechBubble(speech, { force: true, holdMs: 7000 });
      }, 180);
    });

    this.wsClient.on("agentError", (data) => {
      const brief = this._briefErrorReason(data);
      this._clearStreamingState();
      this._spriteError = true;
      this._lastEmotionSprite = "sad_intense";
      this._requestState("error", {
        trigger: "agent.error",
        data,
        speech: brief,
        force: true
      });
      this._updateSpeechBubble(brief, { force: true, holdMs: 3500 });
    });

    this.wsClient.on("agentSprite", (data) => this._handleAgentSprite(data));

    this.wsClient.on("toolCall", (data) => {
      const toolName = data?.tool || data?.data?.tool || data?.name || "tool";
      const category = data?.category || data?.data?.category || "neutral";
      const label = data?.bubble || data?.summary || data?.data?.bubble || data?.data?.summary;
      // Category drives the pose; an optional short label gives the detail
      // without per-tool spam.
      this._setLastContext({ category, tool: toolName });
      this._activeWorkUntil = Date.now() + 120000;
      const toolPose = TOOL_SPRITE[toolName];
      if (toolPose) {
        this._lastToolSprite = toolPose;
        this._directorSpeech = label ? this._shortSpeech(label) : "";
      }
      if (label) {
        const now = Date.now();
        const changed = category !== this._lastToolBubbleCategory;
        if (changed || !this._lastToolBubbleAt || now - this._lastToolBubbleAt > 2500) {
          this._lastToolBubbleAt = now;
          this._lastToolBubbleCategory = category;
          this._updateSpeechBubble(this._shortSpeech(label), { force: true, holdMs: 2500 });
          // The state sequence writes its canned phrase on the first frame;
          // re-apply the tool label right after it.
          if (this._toolBubbleTimer) clearTimeout(this._toolBubbleTimer);
          this._toolBubbleTimer = setTimeout(() => {
            this._toolBubbleTimer = null;
            this._updateSpeechBubble(this._shortSpeech(label), { force: true, holdMs: 2500 });
          }, 180);
        }
      }
    });

    this.wsClient.on("gatewayIdle", () => {
      if (this.config?.sprites?.eventReactionCoverage === false) return;
      this._gatewayOffline = true;
      this._requestState("idle", { trigger: "gateway.idle", speech: "" });
      this._updateSpeechBubble("", { force: true });
    });

    this.wsClient.on("gateway.ready", () => {
      if (this.config?.sprites?.eventReactionCoverage === false) return;
      this._gatewayOffline = false;
      this._refreshDirector();
      if (!this._directorEnabled) this._tryPlayStateSequence("greeting", this._t("greeting") || "Hello!");
    });

    this.wsClient.on("session.start", () => {
      if (this.config?.sprites?.eventReactionCoverage === false) return;
      if (this._coordinator) return; // coherent mode: session.start does not pose the agent
      this.otaclaw.setState("curious", { trigger: "session.start", speech: "" });
      this.startCuriousAnimation?.();
    });

    this.wsClient.on("channel.connected", () => {
      if (this.config?.sprites?.eventReactionCoverage === false) return;
      // Wave frame 7,2 as a quick social acknowledgment
      this._setFrameDirect(7, 2, this._t("greeting") || "Hi!");
    });

    const stockagentBubbleMs = Math.max(
      10000,
      Math.min(20000, Number(this.config?.behavior?.stockagentBubbleMs) || 15000),
    );

    const showStockagentBubble = (state, speech, trigger) => {
      clearTimeout(this._stockagentBubbleTimer);
      this.otaclaw.setState(state, { trigger, speech });
      clearTimeout(this.otaclaw.stateTimer);
      // Cap trade bubbles — long holds felt like constant alerts
      const ms = Math.min(stockagentBubbleMs, 8000);
      this._updateSpeechBubble(speech, { force: true, holdMs: ms });
      // The state sequence may land its own frame line; keep the alert text.
      const speechToken = (this._stockagentSpeechToken || 0) + 1;
      this._stockagentSpeechToken = speechToken;
      for (const delay of [120, 650, 1200]) {
        setTimeout(() => {
          if (this._stockagentSpeechToken !== speechToken) return;
          this._updateSpeechBubble(speech, { force: true, holdMs: ms });
        }, delay);
      }
      this._stockagentBubbleTimer = setTimeout(() => {
        this.otaclaw.setState("idle", { speech: "" });
        this._updateSpeechBubble("", { force: true });
      }, ms);
    };

    // StockAgent trade events — bubbles stay visible long enough to read (10–20s)
    this.wsClient.on("stockagent.trade.opened", (data) => {
      this._setLastContext({ category: 'risky', kind: 'trade', symbol: data?.symbol });
      const speech = data?.speech || data?.data?.speech || "Trade opened!";
      showStockagentBubble("excited", speech, "stockagent.trade");
    });

    this.wsClient.on("stockagent.trade.closed", (data) => {
      const pnl = data?.pnl ?? data?.data?.pnl ?? 0;
      const state = pnl >= 0 ? "success" : "worried";
      const speech = data?.speech || data?.data?.speech || (pnl >= 0 ? "Profit!" : "Loss...");
      this._setLastContext({ category: pnl >= 0 ? 'creative' : 'risky', kind: 'trade-close', pnl });
      showStockagentBubble(state, speech, "stockagent.close");
    });

    this.wsClient.on("stockagent.analyzing", (data) => {
      const symbol = data?.symbol || data?.data?.symbol || 'UNKNOWN';
      const speech = data?.speech || data?.data?.speech || `Checking ${symbol}...`;
      this._setLastContext({ category: 'analytical', kind: 'signal', symbol });
      showStockagentBubble("curious", speech, "stockagent.analysis");
    });

    // StockAgent alert events — critical/warning hold longer than the 8s cap
    // so the operator has time to read them. Each handler overrides the timer
    // that showStockagentBubble sets (which caps at 8s) with a longer hold.
    this.wsClient.on("stockagent.alert.critical", (data) => {
      const speech = data?.speech || data?.data?.speech || data?.message || data?.data?.message || "Critical alert!";
      this._setLastContext({ category: 'risky', kind: 'alert', level: 'critical' });
      showStockagentBubble("surprised", speech, "stockagent.alert.critical");
      clearTimeout(this._stockagentBubbleTimer);
      this._stockagentBubbleTimer = setTimeout(() => {
        this.otaclaw.setState("idle", { trigger: "alert.timeout" });
        this._updateSpeechBubble("", { force: true });
      }, 20000);
    });

    this.wsClient.on("stockagent.alert.warning", (data) => {
      const speech = data?.speech || data?.data?.speech || data?.message || data?.data?.message || "Warning!";
      this._setLastContext({ category: 'risky', kind: 'alert', level: 'warning' });
      showStockagentBubble("worried", speech, "stockagent.alert.warning");
      clearTimeout(this._stockagentBubbleTimer);
      this._stockagentBubbleTimer = setTimeout(() => {
        this.otaclaw.setState("idle", { trigger: "alert.timeout" });
        this._updateSpeechBubble("", { force: true });
      }, 15000);
    });

    this.wsClient.on("stockagent.alert.info", (data) => {
      const speech = data?.speech || data?.data?.speech || data?.message || data?.data?.message || "Info";
      this._setLastContext({ category: 'analytical', kind: 'alert', level: 'info' });
      showStockagentBubble("curious", speech, "stockagent.alert.info");
      clearTimeout(this._stockagentBubbleTimer);
      this._stockagentBubbleTimer = setTimeout(() => {
        this.otaclaw.setState("idle", { trigger: "alert.timeout" });
        this._updateSpeechBubble("", { force: true });
      }, 10000);
    });

    // Direct frame (agent semantic selection). Supports { col, row }, { tag }, { speech }.
    this.wsClient.on("otaclaw.frame", (data) => {
      const payload = data.data ?? data;
      let col = data.col ?? payload?.col;
      let row = data.row ?? payload?.row;
      const tag = data.tag ?? payload?.tag;
      const speech = data.speech ?? payload?.speech;

      if (typeof tag === "string" && (col == null || row == null)) {
        const seqMap = this.config?.sprites?.tagToSequences;
        const seq = seqMap?.[tag.toLowerCase()];
        if (Array.isArray(seq) && seq.length) {
          this._playTagSequence(tag, seq, speech ?? "");
          return;
        }
        const map = this.config?.sprites?.tagToFrames;
        const frames = map?.[tag.toLowerCase()];
        if (Array.isArray(frames) && frames.length) {
          const [c, r] = frames[Math.floor(Math.random() * frames.length)];
          col = c;
          row = r;
        }
      }
      if (
        typeof col === "number" &&
        typeof row === "number" &&
        window.otaclaw?.setFrame
      ) {
        window.otaclaw.setFrame(col, row, { speech: speech ?? "" });
      }
    });

    this.otaclaw.on("stateChange", (data) => {
      this._lastActivityTime = Date.now();
      // Something other than the coordinator changed the state (watchdog, tap...): resync.
      if (this._coordinator && this._coordinator.current !== data.state) {
        this._coordinator.reset(data.state);
      }

      /* Fix 2: Wake from sleep on ANY state change, not just eventMap-resolved wsClient events.
       * Unmapped events (e.g. stockagent.* before eventMap sync, or state changes from non-WS
       * sources) bypass the wsClient.on("stateChange") wake check at L608, leaving the widget
       * asleep while the Otaclaw state cycles underneath the overlay. Synchronously clear the
       * sleep overlay here so the new state's sprite is visible immediately. The wsClient path
       * still runs the full boot animation; this is a quick-wake fallback for state changes
       * that don't go through it. runWakeSequence removes `widget-asleep` synchronously, so
       * when the wsClient path already woke us, this check is a no-op (no double-wake, no flicker). */
      if (
        document.body.classList.contains("otaclaw-widget") &&
        document.body.classList.contains("widget-asleep") &&
        data.state !== "idle" &&
        data.state !== "sleeping"
      ) {
        this._quickWake();
      }

      this.updateStateBadge(data.state);
      if (this._directorEnabled) {
        // One owner: the director draws every frame. The old state table /
        // animator / tag sequences are input-only now (state + speech).
        this._directorState = data.state;
        if (data.speech !== undefined) this._directorSpeech = data.speech;
        this._refreshDirector({ speech: data.speech ?? "" });
        return;
      }
      if (document.body.classList.contains("otaclaw-widget")) {
        if (data.state === "idle") {
          this.stopThinkingAnimation();
          this.stopSuccessAnimation();
          this.stopErrorAnimation();
          this.stopLaughingAnimation();
          this.stopSurprisedAnimation();
          this.startIdleAnimation();
          this._scheduleSleep();
        } else {
          this._cancelSleep();
          const workAnimStates = ["thinking", "processing", "tool", "curious", "excited", "worried"];
          if (workAnimStates.includes(data.state)) {
            this.stopIdleAnimation();
            this.stopSuccessAnimation();
            this.stopErrorAnimation();
            this.stopLaughingAnimation();
            this.stopSurprisedAnimation();
            if (data.state === "processing") {
              this.startProcessingAnimation();
            } else {
              this.startThinkingAnimation();
            }
          } else if (data.state === "success") {
            this.stopIdleAnimation();
            this.stopThinkingAnimation();
            this.startSuccessAnimation();
          } else if (data.state === "error") {
            this.stopIdleAnimation();
            this.stopThinkingAnimation();
            this.startErrorAnimation();
          } else if (data.state === "laughing") {
            this.stopIdleAnimation();
            this.stopThinkingAnimation();
            this.startLaughingAnimation();
          } else if (data.state === "surprised") {
            this.stopIdleAnimation();
            this.stopThinkingAnimation();
            this.startSurprisedAnimation();
          } else if (
            data.state === "curious" ||
            data.state === "confused" ||
            data.state === "excited" ||
            data.state === "worried" ||
            data.state === "sad" ||
            data.state === "scared" ||
            data.state === "attention" ||
            data.state === "presenting"
          ) {
            this.stopIdleAnimation();
            this.stopThinkingAnimation();
            this.stopSuccessAnimation();
            this.stopErrorAnimation();
            this.stopLaughingAnimation();
            this.stopSurprisedAnimation();
            this._runSheetSequence(data.state, data.speech || "", "_tagSeqHandle");
          } else {
            this.stopIdleAnimation();
            this.stopThinkingAnimation();
            this.stopSuccessAnimation();
            this.stopErrorAnimation();
            this.stopLaughingAnimation();
            this.stopSurprisedAnimation();
            
            if (data.state !== "processing") {
              this._setFrameFromTag(data.state);
            }
          }
        }
      }
    });

    this.otaclaw.on("tap", () => {
      // Tap when connected: handled by otaclaw (thinking state). When disconnected: no demo cycling.
    });
    this.otaclaw.on("tickle", (data = {}) => {
      this.stopIdleAnimation();
      this.stopThinkingAnimation();
      this.otaclaw.setState("laughing", { speech: this._t("laughing") });
      if (this.config?.behavior?.sounds && typeof this.otaclaw?.playStateSound === "function") {
        this.otaclaw.playStateSound("laughing");
      }
      this.startLaughingAnimation();
      // Always send client.interaction so gateway can broadcast to other OtaClaw clients (sync tickle).
      if (this.wsClient?.isConnected) {
        this.wsClient.send({
          type: "client.interaction",
          action: "tickle",
          position: { x: data.x ?? 0, y: data.y ?? 0 },
          timestamp: Date.now(),
        });
      }
              // Send tickle reaction to the configured chat channel (Discord, Telegram, etc.)
              const tickleTarget =
                this.config?.gateway?.tickleDiscordChannel ||
                this.config?.openclaw?.tickleDiscordChannel ||
                this._lastDiscordTarget;
              if (this.wsClient?.isConnected && typeof this.wsClient.sendRequest === "function" && tickleTarget) {
                // Same in-character line the bubble uses (config personality).
                const tickleMsg = this._t("laughing") || "Haha!";
                this.wsClient.sendRequest("send", {
                  channel: "discord",
                  to: tickleTarget,
                  message: tickleMsg,
                  idempotencyKey: `tickle-${Date.now()}`
                });
              }
      const buzzerUrl = this.config?.display?.buzzerTickleUrl;
      if (buzzerUrl) {
        fetch(buzzerUrl, { method: "GET" }).catch(() => {});
      }
    });
    this.otaclaw.on("doubleTap", () => {});

    /* Sync tickle and wake from other clients (e.g. Pi kiosk ↔ Mac tab) – when gateway broadcasts client.interaction */
    this.wsClient.on("clientInteraction", (data) => {
      const action = data?.action ?? data?.data?.action;
      if (action === "tickle") {
        this.stopIdleAnimation();
        this.stopThinkingAnimation();
        this.otaclaw.setState("laughing", { speech: this._t("laughing") });
        if (this.config?.behavior?.sounds && typeof this.otaclaw?.playStateSound === "function") {
          this.otaclaw.playStateSound("laughing");
        }
        this.startLaughingAnimation();
        return;
      }
      if (action === "wake" && document.body.classList.contains("widget-asleep")) {
        const finishWake = () => {
          document.body.classList.remove("widget-waiting");
          document.body.classList.remove("widget-asleep");
          const bootOv = document.getElementById("boot-black-overlay");
          const widgetOv = document.getElementById("widget-sprite-overlay");
          if (bootOv) bootOv.style.display = "none";
          if (widgetOv) widgetOv.style.display = "none";
          this.stopWaitingAnimation();
          this.stopAllAnimations();
          this.updateConnectionUI(
            this.wsClient?.isConnected ? "connected" : "disconnected",
          );
          if (document.body.classList.contains("otaclaw-widget")) {
            if (typeof window.showWidgetConnectionMsg === "function")
              window.showWidgetConnectionMsg("");
            this.otaclaw.setState("idle", { speech: "", force: true });
            this.startIdleAnimation();
            this._scheduleSleep();
          }
        };
        if (typeof window.runWakeSequence === "function") {
          window.runWakeSequence(finishWake);
        } else {
          document.body.classList.remove("widget-asleep");
          finishWake();
        }
      }
    });
  }

  /**
   * Setup UI interactions
   */
  setupUIInteractions() {
    // Listen for overlay effects from AnimationController (blush, etc.)
    // Render them by swapping the frame through the same path as the base pose
    // so overlay sprites never render at a different size/position than the character.
    window.addEventListener("otaclaw-overlay", (e) => {
      const detail = e?.detail || {};
      if (detail.type === "show" && detail.url) {
        this._applyOverlayFrame(detail.url);
      } else if (detail.type === "hide") {
        this._restoreOverlayFrame();
      }
    });

    // Retry connection button
    const retryBtn = document.getElementById("retry-connection");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        this.wsClient.reconnect();
      });
    }

    // Debug panel Reconnect button
    const debugReconnectBtn = document.getElementById("debug-reconnect-btn");
    if (debugReconnectBtn) {
      debugReconnectBtn.addEventListener("click", () => {
        this.wsClient.reconnect();
      });
    }

    // Close debug panel button
    const closeDebug = document.getElementById("close-debug");
    if (closeDebug) {
      closeDebug.addEventListener("click", () => {
        const debugPanel = document.getElementById("debug-panel");
        if (debugPanel) {
          debugPanel.classList.add("hidden");
        }
      });
    }

    // Test state buttons in debug panel
    const testButtons = document.querySelectorAll(".test-btn");
    testButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const state = btn.dataset.state;
        if (state) {
          // Stop demo mode when manually testing
          if (this.demoInterval) {
            clearInterval(this.demoInterval);
            this.demoInterval = null;
          }

          this.otaclaw.setState(state, { trigger: "debug.manual" });
        }
      });
    });

    // Wake from sleep on touch/click (capture phase, before otaclaw)
    this._wakeIfAsleepHandler = (e) => {
      if (!document.body.classList.contains("widget-asleep")) return;
      e.preventDefault();
      e.stopPropagation();
      /* Broadcast wake so other clients (kiosk/tab) sync – same mechanism as tickle */
      if (this.wsClient?.isConnected) {
        this.wsClient.send({
          type: "client.interaction",
          action: "wake",
          timestamp: Date.now(),
        });
      } else if (this.wsClient && !this.wsClient.isConnected) {
        this.wsClient.reconnect();
      }
      const finishWake = () => {
        // CRITICAL: Remove both waiting and asleep classes
        document.body.classList.remove("widget-waiting");
        document.body.classList.remove("widget-asleep");
        const bootOv = document.getElementById("boot-black-overlay");
        const widgetOv = document.getElementById("widget-sprite-overlay");
        if (bootOv) bootOv.style.display = "none";
        if (widgetOv) widgetOv.style.display = "none";
        this.stopWaitingAnimation();
        this.stopAllAnimations(); // Clear any stuck animations
        this.updateConnectionUI(
          this.wsClient?.isConnected ? "connected" : "disconnected",
        );
        if (document.body.classList.contains("otaclaw-widget")) {
          if (typeof window.showWidgetConnectionMsg === "function")
            window.showWidgetConnectionMsg("");
          // Force fresh idle state and animation
          this.otaclaw.setState("idle", { speech: "", force: true });
          this.startIdleAnimation();
          this._scheduleSleep();
        }
      };
      const doTransition = () => {
        // Wait for boot to complete before removing widget-waiting
        if (!window.__otaclawBootComplete) {
          window.__otaclawOnBootComplete = finishWake;
        } else {
          finishWake();
        }
      };
      if (typeof window.runWakeSequence === "function") {
        window.runWakeSequence(doTransition);
      } else {
        document.body.classList.remove("widget-asleep");
        finishWake();
      }
    };
    document.addEventListener("touchstart", this._wakeIfAsleepHandler, {
      capture: true,
    });
    document.addEventListener("click", this._wakeIfAsleepHandler, {
      capture: true,
    });
    document.addEventListener(
      "otaclaw-wake-request",
      this._wakeIfAsleepHandler,
    );

    // Prevent context menu on right click (for kiosk mode)
    if (this.config.display?.fullscreen || this.config.display?.kioskMode) {
      document.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });
    }
    if (this.config.display?.kioskMode) {
      document.body.style.cursor = "none";
    }

    // Handle visibility change (pause/resume)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        monitor.debug("tab.hidden");
        this.stopIdleAnimation();
      } else {
        monitor.debug("tab.visible");
        if (!this.isOfflineMode && this.wsClient) {
          if (!this.wsClient.isConnected) {
            this.wsClient.reconnect();
          } else {
            this.wsClient.reconnectIfStale(30000);
            this.wsClient.send({ type: "client.refresh" });
          }
          if (this.wsClient.isConnected && this.otaclaw?.getState?.() === "idle")
            this.startIdleAnimation();
        }
      }
    });

    // Reconnect immediately when network comes back (after offline)
    window.addEventListener("online", () => {
      if (!this.isOfflineMode && this.wsClient && !this.wsClient.isConnected) {
        this.wsClient.reconnect();
      } else if (this.wsClient) {
        this.wsClient.reconnectIfStale(120000);
      }
    });
  }

  /**
   * Update connection status UI
   */
  updateConnectionUI(status) {
    const statusIndicator = document.getElementById("connection-status");
    const wsStatus = document.getElementById("ws-status");

    if (statusIndicator) {
      statusIndicator.className = `status-indicator ${status}`;
      const text = statusIndicator.querySelector(".status-text");

      if (text) {
        const statusTexts = {
          connected: this._t("connected"),
          disconnected: this._t("disconnected"),
          connecting: this._t("connecting"),
          offline: this._t("offline"),
        };
        text.textContent = statusTexts[status] || status;
      }
    }

    if (wsStatus) {
      wsStatus.textContent = status;
    }
  }

  /**
   * Update state badge in UI
   */
  updateStateBadge(state) {
    const stateBadge = document.getElementById("current-state");
    if (stateBadge) {
      stateBadge.textContent = state;
      stateBadge.setAttribute("data-state", state);
    }
  }

  /**
   * Enable/disable offline mode explicitly.
   * Preserves last known state (gentle idle) when switching to demo.
   */
  enableOfflineMode(enabled = true) {
    this.isOfflineMode = !!enabled;
    if (this.isOfflineMode) {
      this.stopWaitingAnimation();
      this.hideConnectionOverlay();
      this.updateConnectionUI("offline");
      if (document.body.classList.contains("otaclaw-widget")) {
        this.otaclaw?.setState("idle", { speech: "" });
        this.startIdleAnimation();
      }
      return;
    }
    this.updateConnectionUI(
      this.wsClient?.isConnected ? "connected" : "disconnected",
    );
  }

  /**
   * Show connection overlay
   */
  showConnectionOverlay() {
    const overlay = document.getElementById("connection-overlay");
    if (overlay && !this.isOfflineMode) {
      overlay.classList.remove("hidden");
    }
  }

  /**
   * Hide connection overlay
   */
  hideConnectionOverlay() {
    const overlay = document.getElementById("connection-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
    }
  }

  getSpriteSheetUrl() {
    const sprites = this.config?.sprites || {};
    const basePath = sprites.basePath || "assets/sprites/";
    const sheetFile = sprites.sheetFile || "otaclock-original";
    const format = sprites.format || "png";
    return `${basePath.replace(/\/$/, "")}/${sheetFile}.${format}`;
  }

  getSpriteSheetMetrics() {
    const sprites = this.config?.sprites || {};
    return {
      sheetW: Number(sprites.sheetWidth || 567),
      sheetH: Number(sprites.sheetHeight || 278),
      frameW: Number(sprites.cellWidth || 47),
      frameH: Number(sprites.cellHeight || 70),
    };
  }

  /** Set frame from emotion tag (curious, confused, excited, etc.) */
  _setFrameFromTag(tag) {
    const map = this.config?.sprites?.tagToFrames;
    const frames = map?.[tag?.toLowerCase?.()];
    if (Array.isArray(frames) && frames.length) {
      const [col, row] = frames[Math.floor(Math.random() * frames.length)];
      const speech = this._t(tag) || "";
      if (window.otaclaw?.setFrame) {
        window.otaclaw.setFrame(col, row, { speech });
      } else {
        this._setFrameDirect(col, row, speech);
      }
    }
  }

  /**
   * Play a [col,row] sequence from tagToSequences. One-shot, then return to idle.
   * @param {string} tag - emotion tag (e.g. laughing, success)
   * @param {[number,number][]} seq - [[col,row], ...]
   * @param {string} speech - speech bubble text
   */
  _playTagSequence(tag, seq, speech = "") {
    if (!document.body.classList.contains("otaclaw-widget")) return;
    this.stopIdleAnimation();
    this.stopThinkingAnimation();
    this.stopSuccessAnimation();
    this.stopErrorAnimation();
    this.stopLaughingAnimation();
    this.stopSurprisedAnimation();
    if (this._tagSeqHandle) clearTimeout(this._tagSeqHandle);
    this._tagSeqHandle = null;
    const frameMs = Number(this.config?.sprites?.tagSequenceFrameMs) || 350;
    let idx = 0;
    const schedule = () => {
      if (!document.body.classList.contains("otaclaw-widget")) return;
      const [c, r] = seq[idx];
      const cal = window.otaclaw;
      if (cal?.setFrame) {
        cal.setFrame(c, r, { speech: speech });
      } else {
        this._setFrameDirect(c, r, speech);
      }
      idx += 1;
      if (idx < seq.length) {
        this._tagSeqHandle = setTimeout(schedule, frameMs);
      } else {
        this._tagSeqHandle = null;
        if (speech) {
          setTimeout(() => {
            this.otaclaw.setState("idle", { speech: "" });
            // Do not call startIdleAnimation here as it will loop back infinitely or duplicate loops
          }, 4000);
        } else {
          this.otaclaw.setState("idle", { speech: "" });
        }
      }
    };
    schedule();
  }

  /**
   * Get frame delay (ms) for state animation. Uses frameTiming and holdFrames.
   * @param {string} state - thinking, processing, success, error, surprised, laughing
   * @param {number} idx - current frame index in sequence
   * @param {number} defaultMs - fallback when no config
   */
  _getFrameMs(state, idx, defaultMs = 400) {
    const ft = this.config?.sprites?.frameTiming?.[state];
    const hold = this.config?.sprites?.holdFrames?.[state];
    if (hold && hold.index === idx) return Number(hold.ms) || defaultMs;
    if (!ft?.frameMs) return defaultMs;
    const arr = ft.frameMs;
    if (Array.isArray(arr) && arr.length) {
      const v = arr[idx % arr.length];
      return typeof v === "number" ? v : (arr[0] ?? defaultMs);
    }
    return typeof arr === "number" ? arr : defaultMs;
  }

  /** Set frame from individual sprite file (idle mini-sequence). */
  _setFrameFromSprite(filename, speech = "", { isOverlay = false } = {}) {
    if (
      document.body.classList.contains("otaclaw-widget") &&
      !window.__otaclawBootComplete
    )
      return;
    const sprite = document.getElementById("sprite");
    const frameEl = sprite?.querySelector(".otacon-frame");
    if (!sprite || !frameEl) return;
    const basePath = (
      this.config?.sprites?.basePath || "assets/sprites/"
    ).replace(/\/$/, "");
    const rawUrl = `${basePath}/${filename}`;
    const url =
      typeof window.otaclawAssetUrl === "function"
        ? window.otaclawAssetUrl(rawUrl)
        : rawUrl;
    /* Same 47x69 box and integer scale as the sheet path: the 29x64 art is
       centered inside it, so frames never change geometry. */
    frameEl.style.setProperty(
      "background-image",
      `url('${url}')`,
      "important",
    );
    frameEl.style.setProperty("background-size", "auto", "important");
    frameEl.style.setProperty("background-position", "center", "important");
    frameEl.style.setProperty("background-repeat", "no-repeat", "important");
    frameEl.style.setProperty("width", "48px", "important");
    frameEl.style.setProperty("height", "70px", "important");
    frameEl.dataset.render = "individual";
    const scale =
      typeof window.otaclawFrameScale === "function"
        ? window.otaclawFrameScale()
        : Math.min(4, Math.max(1, Math.floor((window.innerHeight || 320) * 0.66 / 70)));
    document.documentElement.style.setProperty("--otacon-scale", String(scale));
    frameEl.style.setProperty("--otacon-scale", String(scale));
    const isIdle = this.otaclaw?.getState?.() === "idle";
    Array.from(sprite.classList)
      .filter((c) => c.startsWith("state-"))
      .forEach((c) => sprite.classList.remove(c));
    sprite.classList.add("state-frame");
    if (isIdle) sprite.classList.add("state-idle");
    sprite.dataset.frame = filename;
    this._lastFrame = { type: "sprite", file: filename, speech, renderMode: "individual" };
    if (!isOverlay) this._frameGeneration++;
    if (speech !== undefined && !(speech === "" && this._speechLocked())) {
      const st = document.getElementById("speech-text");
      const sb = document.getElementById("speech-bubble");
      if (st) st.textContent = speech || "";
      if (sb) sb.classList.toggle("has-text", !!speech);
    }
  }

  /**
   * Direct frame update. Prefer calibration setFrame (uses individual sprites from catalog).
   * Pass `speech === undefined` to change pose without touching the bubble.
   */
  _setFrameDirect(col, row, speech, { isOverlay = false } = {}) {
    if (
      document.body.classList.contains("otaclaw-widget") &&
      !window.__otaclawBootComplete
    )
      return;
    // A state frame carrying "" must not wipe the reply bubble while it is held.
    const effectiveSpeech =
      speech === "" && this._speechLocked() ? undefined : speech;
    // Clear individual-sprite viewport sizing/scale so sheet-crop CSS variables win.
    const spriteEl = document.getElementById("sprite");
    const frameEl = spriteEl?.querySelector(".otacon-frame");
    if (frameEl) {
      frameEl.style.width = "";
      frameEl.style.height = "";
      frameEl.style.setProperty("--otacon-scale", "");
    }
    const cal = window.otaclaw;
    if (cal?.setFrame) {
      const opts = effectiveSpeech === undefined ? {} : { speech: effectiveSpeech || "" };
      cal.setFrame(col, row, opts);
      this._lastFrame = { type: "direct", col, row, speech, renderMode: "sheet" };
      if (!isOverlay) this._frameGeneration++;
      return;
    }
    const root = document.documentElement;
    if (!spriteEl || !frameEl) return;
    const {
      frameW: fw,
      frameH: fh,
      sheetW,
      sheetH,
    } = this.getSpriteSheetMetrics();
    const targetHeight = Number(
      this.config?.sprites?.displayTargetHeight || 320,
    );
    // Integer scale keeps pixel art crisp; views fit the viewport.
    const scale =
      typeof window.otaclawFrameScale === "function"
        ? window.otaclawFrameScale()
        : Math.min(4, Math.max(1, Math.floor(targetHeight / 70)));
    root.style.setProperty("--otacon-frame-x", String(-col * fw) + "px");
    root.style.setProperty("--otacon-frame-y", String(-row * fh) + "px");
    root.style.setProperty("--otacon-frame-w", "48px");
    root.style.setProperty("--otacon-frame-h", String(fh) + "px");
    root.style.setProperty("--otacon-sheet-w", String(sheetW) + "px");
    root.style.setProperty("--otacon-sheet-h", String(sheetH) + "px");
    root.style.setProperty("--otacon-scale", String(scale));
    frameEl.style.setProperty("--otacon-scale", String(scale));
    const sheetRaw = this.getSpriteSheetUrl();
    const sheetUrl =
      typeof window.otaclawAssetUrl === "function"
        ? window.otaclawAssetUrl(sheetRaw)
        : sheetRaw;
    root.style.setProperty("--otacon-sheet-url", `url('${sheetUrl}')`);
    frameEl.style.setProperty("background-image", `url('${sheetUrl}')`, "important");
    frameEl.style.setProperty("background-size", `${sheetW}px ${sheetH}px`, "important");
    frameEl.style.setProperty(
      "background-position",
      `${-col * fw}px ${-row * fh}px`,
      "important",
    );
    frameEl.dataset.render = "sheet";
    Array.from(spriteEl.classList)
      .filter((c) => c.startsWith("state-"))
      .forEach((c) => spriteEl.classList.remove(c));
    spriteEl.classList.add("state-frame");
    spriteEl.dataset.frame = `${col},${row}`;
    this._lastFrame = { type: "direct", col, row, speech, renderMode: "sheet" };
    if (!isOverlay) this._frameGeneration++;
    if (effectiveSpeech !== undefined) {
      const st = document.getElementById("speech-text");
      const sb = document.getElementById("speech-bubble");
      if (st) st.textContent = effectiveSpeech || "";
      if (sb) sb.classList.toggle("has-text", !!effectiveSpeech);
    }
  }

  /**
   * Clean LLM thinking tokens and artifacts from text for speech bubble display.
   * Filters: <think>...</think>, reasoning markers, repetitive dots, etc.
   * @param {string} text - Raw LLM output
   * @returns {string} Cleaned text suitable for display
   */
  _cleanThinkingTokens(text) {
    if (!text || typeof text !== "string") return "";

    let cleaned = text;

    // Remove <think>...</think> blocks (Qwen3, Claude thinking mode)
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");
    cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
    
    // Remove [thinking]...[/thinking] markers
    cleaned = cleaned.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, "");
    cleaned = cleaned.replace(/\[think\][\s\S]*?\[\/think\]/gi, "");
    
    // Remove incomplete thinking tags at start (streaming mid-block)
    cleaned = cleaned.replace(/^[\s\S]*?<\/think>/gi, "");
    cleaned = cleaned.replace(/^[\s\S]*?<\/thinking>/gi, "");
    cleaned = cleaned.replace(/<think>[\s\S]*$/gi, "");
    cleaned = cleaned.replace(/<thinking>[\s\S]*$/gi, "");
    
    // Remove repetitive dots (4+ dots in a row) - common LLM thinking artifact
    cleaned = cleaned.replace(/\.{4,}/g, "...");
    
    // Remove lines that are only dots or whitespace
    cleaned = cleaned.replace(/^[\s.]+$/gm, "");
    
    // Remove markdown code fence thinking (```thinking ... ```)
    cleaned = cleaned.replace(/```thinking[\s\S]*?```/gi, "");
    cleaned = cleaned.replace(/```think[\s\S]*?```/gi, "");
    
    // Remove reasoning step markers like "Step 1:", "Thought:", etc.
    cleaned = cleaned.replace(/^(Step \d+:|Thought:|Reasoning:|Analysis:)\s*/gim, "");
    
    // Collapse multiple newlines and clean whitespace
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Speech bubble policy (anti-notification spam):
   * - Idle: empty
   * - Enter work: one short phrase, then silence (face carries the state)
   * - Streaming deltas: do NOT rewrite the bubble every chunk
   * - Terminal (success/error/laugh): brief hold then clear
   */
  /**
   * Bubble voice: one short line. The full reply belongs to the chat; the
   * bubble must never dump markdown/code/URLs or the user's message.
   */
  /** Compact HUD holds ~4-5 lines at 12px; the kiosk can afford more. */
  _speechBudget() {
    return document.body.classList.contains("otaclaw-compact") ? 84 : 120;
  }

  _shortSpeech(text, max = this._speechBudget()) {
    const cleaned = this._cleanThinkingTokens(String(text || ""));
    return summarizeSpeech(cleaned, { max });
  }

  /**
   * Native floating HUD: tell Swift how tall the content really is (bubble +
   * sprite) so it can hug it instead of clipping or leaving empty space.
   */
  _notifyNativeSize() {
    // Fixed kiosk panel: the native window is 380x360 and never resizes.
    // The compact layout reserves the bubble strip inside it.
    return;
  }


  _speechLocked() {
    return !!(this._bubbleHoldUntil && Date.now() < this._bubbleHoldUntil);
  }

  _updateSpeechBubble(text, options = {}) {
    const force = options.force === true;
    const holdMs = options.holdMs;
    const minIntervalMs = options.minIntervalMs ?? 6000;
    // Single choke point: no caller can dump a raw Discord-length reply.
    const next = text == null ? "" : this._shortSpeech(String(text));

    // Don't let a routine idle/frame clear wipe a reply that is still on hold.
    if (!next && this._speechLocked() && !options.hardClear) return;

    if (!force && next && next === this._lastSpokenText) return;
    if (
      !force &&
      next &&
      this._lastSpokenAt &&
      Date.now() - this._lastSpokenAt < minIntervalMs
    ) {
      return;
    }

    const st = document.getElementById("speech-text");
    const sb = document.getElementById("speech-bubble");
    if (st && sb) {
      st.textContent = next;
      sb.classList.toggle("has-text", !!next);
      if (next) sb.style.display = "block";
    }
    this._lastSpokenText = next;
    this._lastSpokenAt = Date.now();
    if (next && holdMs > 0) this._bubbleHoldUntil = Date.now() + holdMs;
    this._notifyNativeSize();

    if (this._speechClearTimer) {
      clearTimeout(this._speechClearTimer);
      this._speechClearTimer = null;
    }
    if (next && holdMs > 0) {
      this._speechClearTimer = setTimeout(() => {
        this._speechClearTimer = null;
        this._updateSpeechBubble("", { force: true });
      }, holdMs);
    }
  }

  /** Click the bubble to copy its line; click the codec subtitle too. */
  _setupSpeechCopy() {
    const bubble = document.getElementById("speech-bubble");
    const textEl = document.getElementById("speech-text");
    if (!bubble || !textEl || bubble.dataset.copyBound) return;
    bubble.dataset.copyBound = "1";
    bubble.setAttribute("title", "Click to copy");
    const copy = async (event) => {
      if (event) event.stopPropagation();
      const text = (textEl.textContent || "").trim();
      if (!text) return;
      const ok = await copyTextToClipboard(text);
      if (!ok) return;
      bubble.classList.add("copied");
      clearTimeout(this._bubbleCopiedTimer);
      this._bubbleCopiedTimer = setTimeout(
        () => bubble.classList.remove("copied"),
        900,
      );
    };
    bubble.addEventListener("pointerdown", (event) => event.stopPropagation());
    bubble.addEventListener("touchstart", (event) => event.stopPropagation(), {
      passive: true,
    });
    bubble.addEventListener("click", copy);
  }

  /** Clear streaming state when message completes */
  _clearStreamingState() {
    this._streamingSpeechActive = false;
    this._accumulatedText = "";
    this._currentMessageId = null;
    this._streamStartTime = 0;
    this._currentEmotionLock = null;
    this._activeWorkUntil = 0;
    this._expressionEngine.reset();
    if (typeof window !== "undefined") {
      window.__otaclawStreamingActive = false;
    }
  }

  /**
   * Set an overlay frame while preserving a sheet-crop base's character scale.
   * The sheet cell is 47x70 with internal padding; the overlay sprite is a tight
   * 29x64 crop. We resize the frame element to 29x64 and keep the same CSS
   * transform scale so the overlay character renders at exactly the same pixel
   * scale as the base character (not stretched to fill the 47x70 box).
   * @private
   * @param {string} filename - Sprite filename relative to sprites basePath.
   */
  _setSheetOverlayFrame(filename) {
    const sprite = document.getElementById("sprite");
    const frameEl = sprite?.querySelector(".otacon-frame");
    if (!frameEl) return;
    const basePath = (
      this.config?.sprites?.basePath || "assets/sprites/"
    ).replace(/\/$/, "");
    const rawUrl = `${basePath}/${filename}`;
    const url =
      typeof window.otaclawAssetUrl === "function"
        ? window.otaclawAssetUrl(rawUrl)
        : rawUrl;
    // Keep the base frame box (47x70 cell) so the blink never changes the element
    // geometry. The 29x64 art is centered inside that box at its native size, which
    // preserves the character's center without the old shrink/shift "hop".
    const box = window.getComputedStyle(frameEl);
    frameEl.style.setProperty("width", box.width, "important");
    frameEl.style.setProperty("height", box.height, "important");
    frameEl.style.setProperty("background-image", `url('${url}')`, "important");
    frameEl.style.setProperty("background-size", "auto", "important");
    frameEl.style.setProperty("background-position", "center", "important");
    frameEl.style.setProperty("background-repeat", "no-repeat", "important");
  }

  /**
   * Detect whether the current frame is rendered as an individual sprite or a
   * sheet-crop frame by inspecting live inline styles. This is more robust than
   * relying on _lastFrame.renderMode, which can go stale when ambient behaviors
   * or sequences swap the frame through different paths.
   * @private
   */
  _currentFrameIsIndividual() {
    const frameEl = document.querySelector("#sprite .otacon-frame");
    if (!frameEl) return false;
    if (frameEl.dataset.render) return frameEl.dataset.render === "individual";
    // Legacy fallback for frames rendered before data-render existed.
    return frameEl.style.width === "100%" && frameEl.style.height === "100%";
  }

  /**
   * Apply an overlay frame by swapping the current frame instead of layering it.
   * @private
   * @param {string|[number,number]} overlay - Individual sprite URL or [col,row] sheet cell.
   */
  _applyOverlayFrame(overlay) {
    if (!this._overlaySavedFrame) {
      this._overlaySavedFrame = this._lastFrame
        ? { ...this._lastFrame, generation: this._frameGeneration }
        : null;
    }
    // Detect the current base render mode from live inline styles, not stale bookkeeping.
    const baseMode = this._currentFrameIsIndividual() ? "individual" : "sheet";
    if (typeof overlay === "string") {
      if (baseMode === "individual") {
        this._setFrameFromSprite(overlay, undefined, { isOverlay: true });
      } else {
        this._setSheetOverlayFrame(overlay);
      }
    } else if (Array.isArray(overlay) && overlay.length === 2) {
      this._setFrameDirect(overlay[0], overlay[1], undefined, { isOverlay: true });
    }
  }

  /**
   * Restore the frame saved before the overlay started.
   * @private
   */
  _restoreOverlayFrame() {
    const saved = this._overlaySavedFrame;
    this._overlaySavedFrame = null;
    if (!saved) return;
    // If the base frame has changed since the overlay started (e.g. a state
    // sequence started mid-blink), do NOT restore the old base.
    if (saved.generation !== undefined && saved.generation !== this._frameGeneration) {
      return;
    }
    if (saved.type === "sprite") {
      this._setFrameFromSprite(saved.file, undefined, { isOverlay: true });
    } else {
      this._setFrameDirect(saved.col, saved.row, undefined, { isOverlay: true });
    }
  }

  /**
   * Blink: smooth 3-stage human blink (open → half → closed → half → open).
   *
   * Stage order (inspected from actual assets):
   *   - blink_01.png = half-closed
   *   - blink_02.png = fully closed
   *   - blink_00.png = fully open (used as the "open" stage / base reference)
   *
   * The sequence is rendered by temporarily swapping the base frame through the
   * same _setFrameFromSprite path, then restoring the exact captured base frame.
   * If the base frame changes mid-blink (state sequence starts), restore is
   * skipped so the new animation is not stomped.
   *
   * @returns {Promise<void>} Resolves when the blink sequence completes or aborts.
   */
  _doBlink() {
    return new Promise((resolve) => {
      if (!document.body.classList.contains("otaclaw-widget")) {
        resolve();
        return;
      }
      if (this.config?.sprites?.blinkOverlay === false) {
        resolve();
        return;
      }
      const currentState = this.otaclaw?.getState?.();
      const suppress = this.config?.sprites?.blinkSuppressStates || [
        "sleeping",
        "error",
        "worried",
        "scared",
      ];
      if (suppress.includes(currentState)) {
        resolve();
        return;
      }
      if (this._sequenceActive && this._lastDirectorState !== "idle") {
        resolve();
        return;
      }
      const activeTimers = this.animator?.timers?.activeNames || [];
      if (activeTimers.some((n) => n.startsWith("sequence"))) {
        resolve();
        return;
      }

      // The overlay is eye-only, so it aligns with the neutral rest pose. On
      // any other pose the eyes sit elsewhere and the overlay would look wrong.
      const baseFrame = this._lastFrame;
      if (!baseFrame) {
        resolve();
        return;
      }
      // Eye-only art is aligned to the individual neutral PNG; the sheet
      // fallback renders at a different box/scale, so do not overlay there.
      const blinkable =
        baseFrame.type === "sprite" &&
        /_0000_Sprite-1\.png$/.test(baseFrame.file || "");
      if (!blinkable) {
        resolve();
        return;
      }

      const img = this._ensureEyeBlink();
      if (!img) {
        resolve();
        return;
      }

      // One quick eye close. Eye-only art means no body swap and no stutter.
      const closedMs = Math.round(95 + Math.random() * 55);
      img.classList.add("is-on");
      setTimeout(() => img.classList.remove("is-on"), closedMs);

      // Occasional double blink, 160-260 ms after the first one.
      const doubleChance = Number(this.config?.sprites?.blinkDoubleChance ?? 0.05);
      if (Math.random() < doubleChance) {
        setTimeout(() => {
          img.classList.add("is-on");
          setTimeout(() => img.classList.remove("is-on"), closedMs);
        }, closedMs + 160 + Math.random() * 100);
      }
      resolve();
    });
  }

  /** Lazily add the eye-only blink overlay on top of the sprite box. */
  _ensureEyeBlink() {
    const frame =
      document.querySelector("#sprite .otacon-frame") ||
      document.querySelector(".otacon-frame");
    if (!frame) return null;
    let img = frame.querySelector(".eye-blink");
    if (!img) {
      const base = (this.config?.sprites?.basePath || "assets/sprites/").replace(/\/$/, "");
      const raw = `${base}/eye-blink.png`;
      const src =
        typeof window.otaclawAssetUrl === "function"
          ? window.otaclawAssetUrl(raw)
          : raw;
      img = document.createElement("img");
      img.className = "eye-blink";
      img.src = src;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      frame.appendChild(img);
    }
    return img;
  }

  startBlinkOverlay() {
    this.stopBlinkOverlay();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    if (this.config?.sprites?.blinkOverlay === false) return; // Skip blink overlay if disabled
    const minMs = Number(this.config?.sprites?.blinkIntervalMinMs ?? 5000);
    const maxMs = Number(this.config?.sprites?.blinkIntervalMaxMs ?? 12000);
    const doubleChance = Number(this.config?.sprites?.blinkDoubleChance ?? 0.05);
    const schedule = async () => {
      if (
        !document.body.classList.contains("otaclaw-widget") ||
        document.body.classList.contains("widget-asleep")
      ) {
        this._blinkOverlayHandle = null;
        return;
      }
      await this._doBlink();
      // ~15% chance of a double-blink: second sequence 150-250ms after first completes.
      if (Math.random() < doubleChance) {
        const doubleDelay = 150 + Math.random() * 100;
        this._blinkOverlayHandle = setTimeout(async () => {
          await this._doBlink();
          const delay = minMs + Math.random() * (maxMs - minMs);
          this._blinkOverlayHandle = setTimeout(schedule, Math.round(delay));
        }, Math.round(doubleDelay));
      } else {
        const delay = minMs + Math.random() * (maxMs - minMs);
        this._blinkOverlayHandle = setTimeout(schedule, Math.round(delay));
      }
    };
    const firstDelay = minMs * 0.5 + Math.random() * minMs * 0.5;
    this._blinkOverlayHandle = setTimeout(schedule, Math.round(firstDelay));
  }

  stopBlinkOverlay() {
    if (this._blinkOverlayHandle) {
      clearTimeout(this._blinkOverlayHandle);
      this._blinkOverlayHandle = null;
    }
    if (this._blinkRestoreTimer) {
      clearTimeout(this._blinkRestoreTimer);
      this._blinkRestoreTimer = null;
    }
    if (this._blinkResolve) {
      const r = this._blinkResolve;
      this._blinkResolve = null;
      r();
    }
  }

  /**
   * PRODUCTION PATH (Pi kiosk via widget.html + sprite-runtime.js + this):
   * startWaiting + startIdle + _getOrganicFramePool + _tryPlayStateSequence
   * deliver catalog-driven, context-biased, sequence-using animation from first visible frame.
   */
  /**
   * During connecting/reconnecting: run idle sequence with fast timing so user sees active animation.
   * PRODUCTION PATH for Pi kiosk: this + startIdle + _getOrganicFramePool + _tryPlayStateSequence
   * ensure catalog-driven organic selection (with idle_base bias + task category from _lastContext)
   * and real sequences (thumbs-up, laughing, etc.) from the very first visible frame after boot.
   * Made async only to allow a short race-wait for catalog preload; callers do not await.
   */
  async startWaitingAnimation(speech = "") {
    /* Boot sequence has exclusive control ~3s – never compete with it */
    if (typeof window !== "undefined" && !window.__otaclawBootComplete) return;
    if (typeof window !== "undefined")
      window.__otaclawFallbackIdleActive = false;
    if (typeof window !== "undefined")
      window.otaclawWaitingMsg =
        speech || window.otaclawWaitingMsg || this._t("connecting");
    this.stopWaitingAnimation();
    const checkConfigTxt = this._t("checkConfig");
    const isCheckConfig = !!speech && speech === checkConfigTxt;
    document.body.classList.toggle("widget-check-config", isCheckConfig);
    this.stopIdleAnimation();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    const sprites = this.config?.sprites || {};
    const IDLE_SPRITES =
      Array.isArray(sprites.idleSprites) && sprites.idleSprites.length
        ? sprites.idleSprites
        : null;
    // Waiting must read as calm breathing, not a slideshow. A short deterministic
    // sequence with long holds avoids the old "random frame every ~450ms" jitter.
    // Waiting must look calm, not like a slideshow: hold one neutral frame.
    // Blinking supplies the life; a disconnected avatar should not "dance".
    const WAITING_BREATH = [[0, 0]];
    const configuredWaiting = Array.isArray(sprites.waitingSequence) && sprites.waitingSequence.length
      ? sprites.waitingSequence
      : null;
    let seq = configuredWaiting || WAITING_BREATH;
    // Keep the early catalog available for later states without delaying the first frame.
    if (!this._frameCatalog && typeof window !== "undefined") {
      if (window.__otaclawEarlyCatalog) this._frameCatalog = window.__otaclawEarlyCatalog;
      else if (window.__otaclawFrameCatalog) this._frameCatalog = window.__otaclawFrameCatalog;
    }
    const baseMs = 1200;
    const jitterMs = 300;
    let idx = 0;
    const schedule = () => {
      if (
        !document.body.classList.contains("otaclaw-widget") ||
        !document.body.classList.contains("widget-waiting")
      ) {
        this._waitingAnimationHandle = null;
        return;
      }
      const frameObj = seq[idx % seq.length];
      if (Array.isArray(frameObj)) {
        this._setFrameDirect(frameObj[0], frameObj[1] !== undefined ? frameObj[1] : 0, "");
      } else if (IDLE_SPRITES && IDLE_SPRITES[frameObj]) {
        this._setFrameFromSprite(IDLE_SPRITES[frameObj], "");
      } else {
        this._setFrameDirect(frameObj, 0, "");
      }
      idx += 1;
      const delay = baseMs + Math.random() * jitterMs;
      this._waitingAnimationHandle = setTimeout(schedule, delay);
    };
    schedule();
    this.startBlinkOverlay();
    if (speech && typeof window.showWidgetConnectionMsgBrief === "function") {
      window.showWidgetConnectionMsgBrief(speech, 5000);
    }
  }

  stopWaitingAnimation() {
    if (this._waitingAnimationHandle) {
      clearTimeout(this._waitingAnimationHandle);
      this._waitingAnimationHandle = null;
    }
    document.body.classList.remove("widget-check-config");
  }

  /**
   * Active LLM/tool states where sprites should stay task-coherent (not random idle variety).
   */
  _isActiveWorkState(state) {
    return [
      "thinking",
      "processing",
      "tool",
      "curious",
      "excited",
      "worried",
      "presenting",
    ].includes(state);
  }

  /** Load the 1:1 function manifest and merge its signals into the config. */
  async _loadSpriteFunctions(assetUrl) {
    try {
      const res = await fetch(assetUrl("data/sprite-functions.json?v=1"));
      if (!res.ok) return;
      const manifest = await res.json();
      this._spriteFunctions = manifest;
      this.config.stateSprites = this.config.stateSprites || {};
      this.config.stateSprites.signalMap = {
        ...spriteSignalMap(manifest),
        ...(this.config.stateSprites.signalMap || {}),
      };
    } catch (_) {
      /* manifest optional */
    }
  }

  /**
   * agent.sprite: the 1:1 function selector (Vibeconferencing-style).
   *   { sprite: "wink_right" }  -> that exact asset
   *   { sprite: "4,3" }         -> that exact cell
   *   { sprite: "search" }      -> the tool's state sequence
   * A bubble/summary overrides the default label.
   */
  _handleAgentSprite(data = {}) {
    const key =
      data.sprite ??
      data.emoji ??
      (Array.isArray(data.frame) ? data.frame.join(",") : "");

    // Persistent agent override (Vibeconf set_avatar_emoji): pin the face for
    // a slot the director consults (idle | listening | working | speaking |
    // yielding | offline | error). `sprite:"reset"` clears it.
    const slot = data.slot || (data.override === true ? "idle" : null);
    if (slot) {
      this._spriteOverrides = this._spriteOverrides || {};
      if (key && key !== "reset" && key !== "clear") {
        const fn = findSpriteFunction(this._spriteFunctions, key);
        this._spriteOverrides[slot] = fn?.id || key;
      } else {
        delete this._spriteOverrides[slot];
      }
      this._refreshDirector({
        speech: data.bubble ? this._shortSpeech(data.bubble) : "",
      });
      return;
    }

    const tool = findToolFunction(this._spriteFunctions, key);
    const fn = findSpriteFunction(this._spriteFunctions, key);
    const bubbleRaw = data.bubble ?? data.summary ?? tool?.bubble ?? "";
    const speech = bubbleRaw ? this._shortSpeech(bubbleRaw) : "";

    if (fn?.frame && !tool) {
      // Exact asset: stop the running state sequence so its next timer doesn't
      // overwrite the requested pose. Like Vibeconf's per-response speak emoji.
      this._spriteSpeaking = fn.id;
      this.stopAllAnimations();
      this._setFrameDirect(fn.frame[0], fn.frame[1], speech);
      if (speech) this._updateSpeechBubble(speech, { force: true, holdMs: 2500 });
      if (this._spriteHoldTimer) clearTimeout(this._spriteHoldTimer);
      this._spriteHoldTimer = setTimeout(() => {
        this._spriteHoldTimer = null;
        this._spriteSpeaking = null;
        this._refreshDirector({ idle: true });
      }, 6000);
      return;
    }

    if (tool) this._lastToolSprite = fn?.id || key;
    const state = data.state || tool?.state || fn?.state;
    if (state && getStateSprite(this.config, state)) {
      if (speech) this._directorSpeech = speech;
      this._requestState(state, { trigger: "agent.sprite", data, speech });
      if (speech) {
        this._updateSpeechBubble(speech, { force: true, holdMs: 2500 });
        // The state sequence writes its canned line on the first frame.
        if (this._toolBubbleTimer) clearTimeout(this._toolBubbleTimer);
        this._toolBubbleTimer = setTimeout(() => {
          this._toolBubbleTimer = null;
          this._updateSpeechBubble(speech, { force: true, holdMs: 2500 });
        }, 180);
      }
      return;
    }

    // Fallback: a raw cell or a known state name without the manifest.
    const cell = String(key || "").match(/^(\d+)\s*,\s*(\d+)$/);
    if (cell) {
      this.stopAllAnimations();
      this._setFrameDirect(Number(cell[1]), Number(cell[2]), speech);
      if (speech) this._updateSpeechBubble(speech, { force: true, holdMs: 2500 });
    }
  }

  /** Vibeconf waterfall: the agent's overrides + activity + hearing + idle. */
  _refreshDirector({ idle = false, speech = null, hold = true } = {}) {
    const state = idle
      ? "idle"
      : this._spriteSpeaking
        ? "speaking"
        : this._directorState || this.otaclaw?.getState?.() || "idle";
    const pick = resolveAvatar({
      mode: this._avatarMode || "active",
      state,
      overrides: this._spriteOverrides || {},
      activity: this._lastToolSprite || null,
      emotion: this._lastEmotionSprite || null,
      speaking: this._spriteSpeaking || null,
      hearing: !!this._hearing,
      offline: !!this._gatewayOffline,
      error: !!this._spriteError,
      idleIndex: this._idleTick || 0,
    });
    const text = speech == null ? this._directorSpeech || "" : speech;
    if (this._sequenceActive && this._lastDirectorState === state) return true;
    this._lastDirectorState = state;
    if (this._playDirectorSequence(state, text)) return true;
    return this._applySpriteFunction(pick.id, text, 6500, { source: pick.source, hold });
  }

  /** Frames for a state: catalog sequence, then config tagToSequences, then idle. */
  _directorSequenceFor(state) {
    if (!this._directorEnabled) return null;
    if (state === "idle") {
      if (this._spriteOverrides?.idle) return null;
      const idleSeq = this._frameCatalog?.sequences?.idle;
      if (Array.isArray(idleSeq) && idleSeq.length) return idleSeq;
      return DIRECTOR_IDLE_SEQ;
    }
    const candidates = [
      this._frameCatalog?.sequences?.[state],
      this.config?.sprites?.tagToSequences?.[state],
    ];
    const valid = this._frameCatalog?.frames?.length
      ? new Set(this._frameCatalog.frames.map((f) => `${f.col},${f.row}`))
      : null;
    for (const seq of candidates) {
      if (!Array.isArray(seq) || !seq.length) continue;
      const frames = seq
        .map((f) => (Array.isArray(f) ? f : [f.col, f.row]))
        .filter(([c, r]) => Number.isFinite(c) && Number.isFinite(r) && (!valid || valid.has(`${c},${r}`)))
        .filter((f, i, arr) => i === 0 || f[0] !== arr[i - 1][0] || f[1] !== arr[i - 1][1]);
      if (frames.length) return frames;
    }
    return null;
  }

  /** Play a state's pre-armed sequence at a human pace; the director owns it. */
  _playDirectorSequence(state, speech = "") {
    const frames = this._directorSequenceFor(state);
    if (!frames || !frames.length) return false;
    this.stopAllAnimations();
    if (this._spriteHoldTimer) {
      clearTimeout(this._spriteHoldTimer);
      this._spriteHoldTimer = null;
    }
    const token = ++this._sequenceToken;
    this._sequenceActive = true;
    const frameMs = DIRECTOR_SEQ_FRAME_MS[state] ?? 700;
    const loop = DIRECTOR_SEQ_LOOP.has(state);
    let i = 0;
    const step = () => {
      if (token !== this._sequenceToken) return;
      if (i >= frames.length) {
        if (!loop) {
          this._sequenceActive = false;
          const holdMs = DIRECTOR_SEQ_HOLD_MS[state] ?? 1500;
          this._sequenceHoldTimer = setTimeout(() => {
            this._sequenceHoldTimer = null;
            if (token === this._sequenceToken) this._refreshDirector({ idle: true });
          }, holdMs);
          return;
        }
        i = 0;
      }
      const [c, r] = frames[i];
      this._setFrameDirect(c, r, i === 0 ? speech : undefined);
      i += 1;
      this._sequenceTimer = setTimeout(step, frameMs);
    };
    step();
    return true;
  }

  _stopDirectorSequence() {
    this._sequenceToken += 1;
    this._sequenceActive = false;
    if (this._sequenceTimer) {
      clearTimeout(this._sequenceTimer);
      this._sequenceTimer = null;
    }
    if (this._sequenceHoldTimer) {
      clearTimeout(this._sequenceHoldTimer);
      this._sequenceHoldTimer = null;
    }
  }

  _applySpriteFunction(id, speech = "", holdMs = 6000, { source = "director", hold = true } = {}) {
    const fn = findSpriteFunction(this._spriteFunctions, id);
    if (!fn?.frame) return false;
    this.stopAllAnimations();
    this._setFrameDirect(fn.frame[0], fn.frame[1], speech);
    if (speech) {
      this._updateSpeechBubble(speech, { force: true, holdMs: Math.min(holdMs, 7000) });
    }
    this._spriteSource = source;
    if (this._spriteHoldTimer) clearTimeout(this._spriteHoldTimer);
    this._spriteHoldTimer = null;
    // The post-hold refresh must NOT re-arm a hold, or the 9s idle tick is
    // blocked forever and the idle cycle freezes on one pose.
    if (hold) {
      this._spriteHoldTimer = setTimeout(() => {
        this._spriteHoldTimer = null;
        this._refreshDirector({ idle: true, hold: false });
      }, holdMs);
    }
    return true;
  }

  _categoryToWorkState(category) {
    const map = {
      search: "curious",
      analytical: "thinking",
      creative: "excited",
      risky: "worried",
      communication: "processing",
      neutral: "thinking",
      // Detail categories from the Hermes watcher.
      files: "presenting",
      writing: "excited",
      terminal: "tool",
      memory: "processing",
      web: "curious",
    };
    return map[category] || "thinking";
  }

  /**
   * Single entry point for state changes that should be debounced and
   * prioritised. Falls back to a direct setState when mapping is disabled.
   */
  _requestState(state, opts = {}) {
    if (!this._coordinator) return this.otaclaw.setState(state, opts);
    return this._coordinator.request(state, {
      ...opts,
      endsRun: opts.endsRun ?? endsRun(opts.trigger),
    });
  }

  _categoryToToolReaction(category) {
    return this._categoryToWorkState(category);
  }

  _resolveWorkState() {
    return this._categoryToWorkState(this._lastContext?.category || "neutral");
  }

  /** Keep app + AnimationController context in sync (single source for category). */
  _setLastContext(partial) {
    this._lastContext = {
      ...(this._lastContext || {}),
      ...partial,
      ts: Date.now(),
    };
    this.animator?.setContext(this._lastContext);
  }

  /**
   * Delegate organic pool to AnimationController (sole selection engine).
   */
  _getOrganicFramePool(stateName, context = {}) {
    if (this.animator) {
      if (this._frameCatalog) this.animator.setCatalog(this._frameCatalog);
      this.animator.setContext(context || this._lastContext);
      return this.animator.getOrganicFramePool(stateName, context || this._lastContext);
    }
    return [{ col: 0, row: 0 }];
  }

  /**
   * Try to play a full animation sequence for this state (from tagToSequences or catalog).
   * Returns true if a sequence was started.
   */
  _tryPlayStateSequence(stateName, speech = "") {
    // Director owns frames: never start a legacy multi-frame sequence next to it.
    if (this._directorEnabled) return false;
    if (this.animator && isMappingEnabled(this.config) && getStateSprite(this.config, stateName)) {
      if (this._frameCatalog) this.animator.setCatalog(this._frameCatalog);
      this.animator.setContext(this._lastContext);
      return this.animator.startMapped(stateName, speech);
    }
    if (!document.body.classList.contains("otaclaw-widget")) return false;

    const seqMap = this.config?.sprites?.tagToSequences || {};
    let seq = seqMap[stateName.toLowerCase()];

    if (!Array.isArray(seq) || seq.length === 0) {
      const catSeq = this._frameCatalog?.sequences?.[stateName];
      if (Array.isArray(catSeq) && catSeq.length) seq = catSeq;
    }

    if (!Array.isArray(seq) || seq.length === 0) return false;

    this.stopAllAnimations();
    const frameMs = Number(this.config?.sprites?.tagSequenceFrameMs) || 350;
    let idx = 0;
    const run = () => {
      if (!document.body.classList.contains("otaclaw-widget")) return;
      const [c, r] = seq[idx];
      this._setFrameDirect(c, r, speech || "");
      idx++;
      if (idx < seq.length) {
        this._tagSeqHandle = setTimeout(run, frameMs);
      } else {
        this._tagSeqHandle = null;
        if (["success", "laughing", "error", "surprised"].includes(stateName)) {
          setTimeout(() => {
            const st = this.otaclaw?.getState?.();
            if (st === stateName || st === "processing") {
              this.otaclaw?.setState("idle", { speech: "" });
            }
          }, 2200);
        }
      }
    };
    run();
    return true;
  }

  stopAllAnimations() {
    this.animator?.stopAll();
    this._stopDirectorSequence();
    [
      "_idleAnimationHandle",
      "_thinkingAnimationHandle",
      "_successAnimationHandle",
      "_errorAnimationHandle",
      "_laughingAnimationHandle",
      "_surprisedAnimationHandle",
      "_tagSeqHandle",
      "_tagPoolAnimationHandle",
      "_thinkingPhaseTimer",
    ].forEach((k) => {
      if (this[k]) {
        clearTimeout(this[k]);
        this[k] = null;
      }
    });
  }

  /**
   * After a tool/stock context arrives during idle, restart idle life loop
   * (context itself does not bias idle poses — fidelity is work-only).
   */
  _refreshIdleWithContext() {
    if (!document.body.classList.contains("otaclaw-widget")) return;
    const st = this.otaclaw?.getState?.();
    if (st === "idle") {
      setTimeout(() => {
        if (this.otaclaw?.getState?.() === "idle") this.startIdleAnimation();
      }, 80);
    }
  }

  /** Idle = life (base hold + micro). Delegates to AnimationController. */
  startIdleAnimation() {
    this.stopAllAnimations();
    if (this._directorEnabled) {
      this._refreshDirector({ idle: true });
      return;
    }
    if (!this.animator) return;
    if (this._frameCatalog) this.animator.setCatalog(this._frameCatalog);
    this.animator.setContext(null);
    if (!this._bubbleHoldUntil || Date.now() >= this._bubbleHoldUntil) {
      this._updateSpeechBubble("", { force: true });
      this._bubbleHoldUntil = 0;
    }
    this._completionSpeech = "";
    this.animator.startIdle();
  }

  stopIdleAnimation() {
    this.stopAllAnimations();
  }

  /**
   * Instant wake for gateway activity (agent started, Discord message...).
   * The boot-rise animation is for a user tapping the screen; an incoming
   * event should reveal the face and the new state immediately.
   */
  _quickWake() {
    const wasAsleep =
      document.body.classList.contains("widget-asleep") ||
      window.__otaclawAsleep === true;
    // Rise from the floor like a tap wake; don't snap the overlay away.
    if (wasAsleep && typeof window.runWakeSequence === "function") {
      window.runWakeSequence(() => {
        this._cancelSleep();
        this._refreshDirector();
        this._scheduleSleep();
      });
      return;
    }
    // Mid-wake already: let the boot sequence finish.
    if (
      document.body.classList.contains("widget-waiting") &&
      !window.__otaclawBootComplete
    ) {
      return;
    }
    document.body.classList.remove("widget-asleep", "widget-waiting");
    document.body.classList.remove("widget-check-config");
    window.__otaclawAsleep = false;
    window.__otaclawBootComplete = true;
    const bootOv = document.getElementById("boot-black-overlay");
    const widgetOv = document.getElementById("widget-sprite-overlay");
    if (bootOv) bootOv.style.display = "none";
    if (widgetOv) widgetOv.style.display = "none";
    this._cancelSleep();
  }

  _scheduleSleep() {
    this._cancelSleep();
    if (!document.body.classList.contains("otaclaw-widget")) return;

    const ms =
      this.config?.behavior?.sleepIdleMs !== undefined &&
      this.config?.behavior?.sleepIdleMs !== null
        ? Number(this.config.behavior.sleepIdleMs)
        : 300000;

    if (ms <= 0) return;
    this._sleepTimer = setTimeout(() => {
      this._sleepTimer = null;
      this.stopIdleAnimation();
      this.stopBlinkOverlay();
      if (typeof window.runSleepSequence === "function") {
        window.runSleepSequence();
      } else {
        this.otaclaw?.setState("sleeping", { speech: "zZz...", force: true });
        document.body.classList.add("widget-asleep");
      }
    }, ms);
  }

  _cancelSleep() {
    if (this._sleepTimer) {
      clearTimeout(this._sleepTimer);
      this._sleepTimer = null;
    }
  }

  _runSheetSequence(stateName, speech, handleKey) {
    this.stopAllAnimations();
    if (!this.animator) return;
    if (this._frameCatalog) this.animator.setCatalog(this._frameCatalog);
    this.animator.setContext(this._lastContext);
    this.animator.startWork(stateName, speech);
  }

  /** Work = fidelity: stable category-matched pool via AnimationController.
   * Use the current OtaClaw state as the animation state so message-triggered
   * "thinking" stays contemplative even if a prior tool call left the context
   * category as "risky" (which would otherwise resolve to worried/pain visuals). */
  startThinkingAnimation() {
    this.stopAllAnimations();
    if (this._directorEnabled) return;
    if (!this.animator) return;
    if (this._frameCatalog) this.animator.setCatalog(this._frameCatalog);
    this.animator.setContext(this._lastContext);
    const workState = this.otaclaw?.getState?.() || this._resolveWorkState();
    const speech = this._t(workState) || this._t("thinking");
    this.animator.startWork(workState, speech);
  }

  stopThinkingAnimation() {
    if (this._thinkingPhaseTimer) {
      clearTimeout(this._thinkingPhaseTimer);
      this._thinkingPhaseTimer = null;
    }
    this.animator?.stopAll();
  }

  /**
   * Processing animation: visually distinct from thinking.
   * Prefer sheet tagToSequences.processing; otherwise use a distinct sheet-frame cycle.
   */
  startProcessingAnimation() {
    this.stopAllAnimations();
    if (this._directorEnabled) return;
    const seqMap = this.config?.sprites?.tagToSequences || {};
    const seq = seqMap.processing;
    if (Array.isArray(seq) && seq.length) {
      this._tryPlayStateSequence("processing", this._t("processing"));
      return;
    }
    if (!this.animator) return;
    if (this._frameCatalog) this.animator.setCatalog(this._frameCatalog);
    this.animator.setContext(this._lastContext);
    this.animator.startProcessing(this._t("processing"));
  }

  stopProcessingAnimation() {
    this.stopAllAnimations();
  }

  startLaughingAnimation() {
    this.stopAllAnimations();
    if (this._directorEnabled) return;
    if (!this._tryPlayStateSequence("laughing", this._t("laughing"))) {
      this.animator?.setCatalog(this._frameCatalog);
      this.animator?.startLaughing(this._t("laughing"));
    }
  }

  stopLaughingAnimation() {}

  startSuccessAnimation() {
    this.stopAllAnimations();
    if (this._directorEnabled) return;
    const speech = this._completionSpeech || this._t("success");
    if (!this._tryPlayStateSequence("success", speech)) {
      this.animator?.setCatalog(this._frameCatalog);
      this.animator?.startSuccess(speech);
    }
  }

  stopSuccessAnimation() {}

  startErrorAnimation() {
    this.stopAllAnimations();
    if (this._directorEnabled) return;
    if (!this._tryPlayStateSequence("error", this._t("error"))) {
      this.animator?.setCatalog(this._frameCatalog);
      this.animator?.startError(this._t("error"));
    }
  }

  stopErrorAnimation() {}

  startSurprisedAnimation() {
    this.stopAllAnimations();
    if (this._directorEnabled) return;
    if (!this._tryPlayStateSequence("surprised", this._t("surprised"))) {
      this.animator?.setCatalog(this._frameCatalog);
      this.animator?.startSurprised(this._t("surprised"));
    }
  }

  stopSurprisedAnimation() {}

  startCuriousAnimation() {
    this.stopAllAnimations();
    if (this._directorEnabled) return;
    this._runSheetSequence("curious", this._t("curious") || "Hmm?");
  }

  stopCuriousAnimation() {}

  /**
   * Extract brief error reason for speech bubble (~25 chars). No full stack.
   * OpenClaw: timeout, listener timed out, embedded run timeout, etc.
   */
  _briefErrorReason(data) {
    const t = (k) => this._t(k);
    if (!data) return t("error");
    const msg =
      data.error?.message ??
      data.message ??
      data.error ??
      data.reason ??
      (typeof data === "string" ? data : "");
    if (!msg) return t("error");
    const s = typeof msg === "string" ? msg : String(msg);
    const low = s.toLowerCase();
    if (low.includes("listener") && low.includes("timeout"))
      return t("listenerTimeout");
    if (low.includes("embedded run timeout")) return t("runTimeout");
    if (low.includes("connection") || s.includes("ECONNREFUSED"))
      return t("connectionError");
    if (low.includes("timeout") || low.includes("timed out"))
      return t("timeout");
    if (low.includes("network")) return t("networkError");
    if (low.includes("reject") || low.includes("refused")) return t("rejected");
    return s.length > 28 ? s.slice(0, 25) + "…" : s;
  }

  /**
   * Play the greeting sequence once on connect, or on reconnect after >5min away.
   * @private
   */
  _playGreetingIfDue() {
    if (this.config?.sprites?.greetingOnConnect === false) return;
    const now = Date.now();
    const awayMs = this._lastDisconnectAt ? now - this._lastDisconnectAt : Infinity;
    const greetedRecently = this._lastGreetingAt && now - this._lastGreetingAt < 5 * 60 * 1000;
    if (greetedRecently) return;
    if (awayMs <= 5 * 60 * 1000) return; // fresh reconnect within 5min -> no greeting
    this._lastGreetingAt = now;
    this._tryPlayStateSequence("greeting", this._t("greeting") || "Hello!");
  }

  /**
   * Adopt the sprite catalog loaded by sprite-runtime.js and wire it into the
   * animator so config.sprites.individualSequences catalog references resolve.
   * @private
   */
  _adoptSpriteCatalog() {
    if (typeof window === "undefined" || !this.animator) return;
    const tryAdopt = () => {
      const cat = window.otaclaw?.getSpriteCatalog?.();
      if (cat?.sequences) {
        this.animator.setSpriteCatalog(cat);
        return true;
      }
      return false;
    };
    if (!tryAdopt()) {
      let attempts = 0;
      const timer = setInterval(() => {
        if (tryAdopt() || attempts++ > 20) clearInterval(timer);
      }, 100);
    }
  }

  /**
   * Show configuration error
   */
  showConfigError(error) {
    const configError = document.getElementById("config-error");
    if (configError) {
      configError.classList.remove("hidden");
      const msg = configError.querySelector(".config-msg");
      const text =
        error && error.message
          ? String(error.message)
          : error
            ? JSON.stringify(error, Object.getOwnPropertyNames(error))
            : this._t("configRequired");
      if (msg) msg.textContent = text;
    }
  }

  /**
   * Start the application
   */
  async start() {
    if (this.isRunning) return;

    const initialized = await this.init();
    if (!initialized) {
      return;
    }
    window.otaclawCopyText = copyTextToClipboard;
    this._setupSpeechCopy();

    // Don't auto-connect if in offline mode
    if (this.isOfflineMode) {
      this.isRunning = true;
      this.updateConnectionUI("offline");
      if (document.body.classList.contains("otaclaw-widget")) {
        if (this.emotionsDemo) {
          // emotions=1: boot skipped in HTML; hide overlays and start cycle
          const widgetOv = document.getElementById("widget-sprite-overlay");
          const bootOv = document.getElementById("boot-black-overlay");
          if (widgetOv) widgetOv.style.display = "none";
          if (bootOv) bootOv.style.display = "none";
          document.body.classList.remove("widget-waiting");
          this.otaclaw?.setState("idle", { speech: "" });
          // Do NOT startIdleAnimation – it would overwrite demo frames every 6–10s
          if (typeof this.otaclaw?.startFullRangeDemo === "function") {
            this.otaclaw
              .startFullRangeDemo({
                singlePass: true,
                onComplete: () => this._runSequenceDemo(),
              })
              .catch((e) => {
                monitor.error("emotions_demo.failed", { error: String(e) });
              });
          }
        } else {
          document.body.classList.remove("widget-waiting");
          this.otaclaw?.setState("idle", { speech: "" });
          this.startIdleAnimation();
        }
      } else {
        document.body.classList.remove("widget-waiting");
        this.otaclaw?.setState("idle", { speech: "" });
        this.startIdleAnimation();
        if (this.emotionsDemo && typeof this.otaclaw?.startFullRangeDemo === "function")
          this.otaclaw.startFullRangeDemo();
      }
      monitor.log("offline.demo_mode");
      return;
    }

    try {
      /* Brief delay in widget so waiting animation is visible before connect */
      if (document.body.classList.contains("otaclaw-widget")) {
        await new Promise((r) => setTimeout(r, 800));
      }
      await this.wsClient.connect();
      this.isRunning = true;
    } catch {
      if (
        document.body.classList.contains("otaclaw-widget") &&
        window.__otaclawBootComplete
      ) {
        if (this._widgetConnectingTimer) {
          clearTimeout(this._widgetConnectingTimer);
          this._widgetConnectingTimer = null;
        }
        this.startWaitingAnimation(this._t("checkConfig"));
      }
    }
  }

  /**
   * Run sequence demo: idle, thinking, processing, success, error, laughing, surprised.
   * Each state shows its multi-frame sequence (blink, coat, thumbs-up, etc.).
   */
  _runSequenceDemo() {
    const SEQUENCE_STATES = [
      { state: "idle", duration: 8000, start: () => this.startIdleAnimation() },
      {
        state: "thinking",
        duration: 6000,
        start: () => this.startThinkingAnimation(),
      },
      {
        state: "processing",
        duration: 6000,
        start: () => this.startProcessingAnimation(),
      },
      {
        state: "success",
        duration: 6000,
        start: () => this.startSuccessAnimation(),
      },
      {
        state: "error",
        duration: 5000,
        start: () => this.startErrorAnimation(),
      },
      {
        state: "laughing",
        duration: 5000,
        start: () => this.startLaughingAnimation(),
      },
      {
        state: "surprised",
        duration: 4000,
        start: () => this.startSurprisedAnimation(),
      },
    ];
    let idx = 0;
    const runNext = () => {
      if (!this.isRunning || !this.emotionsDemo) return;
      const item = SEQUENCE_STATES[idx % SEQUENCE_STATES.length];
      this.stopIdleAnimation();
      this.stopThinkingAnimation();
      this.stopSuccessAnimation();
      this.stopErrorAnimation();
      this.stopLaughingAnimation();
      this.stopSurprisedAnimation();
      this.otaclaw?.setState(item.state, {
        speech: this._t(item.state) || "",
      });
      item.start();
      idx += 1;
      this._sequenceDemoTimer = setTimeout(runNext, item.duration);
    };
    runNext();
  }

  /**
   * Stop the application
   */
  stop() {
    if (!this.isRunning) return;

    // Cancel all animation timers
    this.stopWaitingAnimation();
    this.stopIdleAnimation();
    this.stopThinkingAnimation();
    this.stopSuccessAnimation();
    this.stopErrorAnimation();
    this.stopLaughingAnimation();
    this.stopSurprisedAnimation();
    if (this._tagSeqHandle) {
      clearTimeout(this._tagSeqHandle);
      this._tagSeqHandle = null;
    }
    this._cancelSleep();
    if (this._widgetConnectingTimer) {
      clearTimeout(this._widgetConnectingTimer);
      this._widgetConnectingTimer = null;
    }
    if (this._bootTransitionTimer) {
      clearTimeout(this._bootTransitionTimer);
      this._bootTransitionTimer = null;
    }

    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
    if (this._sequenceDemoTimer) {
      clearTimeout(this._sequenceDemoTimer);
      this._sequenceDemoTimer = null;
    }
    if (typeof this.otaclaw?.stopFullRangeDemo === "function") {
      this.otaclaw.stopFullRangeDemo();
    }

    // Remove event listeners added in setupUIInteractions
    if (this._wakeIfAsleepHandler) {
      document.removeEventListener("touchstart", this._wakeIfAsleepHandler, {
        capture: true,
      });
      document.removeEventListener("click", this._wakeIfAsleepHandler, {
        capture: true,
      });
      this._wakeIfAsleepHandler = null;
    }

    this.wsClient.disconnect();
    this.otaclaw.destroy();
    this.isRunning = false;
  }

  /**
   * Get application statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      isOfflineMode: this.isOfflineMode,
      debugMode: this.debugMode,
      wsStats: this.wsClient?.getStats(),
      otaclawStats: this.otaclaw?.getStats(),
    };
  }
}

// Create global app instance
const app = new OtaClawApp();

// Start when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  app.start();
});

// Handle page unload
window.addEventListener("beforeunload", () => {
  app.stop();
});

// Expose to global scope for debugging
window.otaclawApp = app;
window.wsClient = null; // set after init

export default app;
