/**
 * OtaClaw for OpenClaw - Main Application
 * Entry point that initializes all components
 * Config: inline in HTML (window.OTACLAW_CONFIG) or config.js when MIME types correct
 */

import { WebSocketClient } from "./websocket-client.js";
import { OtaClawEngine } from "./otaclaw.js";

class OtaClawApp {
  constructor() {
    this.config = null;
    this.wsClient = null;
    this.otaclaw = null;
    this.isRunning = false;
    this.debugMode = false;
    this.isOfflineMode = false;
    this._lastFrame = null;
    this._blinkOverlayHandle = null;
    this._blinkRestoreTimer = null;

    // Bind methods
    this.init = this.init.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.handleWebSocketEvent = this.handleWebSocketEvent.bind(this);
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

      // Setup event listeners
      this.setupEventListeners();

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

      // Setup UI interactions
      this.setupUIInteractions();

      if (this.config?.sprites?.preload) {
        const img = new Image();
        img.src = this.getSpriteSheetUrl();
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
   * Prefers window.OTACLAW_CONFIG (inline in HTML) when gateway serves wrong MIME types
   */
  async loadConfig() {
    if (typeof window !== "undefined" && window.OTACLAW_CONFIG) {
      this.config = window.OTACLAW_CONFIG;
      this.debugMode = this.config.behavior?.debug || false;
      this._applyProfile();
      this._applyPersonality();
      return;
    }
    try {
      const configModule = await import("./config.js");
      this.config = configModule.OTACLAW_CONFIG || configModule.default;

      if (!this.config) {
        throw new Error("Configuration not found");
      }

      // Enable debug mode if configured
      this.debugMode = this.config.behavior?.debug || false;

      // Apply behavior profile (minimal, expressive, etc.)
      this._applyProfile();
      this._applyPersonality();
    } catch (error) {
      console.error("[OtaClaw] Failed to load configuration:", error);
      throw new Error(
        this.config?.i18n?.configError ??
          "Configuration error: Copy config.example.js to config.js",
      );
    }
  }

  /**
   * Setup event listeners between components
   */
  setupEventListeners() {
    this.wsClient.on("connecting", () => {
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
      this.updateConnectionUI("connecting");
      if (
        document.body.classList.contains("otaclaw-widget") &&
        window.__otaclawBootComplete
      ) {
        this.startWaitingAnimation(this._t("reconnecting"));
        this._scheduleSleep();
      }
    });

    this.wsClient.on("maxReconnectReached", () => {
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
      const offlineAfter = Number(
        this.config?.openclaw?.offlineAfterReconnects || 0,
      );
      if (offlineAfter > 0 && !this.isOfflineMode) {
        this.enableOfflineMode(true);
        this.updateConnectionUI("offline");
      }
    });

    this.wsClient.on("error", () => {});

    this.wsClient.on("stateChange", (data) => {
      const eventPriority = this.config?.eventPriority || {};
      const newPriority = data.priority ?? 0;
      const currentPriority =
        this._currentStatePriority ?? eventPriority[data.trigger] ?? 0;
      if (
        newPriority < currentPriority &&
        !["agent.tool.call"].includes(data.trigger)
      ) {
        return;
      }
      this._currentStatePriority = newPriority;

      const opts = { trigger: data.trigger, data: data.data };
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
      else if (data.state === "idle") {
        opts.speech = "";
        this._currentStatePriority = 0;
      }
      const applyState = () => {
        const prevState = this.otaclaw?.getState?.();
        this.otaclaw.setState(data.state, opts);
        if (
          data.trigger === "agent.tool.call" &&
          (prevState === "thinking" || prevState === "processing")
        ) {
          const dur =
            this.config?.stateDurations?.surprised ?? 2500;
          setTimeout(() => {
            if (this.otaclaw?.getState?.() === "surprised")
              this.otaclaw.setState("thinking", {
                trigger: "toolInterruptReturn",
                speech: this._t("thinking"),
              });
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

    this.wsClient.on("gatewayError", (data) => {
      const brief = this._briefErrorReason(data);
      this.otaclaw.setState("error", {
        trigger: "gateway.error",
        data,
        speech: brief,
      });
    });

    // Specific OpenClaw events
    this.wsClient.on("agentStart", (data) => {
      this.otaclaw.setState("thinking", {
        trigger: "agent.start",
        data,
        speech: this._t("thinking"),
      });
    });

    this.wsClient.on("agentDelta", (data) => {
      const throttleMs = 100;
      const now = Date.now();
      if (
        this._lastDeltaUpdateAt &&
        now - this._lastDeltaUpdateAt < throttleMs
      ) {
        return;
      }
      this._lastDeltaUpdateAt = now;
      if (this.otaclaw.getState() === "thinking") {
        this.otaclaw.setState("processing", {
          trigger: "agent.delta",
          data,
          speech: this._t("processing"),
        });
      }
    });

    this.wsClient.on("agentComplete", (data) => {
      this.otaclaw.setState("success", {
        trigger: "agent.complete",
        data,
        speech: this._t("success"),
      });
    });

    this.wsClient.on("agentError", (data) => {
      const brief = this._briefErrorReason(data);
      this.otaclaw.setState("error", {
        trigger: "agent.error",
        data,
        speech: brief,
      });
    });

    this.wsClient.on("toolCall", (data) => {
      this.otaclaw.setState("surprised", {
        trigger: "tool.call",
        data,
        speech: this._t("surprised"),
      });
    });

    this.wsClient.on("gatewayIdle", () => {
      this.otaclaw.setState("idle", { trigger: "gateway.idle", speech: "" });
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
          if (data.state === "thinking" || data.state === "processing") {
            this.stopIdleAnimation();
            this.stopSuccessAnimation();
            this.stopErrorAnimation();
            this.stopLaughingAnimation();
            this.stopSurprisedAnimation();
            this.startThinkingAnimation();
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
            data.state === "excited"
          ) {
            this.stopIdleAnimation();
            this.stopThinkingAnimation();
            this._setFrameFromTag(data.state);
          } else if (data.state === "presenting") {
            this.stopIdleAnimation();
            this.stopThinkingAnimation();
            this._setFrameFromTag("presenting");
          } else {
            this.stopIdleAnimation();
            this.stopThinkingAnimation();
            this.stopSuccessAnimation();
            this.stopErrorAnimation();
            this.stopLaughingAnimation();
            this.stopSurprisedAnimation();
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
      // Also chat.send so the agent receives it and can reply in Discord.
      if (this.wsClient?.isConnected && typeof this.wsClient.sendRequest === "function") {
        const params = {
          message: "[tickle]",
          idempotencyKey: `tickle-${Date.now()}`,
        };
        const tickleToDiscord = this.config?.openclaw?.tickleToDiscord !== false;
        const tickleTarget = this.config?.openclaw?.tickleDiscordChannel;
        if (tickleToDiscord) {
          params.channel = "discord";
          if (tickleTarget) params.target = tickleTarget;
        }
        this.wsClient.sendRequest("chat.send", params);
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
          const bootOv = document.getElementById("boot-black-overlay");
          const widgetOv = document.getElementById("widget-sprite-overlay");
          if (bootOv) bootOv.style.display = "none";
          if (widgetOv) widgetOv.style.display = "none";
          this.stopWaitingAnimation();
          this.updateConnectionUI(
            this.wsClient?.isConnected ? "connected" : "disconnected",
          );
          if (document.body.classList.contains("otaclaw-widget")) {
            if (typeof window.showWidgetConnectionMsg === "function")
              window.showWidgetConnectionMsg("");
            this.otaclaw.setState("idle", { speech: "" });
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
      }
      const finishWake = () => {
        document.body.classList.remove("widget-waiting");
        const bootOv = document.getElementById("boot-black-overlay");
        const widgetOv = document.getElementById("widget-sprite-overlay");
        if (bootOv) bootOv.style.display = "none";
        if (widgetOv) widgetOv.style.display = "none";
        this.stopWaitingAnimation();
        this.updateConnectionUI(
          this.wsClient?.isConnected ? "connected" : "disconnected",
        );
        if (document.body.classList.contains("otaclaw-widget")) {
          if (typeof window.showWidgetConnectionMsg === "function")
            window.showWidgetConnectionMsg("");
          this.otaclaw.setState("idle", { speech: "" });
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
        if (this.debugMode) console.log("[OtaClaw] Tab hidden");
        this.stopIdleAnimation();
      } else {
        if (this.debugMode) console.log("[OtaClaw] Tab visible");
        if (!this.isOfflineMode && this.wsClient) {
          this.wsClient.reconnectIfStale(180000);
          if (this.wsClient.isConnected) {
            this.wsClient.send({ type: "client.refresh" });
            if (this.otaclaw?.getState?.() === "idle")
              this.startIdleAnimation();
          }
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
    if (Array.isArray(frames) && frames.length && window.otaclaw?.setFrame) {
      const [col, row] = frames[Math.floor(Math.random() * frames.length)];
      const speech = this._t(tag) || "";
      window.otaclaw.setFrame(col, row, { speech });
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
        cal.setFrame(c, r, { speech: idx === 0 ? speech : "" });
      } else {
        this._setFrameDirect(c, r, idx === 0 ? speech : "");
      }
      idx += 1;
      if (idx < seq.length) {
        this._tagSeqHandle = setTimeout(schedule, frameMs);
      } else {
        this._tagSeqHandle = null;
        this.otaclaw.setState("idle", { speech: "" });
        this.startIdleAnimation();
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
  _setFrameFromSprite(filename, speech = "") {
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
    /* Widget: use main sprite (gray view + bubble) – overlay hidden after boot */
    frameEl.style.setProperty(
      "background-image",
      `url('${url}')`,
      "important",
    );
    frameEl.style.setProperty("background-size", "contain", "important");
    frameEl.style.setProperty("background-position", "center", "important");
    const isIdle = this.otaclaw?.getState?.() === "idle";
    Array.from(sprite.classList)
      .filter((c) => c.startsWith("state-"))
      .forEach((c) => sprite.classList.remove(c));
    sprite.classList.add("state-frame");
    if (isIdle) sprite.classList.add("state-idle");
    sprite.dataset.frame = filename;
    this._lastFrame = { type: "sprite", file: filename, speech };
    const st = document.getElementById("speech-text");
    const sb = document.getElementById("speech-bubble");
    if (st) st.textContent = speech;
    if (sb) sb.classList.toggle("has-text", !!speech);
  }

  /** Direct frame update using config-driven sprite metrics. */
  _setFrameDirect(col, row, speech = "") {
    if (
      document.body.classList.contains("otaclaw-widget") &&
      !window.__otaclawBootComplete
    )
      return;
    const root = document.documentElement;
    const sprite = document.getElementById("sprite");
    const frameEl = sprite?.querySelector(".otacon-frame");
    if (!sprite || !frameEl) return;
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
    root.style.setProperty("--otacon-frame-x", String(-col * fw));
    root.style.setProperty("--otacon-frame-y", String(-row * fh));
    root.style.setProperty("--otacon-frame-w", String(fw));
    root.style.setProperty("--otacon-frame-h", String(fh));
    root.style.setProperty("--otacon-sheet-w", String(sheetW));
    root.style.setProperty("--otacon-sheet-h", String(sheetH));
    root.style.setProperty("--otacon-scale", String(scale));
    const sheetRaw = this.getSpriteSheetUrl();
    const sheetUrl =
      typeof window.otaclawAssetUrl === "function"
        ? window.otaclawAssetUrl(sheetRaw)
        : sheetRaw;
    root.style.setProperty("--otacon-sheet-url", `url('${sheetUrl}')`);
    frameEl.style.backgroundImage = `url('${sheetUrl}')`;
    frameEl.style.backgroundSize = `${sheetW}px ${sheetH}px`;
    frameEl.style.setProperty(
      "background-position",
      `${-col * fw}px ${-row * fh}px`,
      "important",
    );
    Array.from(sprite.classList)
      .filter((c) => c.startsWith("state-"))
      .forEach((c) => sprite.classList.remove(c));
    sprite.classList.add("state-frame");
    sprite.dataset.frame = `${col},${row}`;
    this._lastFrame = { type: "direct", col, row, speech };
    const st = document.getElementById("speech-text");
    const sb = document.getElementById("speech-bubble");
    if (st) st.textContent = speech;
    if (sb) sb.classList.toggle("has-text", !!speech);
  }

  /** Blink overlay: single closed-eyes frame, ~80ms, runs during all states. */
  _doBlink() {
    if (
      !document.body.classList.contains("otaclaw-widget") ||
      !window.__otaclawBootComplete ||
      document.body.classList.contains("widget-asleep")
    )
      return;
    const sprite = document.getElementById("sprite");
    const frameEl = sprite?.querySelector(".otacon-frame");
    if (!frameEl) return;
    const blinkFrameIdx = Number(this.config?.sprites?.blinkFrame ?? 8);
    const blinkMs = Number(this.config?.sprites?.blinkDurationMs ?? 80);
    const idleSprites = this.config?.sprites?.idleSprites;
    const blinkFile =
      Array.isArray(idleSprites) && idleSprites[blinkFrameIdx]
        ? idleSprites[blinkFrameIdx]
        : null;
    const saved = {
      image: frameEl.style.backgroundImage,
      position: frameEl.style.backgroundPosition,
      size: frameEl.style.backgroundSize,
    };
    if (blinkFile) {
      const basePath = (
        this.config?.sprites?.basePath || "assets/sprites/"
      ).replace(/\/$/, "");
      const url =
        typeof window.otaclawAssetUrl === "function"
          ? window.otaclawAssetUrl(`${basePath}/${blinkFile}`)
          : `${basePath}/${blinkFile}`;
      frameEl.style.setProperty("background-image", `url('${url}')`, "important");
      frameEl.style.setProperty("background-size", "contain", "important");
      frameEl.style.setProperty("background-position", "center", "important");
    } else {
      const { frameW: fw, sheetW, sheetH } = this.getSpriteSheetMetrics();
      const sheetUrl =
        typeof window.otaclawAssetUrl === "function"
          ? window.otaclawAssetUrl(this.getSpriteSheetUrl())
          : this.getSpriteSheetUrl();
      frameEl.style.backgroundImage = `url('${sheetUrl}')`;
      frameEl.style.backgroundSize = `${sheetW}px ${sheetH}px`;
      frameEl.style.setProperty(
        "background-position",
        `${-blinkFrameIdx * fw}px 0px`,
        "important",
      );
    }
    this._blinkRestoreTimer = setTimeout(() => {
      this._blinkRestoreTimer = null;
      if (this._lastFrame) {
        if (this._lastFrame.type === "sprite") {
          this._setFrameFromSprite(this._lastFrame.file, this._lastFrame.speech);
        } else {
          this._setFrameDirect(
            this._lastFrame.col,
            this._lastFrame.row,
            this._lastFrame.speech,
          );
        }
      } else if (saved.image || saved.position || saved.size) {
        if (saved.image) frameEl.style.backgroundImage = saved.image;
        if (saved.position) frameEl.style.backgroundPosition = saved.position;
        if (saved.size) frameEl.style.backgroundSize = saved.size;
      }
    }, blinkMs);
  }

  startBlinkOverlay() {
    this.stopBlinkOverlay();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    const minMs = Number(this.config?.sprites?.blinkIntervalMinMs ?? 2000);
    const maxMs = Number(this.config?.sprites?.blinkIntervalMaxMs ?? 4000);
    const schedule = () => {
      if (
        !document.body.classList.contains("otaclaw-widget") ||
        document.body.classList.contains("widget-asleep")
      ) {
        this._blinkOverlayHandle = null;
        return;
      }
      this._doBlink();
      const delay = minMs + Math.random() * (maxMs - minMs);
      this._blinkOverlayHandle = setTimeout(schedule, Math.round(delay));
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
  }

  /** During connecting/reconnecting: run idle sequence with fast timing so user sees active animation. */
  startWaitingAnimation(speech = "") {
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
    const IDLE_SEQ =
      Array.isArray(sprites.idleSequence) && sprites.idleSequence.length
        ? sprites.idleSequence
        : [
            0, 0, 1, 7, 8, 9, 3, 0, 4, 1, 7, 8, 9, 0, 5, 0, 2, 6, 0, 1, 7, 8, 9,
            0,
          ];
    const groups = sprites.idleSpriteGroups || {};
    const blinkIndices = Array.isArray(sprites.idleBlinkIndices)
      ? sprites.idleBlinkIndices
      : groups.blink || [7, 8, 9];
    const useBlinkOverlay = sprites.blinkOverlay !== false;
    const seq = useBlinkOverlay
      ? IDLE_SEQ.filter((i) => !blinkIndices.includes(i))
      : IDLE_SEQ;
    const blinkDelay = Number(sprites.idleBlinkDelayMs || 50);
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
      const frameIdx = seq[idx % seq.length];
      if (IDLE_SPRITES && IDLE_SPRITES[frameIdx]) {
        this._setFrameFromSprite(IDLE_SPRITES[frameIdx], "");
      } else {
        this._setFrameDirect(frameIdx, 0, "");
      }
      idx += 1;
      const isBlink = !useBlinkOverlay && blinkIndices.includes(frameIdx);
      const delay = isBlink ? blinkDelay : baseMs + Math.random() * jitterMs;
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

  /** Idle: gentle cycle, organic timing – spaced out, random, not constant. */
  startIdleAnimation() {
    if (typeof window !== "undefined")
      window.__otaclawFallbackIdleActive = false;
    this.stopIdleAnimation();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    if (this.config?.behavior?.animations === false) {
      const idleSprites = this.config?.sprites?.idleSprites;
      if (Array.isArray(idleSprites) && idleSprites.length) {
        this._setFrameFromSprite(idleSprites[0], "");
      } else {
        this._setFrameDirect(0, 0, "");
      }
      return;
    }
    const sprites = this.config?.sprites || {};
    const IDLE_SPRITES =
      Array.isArray(sprites.idleSprites) && sprites.idleSprites.length
        ? sprites.idleSprites
        : null;
    const IDLE_SEQ =
      Array.isArray(sprites.idleSequence) && sprites.idleSequence.length
        ? sprites.idleSequence
        : IDLE_SPRITES && IDLE_SPRITES.length >= 10
          ? [
              0, 0, 1, 7, 8, 9, 3, 0, 4, 1, 7, 8, 9, 0, 5, 0, 2, 6, 0, 1, 7, 8,
              9, 0,
            ]
          : [0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 2, 0];
    const base = Number(sprites.idleBaseDelayMs || 6500);
    const jitter = Number(sprites.idleJitterMs || 4000);
    const groups = sprites.idleSpriteGroups || {};
    const phaseTiming = sprites.idlePhaseTiming || {};
    const coatIndices = Array.isArray(sprites.idleCoatIndices)
      ? sprites.idleCoatIndices
      : groups.coat || [3, 4, 5, 6];
    const coatMult = Number(sprites.idleCoatMultiplier || 1);
    const blinkDelay = Number(sprites.idleBlinkDelayMs || 50);
    const blinkIndices = Array.isArray(sprites.idleBlinkIndices)
      ? sprites.idleBlinkIndices
      : groups.blink || [7, 8, 9];
    const useBlinkOverlay = sprites.blinkOverlay !== false;
    const seq = useBlinkOverlay
      ? IDLE_SEQ.filter((i) => !blinkIndices.includes(i))
      : IDLE_SEQ;
    let idx = 0;
    const schedule = () => {
      if (!document.body.classList.contains("otaclaw-widget")) return;
      const frameIdx = seq[idx % seq.length];
      if (IDLE_SPRITES && IDLE_SPRITES[frameIdx]) {
        this._setFrameFromSprite(IDLE_SPRITES[frameIdx], "");
      } else {
        this._setFrameDirect(frameIdx, 0, "");
      }
      idx += 1;
      const isBlink = !useBlinkOverlay && blinkIndices.includes(frameIdx);
      const isCoat = coatIndices.includes(frameIdx);
      let delay;
      if (isBlink && phaseTiming.blink) {
        delay =
          Number(phaseTiming.blink.baseMs || 50) +
          Math.random() * Number(phaseTiming.blink.jitterMs || 0);
      } else if (isCoat && phaseTiming.coat) {
        delay =
          Number(phaseTiming.coat.baseMs || base) +
          Math.random() * Number(phaseTiming.coat.jitterMs || jitter);
      } else if (!isBlink && phaseTiming.neutral) {
        delay =
          Number(phaseTiming.neutral.baseMs || base) +
          Math.random() * Number(phaseTiming.neutral.jitterMs || jitter);
      } else {
        delay = isBlink ? blinkDelay : base + Math.random() * jitter;
        if (isCoat) delay *= coatMult;
      }
      if (!isBlink && !phaseTiming.neutral && !phaseTiming.coat)
        delay *= 0.7 + Math.random() * 0.6;
      this._idleAnimationHandle = setTimeout(schedule, Math.round(delay));
    };
    schedule();
  }

  stopIdleAnimation() {
    if (this._idleAnimationHandle) {
      clearTimeout(this._idleAnimationHandle);
      this._idleAnimationHandle = null;
    }
    // Remove state-frame so container's state (thinking/processing/etc) applies to sprite
    const sprite = document.getElementById("sprite");
    if (sprite) sprite.classList.remove("state-frame");
  }

  _scheduleSleep() {
    this._cancelSleep();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    const ms = Number(this.config?.behavior?.sleepIdleMs || 180000);
    if (ms <= 0) return;
    this._sleepTimer = setTimeout(() => {
      this._sleepTimer = null;
      this.stopIdleAnimation();
      this.stopBlinkOverlay();
      if (typeof window.runSleepSequence === "function") {
        window.runSleepSequence();
      }
    }, ms);
  }

  _cancelSleep() {
    if (this._sleepTimer) {
      clearTimeout(this._sleepTimer);
      this._sleepTimer = null;
    }
  }

  /**
   * Run sheet-mode sequence from frame-catalog when sprite arrays are empty.
   * @param {string} stateName - thinking, processing, success, error, laughing, surprised
   * @param {string} speech - speech bubble text
   * @param {string} handleKey - e.g. _thinkingAnimationHandle
   */
  _runSheetSequence(stateName, speech, handleKey) {
    const assetUrl =
      typeof window.otaclawAssetUrl === "function"
        ? (p) => window.otaclawAssetUrl(p)
        : (p) => p;
    fetch(assetUrl("data/frame-catalog.json"))
      .then((r) => r.json())
      .then((catalog) => {
        const seq = catalog?.sequences?.[stateName];
        if (!Array.isArray(seq) || seq.length === 0) return;
        let idx = 0;
        const schedule = () => {
          if (!document.body.classList.contains("otaclaw-widget")) return;
          if ((this.otaclaw?.getState?.() || "") !== stateName) return;
          const [col, row] = seq[idx % seq.length];
          const st = document.getElementById("speech-text");
          const text =
            stateName === "success"
              ? st?.textContent || this._t("success")
              : stateName === "error"
                ? st?.textContent || ""
                : idx === 0
                  ? speech || this._t(stateName) || ""
                  : "";
          this._setFrameDirect(col, row, text);
          const frameMs = this._getFrameMs(stateName, idx, 400);
          idx += 1;
          this[handleKey] = setTimeout(schedule, frameMs);
        };
        schedule();
      })
      .catch(() => {});
  }

  /** Thinking: contemplative wait. Processing: active generation. Uses processingSprites/Sequence when state is processing, else thinkingSprites/Sequence. Falls back to frame-catalog sequences when no sprites. */
  startThinkingAnimation() {
    this.stopThinkingAnimation();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    const state = this.otaclaw?.getState?.() || "";
    const isProcessing = state === "processing";
    const procSprites = this.config?.sprites?.processingSprites;
    const thinkSprites = this.config?.sprites?.thinkingSprites;
    const sprites =
      isProcessing && Array.isArray(procSprites) && procSprites.length
        ? procSprites
        : thinkSprites;
    if (!Array.isArray(sprites) || sprites.length === 0) {
      this._runSheetSequence(
        isProcessing ? "processing" : "thinking",
        "",
        "_thinkingAnimationHandle",
      );
      return;
    }
    const procSeq = this.config?.sprites?.processingSequence;
    const thinkSeq = this.config?.sprites?.thinkingSequence;
    const seq =
      isProcessing && Array.isArray(procSeq) && procSeq.length
        ? procSeq
        : Array.isArray(thinkSeq) && thinkSeq.length
          ? thinkSeq
          : [0, 1, 0, 1, 2, 1, 0];
    const stateName = isProcessing ? "processing" : "thinking";
    let idx = 0;
    const schedule = () => {
      if (!document.body.classList.contains("otaclaw-widget")) return;
      const cur = this.otaclaw?.getState?.() || "";
      if (cur !== "thinking" && cur !== "processing") return;
      const useProc =
        cur === "processing" &&
        Array.isArray(procSprites) &&
        procSprites.length;
      const spr = useProc ? procSprites : sprites;
      const seqUse =
        useProc && Array.isArray(procSeq) && procSeq.length ? procSeq : seq;
      const frameIdx = seqUse[idx % seqUse.length];
      const file = spr[frameIdx];
      if (file) this._setFrameFromSprite(file, "");
      const frameMs = this._getFrameMs(stateName, idx, 400);
      idx += 1;
      this._thinkingAnimationHandle = setTimeout(schedule, frameMs);
    };
    schedule();
  }

  stopThinkingAnimation() {
    if (this._thinkingAnimationHandle) {
      clearTimeout(this._thinkingAnimationHandle);
      this._thinkingAnimationHandle = null;
    }
  }

  /** Success: thumbs-up micro sequence. Preserves speech bubble (Got it!). Uses successSequence when set, else successSprites. Falls back to frame-catalog when no sprites. */
  startSuccessAnimation() {
    this.stopSuccessAnimation();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    const seqConfig = this.config?.sprites?.successSequence;
    const sprites =
      Array.isArray(seqConfig?.sprites) && seqConfig.sprites.length
        ? seqConfig.sprites
        : this.config?.sprites?.successSprites;
    if (!Array.isArray(sprites) || sprites.length === 0) {
      this._runSheetSequence("success", this._t("success"), "_successAnimationHandle");
      return;
    }
    const frameMsArr = seqConfig?.frameMs;
    let idx = 0;
    const schedule = () => {
      if (!document.body.classList.contains("otaclaw-widget")) return;
      if ((this.otaclaw?.getState?.() || "") !== "success") return;
      const st = document.getElementById("speech-text");
      const speech = st?.textContent || this._t("success");
      this._setFrameFromSprite(sprites[idx % sprites.length], speech);
      const frameMs = Array.isArray(frameMsArr) && frameMsArr.length
        ? (frameMsArr[idx % frameMsArr.length] ?? frameMsArr[0] ?? 400)
        : this._getFrameMs("success", idx, 400);
      idx += 1;
      this._successAnimationHandle = setTimeout(schedule, frameMs);
    };
    schedule();
  }

  stopSuccessAnimation() {
    if (this._successAnimationHandle) {
      clearTimeout(this._successAnimationHandle);
      this._successAnimationHandle = null;
    }
  }

  /** Error: ¯\_(ツ)_/¯ shrug – 2 frames. Preserves speech bubble (brief reason). Falls back to frame-catalog when no sprites. */
  startErrorAnimation() {
    this.stopErrorAnimation();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    const sprites = this.config?.sprites?.errorSprites;
    if (!Array.isArray(sprites) || sprites.length === 0) {
      const st = document.getElementById("speech-text");
      this._runSheetSequence("error", st?.textContent || "", "_errorAnimationHandle");
      return;
    }
    let idx = 0;
    const schedule = () => {
      if (!document.body.classList.contains("otaclaw-widget")) return;
      if ((this.otaclaw?.getState?.() || "") !== "error") return;
      const st = document.getElementById("speech-text");
      const speech = st?.textContent || "";
      this._setFrameFromSprite(sprites[idx % sprites.length], speech);
      const frameMs = this._getFrameMs("error", idx, 500);
      idx += 1;
      this._errorAnimationHandle = setTimeout(schedule, frameMs);
    };
    schedule();
  }

  stopErrorAnimation() {
    if (this._errorAnimationHandle) {
      clearTimeout(this._errorAnimationHandle);
      this._errorAnimationHandle = null;
    }
  }

  /** Surprised: blushing / losing color – 5 frames, 2.5s total. Falls back to frame-catalog when no sprites. */
  startSurprisedAnimation() {
    this.stopSurprisedAnimation();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    const sprites = this.config?.sprites?.surprisedSprites;
    if (!Array.isArray(sprites) || sprites.length === 0) {
      this._runSheetSequence("surprised", "", "_surprisedAnimationHandle");
      return;
    }
    const cfg =
      typeof window !== "undefined" ? window.OTACLAW_CONFIG : this.config;
    const DURATION = cfg?.stateDurations?.surprised ?? 2500;
    const defaultMs = Math.max(300, DURATION / sprites.length);
    let idx = 0;
    const schedule = () => {
      if (!document.body.classList.contains("otaclaw-widget")) return;
      if ((this.otaclaw?.getState?.() || "") !== "surprised") return;
      this._setFrameFromSprite(sprites[idx % sprites.length], "");
      const frameMs = this._getFrameMs("surprised", idx, defaultMs);
      idx += 1;
      this._surprisedAnimationHandle = setTimeout(schedule, frameMs);
    };
    schedule();
  }

  stopSurprisedAnimation() {
    if (this._surprisedAnimationHandle) {
      clearTimeout(this._surprisedAnimationHandle);
      this._surprisedAnimationHandle = null;
    }
  }

  stopLaughingAnimation() {
    if (this._laughHandle) {
      clearTimeout(this._laughHandle);
      this._laughHandle = null;
    }
    if (this._laughEnd) {
      clearTimeout(this._laughEnd);
      this._laughEnd = null;
    }
  }

  /** Laughing: laugh micro sequence (tickle), ~400ms per frame, 4s total.
   * Prefer laughingSprites (individual PNGs) when available – otaclock-original.png
   * is gitignored and not shipped, so sheet-based laughing would 404 and Hal disappears. */
  startLaughingAnimation() {
    this.stopLaughingAnimation();
    this.stopIdleAnimation();
    this.stopThinkingAnimation();
    this.stopSuccessAnimation();
    this.stopErrorAnimation();
    this.stopSurprisedAnimation();
    if (!document.body.classList.contains("otaclaw-widget")) return;
    const sprites = this.config?.sprites?.laughingSprites;
    const cfg =
      typeof window !== "undefined" ? window.OTACLAW_CONFIG : this.config;
    const DURATION = cfg?.stateDurations?.laughing ?? 4000;
    if (Array.isArray(sprites) && sprites.length) {
      let idx = 0;
      const schedule = () => {
        if (!document.body.classList.contains("otaclaw-widget")) return;
        if ((this.otaclaw?.getState?.() || "") !== "laughing") return;
        this._setFrameFromSprite(
          sprites[idx % sprites.length],
          this._t("laughing"),
        );
        const frameMs = this._getFrameMs("laughing", idx, 400);
        idx += 1;
        this._laughHandle = setTimeout(schedule, frameMs);
      };
      schedule();
      this._laughEnd = setTimeout(() => {
        if (this._laughHandle) clearTimeout(this._laughHandle);
        this._laughHandle = null;
        this._laughEnd = null;
        if (document.body.classList.contains("widget-waiting")) return;
        this.otaclaw.setState("idle", { speech: "" });
        this.startIdleAnimation();
      }, DURATION);
      return;
    }
    const LAUGH_SEQ = [
      [2, 3],
      [3, 3],
    ];
    const defaultMs = Math.max(200, DURATION / (LAUGH_SEQ.length * 2));
    let idx = 0;
    const schedule = () => {
      if (!document.body.classList.contains("otaclaw-widget")) return;
      if ((this.otaclaw?.getState?.() || "") !== "laughing") return;
      const [col, row] = LAUGH_SEQ[idx % LAUGH_SEQ.length];
      const cal = window.otaclaw;
      if (cal?.setFrame) {
        cal.setFrame(col, row, { speech: this._t("laughing") });
      } else {
        this._setFrameDirect(col, row, this._t("laughing"));
      }
      const frameMs = this._getFrameMs("laughing", idx, defaultMs);
      idx += 1;
      this._laughHandle = setTimeout(schedule, frameMs);
    };
    schedule();
    this._laughEnd = setTimeout(() => {
      if (this._laughHandle) clearTimeout(this._laughHandle);
      this._laughHandle = null;
      this._laughEnd = null;
      if (document.body.classList.contains("widget-waiting")) return;
      this.otaclaw.setState("idle", { speech: "" });
      this.startIdleAnimation();
    }, DURATION);
  }

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
          : this._t("configRequired");
      if (msg) msg.textContent = text;
    }
  }

  /**
   * Handle WebSocket events and map to states
   */
  handleWebSocketEvent() {}

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
                console.error("[OtaClaw] emotions demo failed:", e);
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
      console.log("[OtaClaw] Running in offline/demo mode");
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
        start: () => this.startThinkingAnimation(),
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
