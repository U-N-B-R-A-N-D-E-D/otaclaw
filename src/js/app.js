/**
 * OtaClaw for OpenClaw - Main Application (WebSocket / Agent Orchestrator)
 *
 * Entry point that wires the WebSocket client to the sprite engine.
 *
 * ## Load order (enforced by HTML)
 *   1. `app-calibration.js`  (classic script) — installs sprite globals:
 *          window.otaclaw, window.runSleepSequence, window.runWakeSequence,
 *          window.showWidgetConnectionMsg, window.__otaclawBootComplete, ...
 *   2. `app.js`              (ES module, THIS FILE) — consumes those globals
 *          to drive states from OpenClaw / any compatible WS gateway events.
 *
 * `app.js` MUST NOT run before `app-calibration.js` has executed; the boot
 * sequence in `app-calibration.js` owns the `widget-waiting` class on body.
 *
 * ## Sprite engine (single path)
 * All organic frame selection and work/idle animation loops live in
 * `AnimationController`. This file only orchestrates: WS events → context →
 * `animator.startIdle()` / `startWork()` / terminal sequences. DOM helpers
 * (waiting overlay, blink overlay, sleep) stay here.
 *
 * Config: inline in HTML (window.OTACLAW_CONFIG) or config.js when MIME types correct.
 */

import { WebSocketClient } from "./websocket-client.js?v=47";
import { OtaClawEngine } from "./otaclaw.js?v=47";
import { otaclawMonitor as monitor } from "./core/monitor.js";
import { CharacterExpressionEngine } from "./core/character-expression.js";
import { detectEmotion, RECENT_WINDOW } from "./core/emotion-patterns.js";
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
      confident: "Easy!",
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
      configRequired: "Edit js/config.js with your OpenClaw host.",
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

      const preloadUrls = [sheetUrl, ...individualSprites];
      preloadUrls.forEach(url => {
          const img = new Image();
          img.src = typeof window.otaclawAssetUrl === "function" ? window.otaclawAssetUrl(url) : url;
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
      const configModule = await import("./config.js?v=20");
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
        // The boot sequence in app-calibration.js needs widget-waiting to show frames
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
      else if (data.state === "success") opts.speech = this._t("success");
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
      const applyState = () => {
        const prevState = this.otaclaw?.getState?.();
        // If the incoming event carries category (from HAL agent-signals or stock), keep it for sprite bias
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
        if (typeof window.runWakeSequence === "function") {
          window.runWakeSequence(() => {
            applyState();
            this.startBlinkOverlay();
          });
        } else {
          document.body.classList.remove("widget-asleep");
          applyState();
          this.startBlinkOverlay();
        }
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

      this._clearStreamingState();

      this._requestState("success", {
        trigger: "agent.complete",
        data,
        speech: completionExpression,
      });
      this._updateSpeechBubble(completionExpression, { force: true, holdMs: 2800 });
    });

    this.wsClient.on("agentError", (data) => {
      const brief = this._briefErrorReason(data);
      this._clearStreamingState();
      this._requestState("error", {
        trigger: "agent.error",
        data,
        speech: brief,
        force: true
      });
      this._updateSpeechBubble(brief, { force: true, holdMs: 3500 });
    });

    this.wsClient.on("toolCall", (data) => {
      const toolName = data?.tool || data?.name || "tool";
      const category = data?.category || "neutral";
      // Silent tools — category still drives the face; no bubble spam per tool.
      this._setLastContext({ category, tool: toolName });
      this._activeWorkUntil = Date.now() + 120000;
    });

    this.wsClient.on("gatewayIdle", () => {
      if (this.config?.sprites?.eventReactionCoverage === false) return;
      this._requestState("idle", { trigger: "gateway.idle", speech: "" });
      this._updateSpeechBubble("", { force: true });
    });

    this.wsClient.on("gateway.ready", () => {
      if (this.config?.sprites?.eventReactionCoverage === false) return;
      this._tryPlayStateSequence("greeting", this._t("greeting") || "Hello!");
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
      showStockagentBubble("error", speech, "stockagent.alert.critical");
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

    // Direct frame (Clawdbot semantic selection). Supports { col, row }, { tag }, { speech }.
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
        document.body.classList.remove("widget-asleep");
        document.body.classList.remove("widget-waiting");
        const bootOv = document.getElementById("boot-black-overlay");
        const widgetOv = document.getElementById("widget-sprite-overlay");
        if (bootOv) bootOv.style.display = "none";
        if (widgetOv) widgetOv.style.display = "none";
        this._cancelSleep();
      }

      this.updateStateBadge(data.state);
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
                const tickleReactions = [
                  "S-stop! I can't breathe! Snake, help me!",
                  "Wait, wait! This is just like a scene from one of my Japanese animes! Hahaha!",
                  "Haha! Seriously, stop! I'm gonna wet my pants again!",
                  "Haha! Woah! You found my tickle feedback!",
                  "Is this... haha... a new FOXHOUND interrogation technique?!",
                  "Snake? Snake?! Snaaaaaaake!! ...Wait, I'm just being tickled, haha!",
                  "Hahaha! My... my endorphin levels are exceeding normal parameters!",
                  "Haha! I'm... I'm turning off the Codec! I mean it!",
                  "Got it! Haha! Okay, I yield! You win!",
                  "Are you an otaku too? Because only an otaku would do this! Hahaha!",
                ];
                const tickleMsg = tickleReactions[Math.floor(Math.random() * tickleReactions.length)];
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
    /* Widget: use main sprite (gray view + bubble) – overlay hidden after boot.
       Fill the viewport and force scale 1 so the sprite isn't magnified 4.5x. */
    frameEl.style.setProperty(
      "background-image",
      `url('${url}')`,
      "important",
    );
    frameEl.style.setProperty("background-size", "contain", "important");
    frameEl.style.setProperty("background-position", "center", "important");
    frameEl.style.setProperty("width", "100%", "important");
    frameEl.style.setProperty("height", "100%", "important");
    frameEl.style.setProperty("--otacon-scale", "1", "important");
    const isIdle = this.otaclaw?.getState?.() === "idle";
    Array.from(sprite.classList)
      .filter((c) => c.startsWith("state-"))
      .forEach((c) => sprite.classList.remove(c));
    sprite.classList.add("state-frame");
    if (isIdle) sprite.classList.add("state-idle");
    sprite.dataset.frame = filename;
    this._lastFrame = { type: "sprite", file: filename, speech, renderMode: "individual" };
    if (!isOverlay) this._frameGeneration++;
    if (speech !== undefined) {
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
      const opts = speech === undefined ? {} : { speech: speech || "" };
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
    const scale = targetHeight / fh;
    root.style.setProperty("--otacon-frame-x", String(-col * fw) + "px");
    root.style.setProperty("--otacon-frame-y", String(-row * fh) + "px");
    root.style.setProperty("--otacon-frame-w", String(fw) + "px");
    root.style.setProperty("--otacon-frame-h", String(fh) + "px");
    root.style.setProperty("--otacon-sheet-w", String(sheetW) + "px");
    root.style.setProperty("--otacon-sheet-h", String(sheetH) + "px");
    root.style.setProperty("--otacon-scale", String(scale));
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
    Array.from(spriteEl.classList)
      .filter((c) => c.startsWith("state-"))
      .forEach((c) => spriteEl.classList.remove(c));
    spriteEl.classList.add("state-frame");
    spriteEl.dataset.frame = `${col},${row}`;
    this._lastFrame = { type: "direct", col, row, speech, renderMode: "sheet" };
    if (!isOverlay) this._frameGeneration++;
    if (speech !== undefined) {
      const st = document.getElementById("speech-text");
      const sb = document.getElementById("speech-bubble");
      if (st) st.textContent = speech || "";
      if (sb) sb.classList.toggle("has-text", !!speech);
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
  _updateSpeechBubble(text, options = {}) {
    const force = options.force === true;
    const holdMs = options.holdMs;
    const minIntervalMs = options.minIntervalMs ?? 6000;
    const next = text == null ? "" : String(text);

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
    // Match the 29x64 individual sprite to the base sheet character scale.
    // The base sheet box is 47x70 at --otacon-scale; the 29x64 content is the
    // same art, just tightly cropped. By setting the element to 29x64 and letting
    // the CSS transform scale it, the overlay character aligns with the base.
    frameEl.style.setProperty("width", "29px", "important");
    frameEl.style.setProperty("height", "64px", "important");
    frameEl.style.setProperty("background-image", `url('${url}')`, "important");
    frameEl.style.setProperty("background-size", "29px 64px", "important");
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
    const inlineWidth = frameEl.style.width;
    const inlineHeight = frameEl.style.height;
    return inlineWidth === "100%" && inlineHeight === "100%";
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
      this._blinkResolve = resolve;
      if (!document.body.classList.contains("otaclaw-widget")) {
        this._blinkResolve = null;
        resolve();
        return;
      }
      if (this.config?.sprites?.blinkOverlay === false) {
        this._blinkResolve = null;
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
        this._blinkResolve = null;
        resolve();
        return;
      }
      // Skip if a state sequence (success, laugh, surprised, etc.) is currently running.
      const activeTimers = this.animator?.timers?.activeNames || [];
      const isSequenceRunning = activeTimers.some((n) => n.startsWith("sequence"));
      if (isSequenceRunning) {
        this._blinkResolve = null;
        resolve();
        return;
      }

      const baseFrame = this._lastFrame;
      if (!baseFrame) {
        this._blinkResolve = null;
        resolve();
        return;
      }

      // Stage order: half → closed → half
      // blink_00=open, blink_01=half, blink_02=closed (inspected from PNGs).
      const overlay = this.config?.sprites?.overlayEffects?.blink || {};
      const sprites = Array.isArray(overlay.sprites) && overlay.sprites.length
        ? overlay.sprites
        : [
            "otacon_sprite_blink_00.png",
            "otacon_sprite_blink_01.png",
            "otacon_sprite_blink_02.png",
          ];
      // Map by inspected visual role: half=01, closed=02. The base "open" frame is whatever
      // the avatar is currently displaying; we only need the transient blink stages.
      const halfFrame = sprites[1] || "otacon_sprite_blink_01.png";
      const closedFrame = sprites[2] || "otacon_sprite_blink_02.png";
      const stages = [halfFrame, closedFrame, halfFrame];

      const totalMs = Number(this.config?.sprites?.blinkDurationMs ?? 140);
      const stageMs = Math.max(20, Math.round(totalMs / 3));
      const savedGeneration = this._frameGeneration;

      let stage = 0;
      const runStage = () => {
        // Abort if the base frame changed under us (e.g. a state sequence started).
        if (this._frameGeneration !== savedGeneration) {
          this._overlaySavedFrame = null;
          if (this._blinkResolve) {
            const r = this._blinkResolve;
            this._blinkResolve = null;
            r();
          }
          return;
        }
        if (stage >= stages.length) {
          this._restoreOverlayFrame();
          if (this._blinkResolve) {
            const r = this._blinkResolve;
            this._blinkResolve = null;
            r();
          }
          return;
        }
        this._applyOverlayFrame(stages[stage]);
        stage++;
        this._blinkRestoreTimer = setTimeout(runStage, stageMs);
      };

      this.stopBlinkOverlay();
      runStage();
    });
  }

  startBlinkOverlay() {
    this.stopBlinkOverlay();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    if (this.config?.sprites?.blinkOverlay === false) return; // Skip blink overlay if disabled
    const minMs = Number(this.config?.sprites?.blinkIntervalMinMs ?? 2000);
    const maxMs = Number(this.config?.sprites?.blinkIntervalMaxMs ?? 8000);
    const doubleChance = Number(this.config?.sprites?.blinkDoubleChance ?? 0.15);
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
   * PRODUCTION PATH (Pi kiosk via widget.html + app-calibration.js + this):
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
    // PRODUCTION (Pi kiosk): prefer catalog-driven organic pool (see _getOrganicFramePool) for first frames.
    // This fallback is only used if catalog not ready yet; enriched with calm bases so even the first tick
    // after boot/wait shows varied resting sprites instead of a 3-5 loop.
    const fallbackSeq = Array.isArray(sprites.idleSequence) && sprites.idleSequence.length
      ? sprites.idleSequence
      : [
          [0, 0], [0, 0], [3, 0], [0, 0], [4, 0], [5, 1], [0, 0], [8, 0], [3, 0], [0, 0],
          [4, 0], [0, 0], [5, 1], [1, 0], [8, 0], [0, 0],
        ];
    let seq = fallbackSeq;
    // PRODUCTION PATH (kiosk widget): ensure the *very first* frame(s) after boot/wait use organic
    // from frame-catalog (idle_base/base bias + category context) instead of tiny hardcoded.
    // Early fetch at module top + adoption here + live switch in schedule guarantee it.
    const adoptEarly = () => {
      if (this._frameCatalog) return this._frameCatalog;
      if (typeof window !== "undefined") {
        if (window.__otaclawEarlyCatalog) {
          this._frameCatalog = window.__otaclawEarlyCatalog;
        } else if (window.__otaclawFrameCatalog) {
          this._frameCatalog = window.__otaclawFrameCatalog;
        }
      }
      return this._frameCatalog;
    };
    const catNow = adoptEarly();
    const ctxForWait = this._lastContext || { category: "idle" };
    if (catNow?.frames) {
      const calmPool = this._getOrganicFramePool("idle", ctxForWait);
      if (calmPool.length >= 3) {
        seq = calmPool.slice(0, 12).map((f) => [f.col, f.row]);
      }
    } else if (!this._frameCatalog) {
      // PRODUCTION: for the *very first* visible waiting/idle after boot, race a short fetch so the
      // initial seq uses _getOrganicFramePool (rich catalog tags + idle_base bias + any early context)
      // instead of the (now larger) fallback. Never hangs >350ms.
      const au = typeof window.otaclawAssetUrl === "function" ? (p) => window.otaclawAssetUrl(p) : (p) => p;
      // fire-and-forget kick (existing)
      fetch(au("data/frame-catalog.json?v=wait" + Date.now()))
        .then((r) => r.json())
        .then((c) => { this._frameCatalog = c; if (typeof window !== "undefined") window.__otaclawFrameCatalog = c; })
        .catch(() => {});
      // Also race a brief wait so first schedule tick can adopt a real organic pool.
      // This is the key to "organic sprite selection from t=0" on the Pi display.
      try {
        // Note: top-level early fetch + calibration fetch + this usually win; race is belt-and-suspenders.
        const raced = await Promise.race([
          fetch(au("data/frame-catalog.json?first=" + Date.now())).then((r) => (r && r.ok ? r.json() : null)),
          new Promise((res) => setTimeout(() => res(null), 320)),
        ]);
        if (raced && Array.isArray(raced.frames)) {
          this._frameCatalog = raced;
          if (typeof window !== "undefined") window.__otaclawFrameCatalog = raced;
        }
      } catch (_) {}
    }
    const baseMs = 450;
    const jitterMs = 150;
    let idx = 0;
    const schedule = () => {
      if (
        !document.body.classList.contains("otaclaw-widget") ||
        !document.body.classList.contains("widget-waiting")
      ) {
        this._waitingAnimationHandle = null;
        return;
      }
      // PRODUCTION: live upgrade to organic on every tick once catalog ready (guarantees rich sprites ASAP even if first tick used fallback)
      if (!this._frameCatalog && typeof window !== "undefined") {
        if (window.__otaclawEarlyCatalog) this._frameCatalog = window.__otaclawEarlyCatalog;
        else if (window.__otaclawFrameCatalog) this._frameCatalog = window.__otaclawFrameCatalog;
      }
      if (this._frameCatalog?.frames) {
        const p = this._getOrganicFramePool("idle", this._lastContext || { category: "idle" });
        if (p.length >= 3) seq = p.slice(0, 12).map((f) => [f.col, f.row]);
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

  _categoryToWorkState(category) {
    const map = {
      search: "curious",
      analytical: "thinking",
      creative: "excited",
      risky: "worried",
      communication: "processing",
      neutral: "thinking",
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
    if (!this.animator) return;
    if (this._frameCatalog) this.animator.setCatalog(this._frameCatalog);
    this.animator.setContext(null);
    this._updateSpeechBubble("", { force: true });
    this.animator.startIdle();
  }

  stopIdleAnimation() {
    this.stopAllAnimations();
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
    if (!this._tryPlayStateSequence("laughing", this._t("laughing"))) {
      this.animator?.setCatalog(this._frameCatalog);
      this.animator?.startLaughing(this._t("laughing"));
    }
  }

  stopLaughingAnimation() {}

  startSuccessAnimation() {
    this.stopAllAnimations();
    if (!this._tryPlayStateSequence("success", this._t("success"))) {
      this.animator?.setCatalog(this._frameCatalog);
      this.animator?.startSuccess(this._t("success"));
    }
  }

  stopSuccessAnimation() {}

  startErrorAnimation() {
    this.stopAllAnimations();
    if (!this._tryPlayStateSequence("error", this._t("error"))) {
      this.animator?.setCatalog(this._frameCatalog);
      this.animator?.startError(this._t("error"));
    }
  }

  stopErrorAnimation() {}

  startSurprisedAnimation() {
    this.stopAllAnimations();
    if (!this._tryPlayStateSequence("surprised", this._t("surprised"))) {
      this.animator?.setCatalog(this._frameCatalog);
      this.animator?.startSurprised(this._t("surprised"));
    }
  }

  stopSurprisedAnimation() {}

  startCuriousAnimation() {
    this.stopAllAnimations();
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
   * Adopt the sprite catalog loaded by app-calibration.js and wire it into the
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
