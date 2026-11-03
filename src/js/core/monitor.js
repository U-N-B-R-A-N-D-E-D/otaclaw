// OtaclawMonitor - minimal logging/metrics system

/**
 * Level‑0: console (always active)
 * Level‑1: in‑memory metrics (optional)
 * Level‑2: export helpers (debug only)
 * Level‑3: remote endpoint (optional)
 */
export class OtaclawMonitor {
  /**
   * @param {object} config – configuration object (OTACLAW_CONFIG.monitoring if present)
   */
  constructor(config = {}) {
    this.configure(config);
  }

  /**
   * Apply (or re-apply) configuration. Safe to call after init when the real
   * OTACLAW_CONFIG becomes available.
   */
  configure(config = {}) {
    // Configuration defaults – keep optional & lightweight
    const defaultCfg = {
      console: true,
      metrics: false,
      remote: false,
      remoteEndpoint: null,
      batchInterval: 5000,
      logLevel: "info",
    };
    this.cfg = { ...defaultCfg, ...(config.monitoring || {}) };

    // In‑memory store – created only when enabled
    if (this.cfg.metrics && !this.metrics) {
      this.metrics = {
        connection: { uptime: 0, reconnects: 0, lastEvent: null, startedAt: Date.now() },
        emotions: { transitions: 0, current: "idle", history: [] },
        performance: { fps: 0, memoryUsage: 0 },
      };
    } else if (!this.cfg.metrics) {
      this.metrics = null;
    }

    // Stop previous remote timer if reconfiguring
    if (this.remoteTimer) { clearInterval(this.remoteTimer); this.remoteTimer = null; }
    this.remoteQueue = this.remoteQueue || [];
    if (this.cfg.remote && this.cfg.remoteEndpoint) {
      this._setupRemoteBatch();
    }
  }

  /** Low‑overhead console wrapper obeying logLevel */
  _log(level, ...args) {
    const levels = ["debug", "info", "warn", "error"];
    const cfgLevel = this.cfg.logLevel || "info";
    if (levels.indexOf(level) >= levels.indexOf(cfgLevel) && this.cfg.console) {
      const prefix = `[OtaClaw ${level.toUpperCase()}]`;
      // Use console.log for debug to keep ordering of args
      console[level === "debug" ? "log" : level](prefix, ...args);
    }
  }

  // Public API mirrors the design in the user request
  log(event, data = {}) {
    this._log("info", `[${event}]`, data);
    if (this.metrics) {
      this.metrics.connection.lastEvent = { event, at: Date.now() };
    }
    this.queueRemote({ level: "info", event, data, at: Date.now() });
  }
  error(event, data = {}) {
    this._log("error", `[${event}]`, data);
    this.queueRemote({ level: "error", event, data, at: Date.now() });
  }
  warn(event, data = {}) {
    this._log("warn", `[${event}]`, data);
    this.queueRemote({ level: "warn", event, data, at: Date.now() });
  }
  debug(event, data = {}) {
    this._log("debug", `[${event}]`, data);
  }

  /** Record a state transition – cheap no‑op when metrics are off */
  recordTransition(from, to, trigger) {
    if (!this.metrics) return;
    this.metrics.emotions.transitions += 1;
    this.metrics.emotions.current = to;
    this.metrics.emotions.history.push({ from, to, trigger, at: Date.now() });
    // Bound history to avoid memory growth on long sessions
    if (this.metrics.emotions.history.length > 50) {
      this.metrics.emotions.history.shift();
    }
  }

  /** Increment reconnect counter */
  recordReconnect() {
    if (!this.metrics) return;
    this.metrics.connection.reconnects += 1;
  }

  /** Update in‑memory metrics – no‑op if metrics disabled */
  recordMetric(category, key, value) {
    if (!this.metrics) return;
    if (!this.metrics[category]) this.metrics[category] = {};
    this.metrics[category][key] = value;
  }

  /** Queue a remote payload – will be sent in batches */
  queueRemote(payload) {
    if (!this.cfg.remote || !this.cfg.remoteEndpoint) return;
    this.remoteQueue.push(payload);
  }

  /** Internal – start batch timer for remote flushing */
  _setupRemoteBatch() {
    this.remoteTimer = setInterval(() => {
      if (this.remoteQueue.length === 0) return;
      const batch = this.remoteQueue.splice(0, this.remoteQueue.length);
      fetch(this.cfg.remoteEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      }).catch(() => {}); // fire‑and‑forget – avoid breaking production
    }, this.cfg.batchInterval);
  }

  /** Export current in‑memory metrics as JSON – used by debug panels */
  toJSON() { return this.cfg.metrics ? JSON.stringify(this.metrics, null, 2) : "{}"; }

  /** Pretty-print metrics to console (debug helper) */
  dumpToConsole() {
    if (!this.metrics) {
      console.log("[OtaClaw Monitor] metrics disabled (config.monitoring.metrics = false)");
      return;
    }
    console.log("[OtaClaw Monitor] snapshot");
    console.table(this.metrics.connection);
    console.table(this.metrics.emotions);
    console.table(this.metrics.performance);
  }

  /** Get a shallow snapshot for debug panels (safe to mutate caller-side) */
  snapshot() {
    return this.metrics ? JSON.parse(JSON.stringify(this.metrics)) : null;
  }

  /** Optional cleanup – stop remote timer */
  dispose() { if (this.remoteTimer) clearInterval(this.remoteTimer); }
}

// Export a singleton for easy import – respects optional config via global OTACLAW_CONFIG
export const otaclawMonitor = new OtaclawMonitor(globalThis?.OTACLAW_CONFIG || {});
