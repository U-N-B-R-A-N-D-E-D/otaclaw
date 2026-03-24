/**
 * OtaClaw for OpenClaw - Emotional State Engine
 * Manages OtaClaw's emotional states and animations
 * Config passed from app (window.OTACLAW_CONFIG or config.js)
 */

export class OtaClawEngine {
  constructor(config) {
    this.config = config;
    this.currentState = "idle";
    this.previousState = null;
    this.stateTimer = null;
    this.eventHandlers = new Map();
    this.spriteElement = null;
    this.containerElement = null;
    this.isInitialized = false;
    this.soundsEnabled = false;
    this.audioContext = null;

    // State history for debugging
    this.stateHistory = [];
    this.maxHistoryLength = 50;

    // Bind methods
    this.init = this.init.bind(this);
    this.setState = this.setState.bind(this);
    this.getState = this.getState.bind(this);
    this.getPreviousState = this.getPreviousState.bind(this);
    this.transitionTo = this.transitionTo.bind(this);
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.emit = this.emit.bind(this);
  }

  /**
   * Initialize OtaClaw engine
   */
  init() {
    if (this.isInitialized) {
      this.log("warn", "OtaClaw already initialized");
      return;
    }

    // Get DOM elements
    this.spriteElement = document.getElementById("sprite");
    this.containerElement = document.getElementById("otaclaw");

    if (!this.spriteElement || !this.containerElement) {
      this.log("error", "Required DOM elements not found");
      return;
    }

    // Apply initial state
    this.applyState("idle");

    // Setup touch interactions if enabled
    if (this.config.behavior.touchEnabled) {
      this.setupTouchInteractions();
    }

    // Setup keyboard shortcuts for debug
    this.setupKeyboardShortcuts();

    // Initialize audio if sounds enabled
    if (this.config.behavior.sounds) {
      this.initAudio();
    }

    this.isInitialized = true;
    this.log("info", "OtaClaw engine initialized");
    this.emit("initialized");
  }

  /**
   * Set up touch/tap interactions
   * Tickle = swipe over Hal (sprite area). Tap = single touch, thinking state.
   */
  setupTouchInteractions() {
    const touchOverlay = document.getElementById("touch-overlay");
    const target = touchOverlay || document.body;
    /* Use document capture so we catch ALL touches on Pi – overlay may not receive them */
    const docOpts = { passive: true, capture: true };

    let lastTap = 0;
    let lastTickleTime = 0;
    const TICKLE_IGNORE_CLICK_MS = 500;
    const TICKLE_DEBOUNCE_MS = 1500;
    const SWIPE_MIN_PX = 20;
    const SWIPE_MAX_MS = 1800;
    const SWIPE_SPRITE_MARGIN = 0.25;
    const swipeEnabled = this.config.touch?.swipeEnabled !== false;
    const isWidget = document.body.classList.contains("otaclaw-widget");
    let swipeStart = null;

    function isOverSprite(x, y) {
      /* Use container (full face area) in widget – more forgiving than sprite rect on touchscreens */
      const container = document.querySelector(".otaclaw-container");
      const sprite = document.getElementById("sprite");
      const el = container || sprite;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const m = SWIPE_SPRITE_MARGIN * Math.min(r.width, r.height);
      return (
        x >= r.left - m &&
        x <= r.right + m &&
        y >= r.top - m &&
        y <= r.bottom + m
      );
    }

    function onTap(e) {
      const now = Date.now();
      if (now - lastTickleTime < TICKLE_IGNORE_CLICK_MS) return;
      
      // Double tap detection for tickle
      if (now - lastTap < 600) {
        lastTap = 0; // reset
        lastTickleTime = now;
        this.emit("tickle", { x: e.clientX, y: e.clientY });
        return;
      }
      
      lastTap = now;

      this.emit("tap", { x: e.clientX, y: e.clientY });
      this.setState("thinking");
      clearTimeout(this._tapReturnTimer);
      this._tapReturnTimer = setTimeout(() => {
        if (this.currentState === "thinking") {
          this.setState("idle");
        }
      }, 1000);
    }

    // eslint-disable-next-line no-unused-vars -- reserved for tap debounce
    let lastTouchTime = 0;
    const handleTap = (e) => {
      const ev = e.changedTouches?.[0] || e;
      onTap.call(this, ev);
    };

    const opts = { passive: true };
    function checkSwipeEnd(x, y) {
      if (!swipeEnabled || !swipeStart) return false;
      const now = Date.now();
      if (now - lastTickleTime < TICKLE_DEBOUNCE_MS) {
        swipeStart = null;
        return false;
      }
      const dx = x - swipeStart.x;
      const dy = y - swipeStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const elapsed = now - swipeStart.t;
      const midX = (swipeStart.x + x) / 2;
      const midY = (swipeStart.y + y) / 2;
      const overSprite =
        isWidget ||
        isOverSprite(midX, midY) ||
        isOverSprite(swipeStart.x, swipeStart.y) ||
        isOverSprite(x, y);
      if (dist >= SWIPE_MIN_PX && elapsed <= SWIPE_MAX_MS && overSprite) {
        swipeStart = null;
        lastTickleTime = now;
        this.emit("tickle", { x: midX, y: midY });
        return true;
      }
      swipeStart = null;
      return false;
    }

    document.addEventListener(
      "touchstart",
      (e) => {
        lastTouchTime = Date.now();
        const t = e.touches?.[0];
        if (swipeEnabled && t) swipeStart = { x: t.clientX, y: t.clientY, t: Date.now() };
      },
      docOpts,
    );
    document.addEventListener(
      "touchend",
      (e) => {
        lastTouchTime = Date.now();
        const t = e.changedTouches?.[0];
        if (t && checkSwipeEnd.call(this, t.clientX, t.clientY)) return;
        handleTap(e);
      },
      docOpts,
    );
    target.addEventListener("mousedown", (e) => {
      if (swipeEnabled && e.button === 0) swipeStart = { x: e.clientX, y: e.clientY, t: Date.now() };
    }, opts);
    target.addEventListener("pointerdown", (e) => {
      if (swipeEnabled && e.button === 0) swipeStart = { x: e.clientX, y: e.clientY, t: Date.now() };
    }, opts);
    target.addEventListener("click", (e) => {
      handleTap(e);
    }, opts);
    target.addEventListener("mouseup", (e) => {
      if (e.button === 0 && checkSwipeEnd.call(this, e.clientX, e.clientY)) return;
      handleTap(e);
    }, opts);
    target.addEventListener("pointerup", (e) => {
      if (checkSwipeEnd.call(this, e.clientX, e.clientY)) return;
      handleTap(e);
    }, opts);
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0 && checkSwipeEnd.call(this, e.clientX, e.clientY)) return;
      handleTap(e);
    }, docOpts);
    document.addEventListener("click", (e) => {
      handleTap(e);
    }, docOpts);
    document.addEventListener("pointerup", (e) => {
      if (checkSwipeEnd.call(this, e.clientX, e.clientY)) return;
      handleTap(e);
    }, docOpts);

    // Long press for debug (skip in widget – display-tools handles hold-to-settings)
    if (!document.body.classList.contains("otaclaw-widget")) {
      let longPressTimer;
      target.addEventListener("mousedown", () => {
        longPressTimer = setTimeout(() => {
          this.toggleDebugPanel();
        }, this.config.touch?.longPressDuration || 800);
      });
      target.addEventListener("mouseup", () => clearTimeout(longPressTimer));
      target.addEventListener("touchstart", () => {
        longPressTimer = setTimeout(() => {
          this.toggleDebugPanel();
        }, this.config.touch?.longPressDuration || 800);
      });
      target.addEventListener("touchend", () => clearTimeout(longPressTimer));
    }
  }

  /**
   * Setup keyboard shortcuts
   */
  setupKeyboardShortcuts() {
    this._boundKeyHandler = (e) => {
      // 'd' key toggles debug panel
      if (e.key === "d" && this.config.behavior.debug) {
        this.toggleDebugPanel();
      }

      // Number keys 1-7 trigger states for testing
      if (this.config.behavior.debug) {
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
          this.setState(stateMap[e.key]);
        }
      }
    };
    document.addEventListener("keydown", this._boundKeyHandler);
  }

  /**
   * Initialize audio context for sounds
   */
  initAudio() {
    try {
      this.audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();
      this.soundsEnabled = true;
      this.log("info", "Audio initialized");
    } catch (error) {
      this.log("warn", "Could not initialize audio:", error);
      this.soundsEnabled = false;
    }
  }

  /**
   * Play sound for current state
   */
  playStateSound(state) {
    if (!this.soundsEnabled || !this.audioContext) return;

    const soundConfig = this.config.sounds?.files?.[state];
    if (!soundConfig) return;

    // Resume audio context if suspended (browser policy)
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }

    const basePath = (
      this.config?.sounds?.basePath || "assets/sounds/"
    ).replace(/\/$/, "");
    const url = `${basePath}/${soundConfig}`;
    const audio = new Audio(url);
    const vol = Number(this.config?.sounds?.volume ?? 0.5);
    audio.volume = Math.max(0, Math.min(1, vol));
    audio.play().catch(() => {});
  }

  /**
   * Set OtaClaw emotional state
   */
  setState(newState, options = {}) {
    // Validate state
    const validStates = this.config.states || [
      "idle",
      "thinking",
      "processing",
      "success",
      "error",
      "laughing",
      "surprised",
    ];

    if (!validStates.includes(newState)) {
      this.log("error", `Invalid state: ${newState}`);
      return false;
    }

    // Don't change if already in this state (unless forced)
    if (this.currentState === newState && !options.force) {
      return false;
    }

    // Store previous state
    this.previousState = this.currentState;
    this.currentState = newState;

    // Record in history
    this.addToHistory({
      state: newState,
      previousState: this.previousState,
      timestamp: Date.now(),
      trigger: options.trigger || "manual",
      data: options.data || {},
    });

    // Apply the state
    this.applyState(newState, options);

    // Play sound if enabled
    if (this.config.behavior.sounds) {
      this.playStateSound(newState);
    }

    // Auto-return to idle after duration (if configured)
    this.scheduleIdleReturn(newState);

    // Emit state change event
    this.emit("stateChange", {
      state: newState,
      previousState: this.previousState,
      timestamp: Date.now(),
      trigger: options.trigger,
      data: options.data,
      speech: options.speech,
    });

    this.log("info", `State changed: ${this.previousState} -> ${newState}`);
    return true;
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Get previous state
   */
  getPreviousState() {
    return this.previousState;
  }

  /**
   * Apply state to DOM
   */
  applyState(state, options = {}) {
    if (!this.containerElement) return;

    const prev = this.containerElement.dataset.prevState;
    const BREATHE = ["idle", "thinking"];
    const toBreathe = BREATHE.includes(state);
    const fromBreathe = prev && BREATHE.includes(prev);
    const useTransition = toBreathe && (fromBreathe || !prev);

    const allStates =
      this.config.states ||
      [
        "idle",
        "thinking",
        "processing",
        "success",
        "error",
        "laughing",
        "surprised",
        "curious",
        "confused",
        "excited",
      ];
    allStates.forEach((s) =>
      this.containerElement.classList.remove(`state-${s}`),
    );
    this.containerElement.classList.remove("state-transition-in");

    if (useTransition)
      this.containerElement.classList.add("state-transition-in");
    this.containerElement.classList.add("state-transition");
    this.containerElement.classList.add(`state-${state}`);
    this.containerElement.dataset.prevState = state;

    if (useTransition) {
      setTimeout(
        () => this.containerElement.classList.remove("state-transition-in"),
        450,
      );
    }
    setTimeout(() => {
      this.containerElement?.classList.remove("state-transition");
    }, 250);

    // Update speech bubble if options.speech provided
    // Skip if streaming is active (preserves LLM text being typed)
    const speechText = document.getElementById("speech-text");
    const speechBubble = document.getElementById("speech-bubble");
    const isStreaming = window.__otaclawStreamingActive === true;
    
    if (options.speech !== undefined && speechText && speechBubble && !isStreaming) {
      speechText.textContent = options.speech;
      speechBubble.classList.toggle("has-text", !!options.speech);
    }

    // Update state badge if exists
    const stateBadge = document.getElementById("current-state");
    if (stateBadge) {
      stateBadge.textContent = state;
      stateBadge.setAttribute("data-state", state);
    }

    // Update debug panel if visible
    this.updateDebugPanel();

    // Handle state-specific animations
    this.handleStateAnimation(state, options);
  }

  /**
   * Handle state-specific animation logic
   */
  handleStateAnimation(state, _options) {
    if (this.config?.behavior?.lowPowerMode) return;
    // State-specific logic can be extended here
    switch (state) {
      case "success":
        // Flash effect
        this.flashScreen("rgba(34, 197, 94, 0.3)");
        break;

      case "error":
        // Shake effect
        this.shakeElement();
        break;

      case "surprised":
        // Pop effect
        this.popElement();
        break;
    }
  }

  /**
   * Flash screen with color
   */
  flashScreen(color, duration = 300) {
    const flash = document.createElement("div");
    flash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: ${color};
      pointer-events: none;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.1s;
    `;

    document.body.appendChild(flash);

    requestAnimationFrame(() => {
      flash.style.opacity = "1";
      setTimeout(() => {
        flash.style.opacity = "0";
        setTimeout(() => flash.remove(), 100);
      }, duration);
    });
  }

  /**
   * Shake sprite element
   */
  shakeElement() {
    if (!this.spriteElement) return;

    this.spriteElement.style.animation = "none";
    requestAnimationFrame(() => {
      this.spriteElement.style.animation = "error-shake 0.5s ease-in-out";
    });
  }

  /**
   * Pop element (scale up then down)
   */
  popElement() {
    if (!this.spriteElement) return;

    this.spriteElement.style.transform = "scale(1.2)";
    setTimeout(() => {
      this.spriteElement.style.transform = "scale(1)";
    }, 200);
  }

  /**
   * Schedule return to idle after state duration.
   * For thinking/processing: use agentResponseTimeoutMs so we don't freeze when OpenClaw times out.
   * Supports stateChaining: e.g. success → presenting (500ms) → idle.
   */
  scheduleIdleReturn(state) {
    clearTimeout(this.stateTimer);

    const durations = this.config.stateDurations || {};
    let duration = durations[state];
    const fallbackMs = Number(
      this.config?.behavior?.agentResponseTimeoutMs || 35000,
    );
    const useErrorOnTimeout = ["thinking", "processing"].includes(state);

    if (!duration && useErrorOnTimeout && fallbackMs > 0) {
      duration = fallbackMs;
    }
    if (duration && duration > 0) {
      const chain = this.config.stateChaining?.[state];
      const targetState = useErrorOnTimeout ? "error" : "idle";
      const opts = { trigger: "timeout", previousState: state };
      if (targetState === "error")
        opts.speech = this.config?.i18n?.timeout ?? "Timeout";
      this.stateTimer = setTimeout(() => {
        if (this.currentState !== state) return;
        if (chain?.next && chain.duration > 0 && !useErrorOnTimeout) {
          this.setState(chain.next, { trigger: "stateChain", previousState: state });
          clearTimeout(this.stateTimer);
          this.stateTimer = setTimeout(() => {
            if (this.currentState === chain.next) {
              this.setState("idle", { trigger: "timeout", previousState: chain.next });
            }
          }, chain.duration);
        } else {
          this.setState(targetState, opts);
        }
      }, duration);
    }
  }

  /**
   * Transition to new state with animation
   */
  transitionTo(newState, transitionDuration = 300) {
    if (!this.spriteElement) return;

    this.spriteElement.classList.add("state-transition");
    this.spriteElement.style.opacity = "0.5";

    setTimeout(() => {
      this.setState(newState, { force: true });
      this.spriteElement.style.opacity = "1";
      setTimeout(() => {
        this.spriteElement.classList.remove("state-transition");
      }, transitionDuration);
    }, transitionDuration);
  }

  /**
   * Add entry to state history
   */
  addToHistory(entry) {
    this.stateHistory.unshift(entry);

    if (this.stateHistory.length > this.maxHistoryLength) {
      this.stateHistory.pop();
    }
  }

  /**
   * Get state history
   */
  getHistory() {
    return [...this.stateHistory];
  }

  /**
   * Clear state history
   */
  clearHistory() {
    this.stateHistory = [];
  }

  /**
   * Toggle debug panel visibility
   */
  toggleDebugPanel() {
    const debugPanel = document.getElementById("debug-panel");
    if (debugPanel) {
      debugPanel.classList.toggle("hidden");
      this.updateDebugPanel();
    }
  }

  /**
   * Update debug panel content
   */
  updateDebugPanel() {
    const debugState = document.getElementById("debug-state");
    const debugEvent = document.getElementById("debug-event");
    const debugUptime = document.getElementById("debug-uptime");
    const debugConnectionSection = document.getElementById(
      "debug-connection-section",
    );
    const showConnectionMetrics = this.config?.openclaw?.debugPanel !== false;
    if (debugConnectionSection) {
      debugConnectionSection.classList.toggle("hidden", !showConnectionMetrics);
    }

    if (debugState) {
      debugState.textContent = this.currentState;
    }

    if (debugEvent && this.stateHistory.length > 0) {
      const lastEvent = this.stateHistory[0];
      debugEvent.textContent = `${lastEvent.trigger} (${new Date(lastEvent.timestamp).toLocaleTimeString()})`;
    }

    if (debugUptime) {
      const uptime = Math.floor(
        (Date.now() - (this.startTime || Date.now())) / 1000,
      );
      debugUptime.textContent = `${uptime}s`;
    }

    if (showConnectionMetrics && window.wsClient) {
      const stats = window.wsClient.getStats();
      const lastEventType = document.getElementById("debug-last-event-type");
      const reconnectAttempts = document.getElementById(
        "debug-reconnect-attempts",
      );
      const queuedMessages = document.getElementById("debug-queued-messages");
      const staleSince = document.getElementById("debug-stale-since");
      if (lastEventType) lastEventType.textContent = stats.lastEvent || "-";
      if (reconnectAttempts)
        reconnectAttempts.textContent = String(stats.reconnectAttempts);
      if (queuedMessages)
        queuedMessages.textContent = String(stats.queuedMessages);
      if (staleSince)
        staleSince.textContent = stats.staleSince
          ? new Date(stats.staleSince).toLocaleTimeString()
          : "-";
    }
  }

  /**
   * Event subscription
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);

    return () => this.off(event, handler);
  }

  /**
   * Event unsubscription
   */
  off(event, handler) {
    if (!this.eventHandlers.has(event)) return;

    const handlers = this.eventHandlers.get(event);
    const index = handlers.indexOf(handler);

    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit event
   */
  emit(event, data) {
    if (!this.eventHandlers.has(event)) return;

    const handlers = this.eventHandlers.get(event);
    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        this.log("error", `Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return {
      currentState: this.currentState,
      previousState: this.previousState,
      isInitialized: this.isInitialized,
      soundsEnabled: this.soundsEnabled,
      historyLength: this.stateHistory.length,
      config: {
        states: this.config.states,
        behavior: this.config.behavior,
      },
    };
  }

  /**
   * Destroy engine and cleanup
   */
  destroy() {
    // Clear all timers
    clearTimeout(this.stateTimer);
    clearTimeout(this._tapReturnTimer);
    clearTimeout(this._transitionTimer);
    clearTimeout(this._flashTimer1);
    clearTimeout(this._flashTimer2);
    clearTimeout(this._popTimer);

    // Remove event listeners
    if (this._boundKeyHandler) {
      document.removeEventListener("keydown", this._boundKeyHandler);
      this._boundKeyHandler = null;
    }

    // Clean up DOM references
    this.eventHandlers.clear();
    this.stateHistory = [];
    this.isInitialized = false;

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.log("info", "OtaClaw engine destroyed");
  }

  /**
   * Logging helper
   */
  log(level, ...args) {
    const configLevel = this.config.logging?.level || "info";
    const levels = ["debug", "info", "warn", "error"];

    if (levels.indexOf(level) >= levels.indexOf(configLevel)) {
      const prefix = `[OtaClaw Engine ${level.toUpperCase()}]`;
      console[level === "debug" ? "log" : level](prefix, ...args);
    }
  }
}

// Export singleton instance
export const otaclaw = new OtaClawEngine();

// Also export class for custom instances
export default OtaClawEngine;
