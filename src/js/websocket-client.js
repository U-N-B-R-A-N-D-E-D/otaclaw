/**
 * OtaClaw for OpenClaw - WebSocket Client
 * Handles connection to OpenClaw Gateway and event routing
 * Config passed from app (window.OTACLAW_CONFIG or config.js)
 */

export class WebSocketClient {
  constructor(config) {
    this.config = config;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.connectionTimeout = null;
    this.heartbeatTimer = null;
    this.lastReceivedAt = 0;
    this.maxQueuedMessages = Math.max(
      10,
      Number(this.config?.openclaw?.maxQueuedMessages || 120),
    );
    this.queueDropCount = 0;
    this.isConnected = false;
    this.isConnecting = false;
    this.messageQueue = [];
    this.eventHandlers = new Map();
    this.startTime = Date.now();
    this.connectRequestId = null;
    this.requestCounter = 0;
    this._lastEmittedState = null;
    this._lastEventType = null;
    this._lastEventAt = 0;
    this._deltaBatch = [];
    this._deltaBatchTimer = null;

    // Bind methods
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.reconnect = this.reconnect.bind(this);
    this.send = this.send.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onOpen = this.onOpen.bind(this);
    this.onClose = this.onClose.bind(this);
    this.onError = this.onError.bind(this);
  }

  /**
   * Build WebSocket URL from configuration
   */
  getWebSocketUrl() {
    let { host, port, wsPath } = this.config.openclaw;
    if (host === "auto" || !host)
      host =
        typeof window !== "undefined" ? window.location.hostname : "localhost";
    const protocol =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss:"
        : "ws:";
    return `${protocol}//${host}:${port}${wsPath}`;
  }

  /**
   * Establish WebSocket connection to OpenClaw
   */
  connect() {
    if (this.isConnecting || this.isConnected) {
      this.log("warn", "Connection already in progress or established");
      return Promise.resolve();
    }

    this.isConnecting = true;
    this.emit("connecting");

    const wsUrl = this.getWebSocketUrl();
    this.log("info", `Connecting to OpenClaw at ${wsUrl}`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        /* Tunnel (localhost) can add latency; use 20s when connecting via localhost */
        const baseCt = Number(this.config.openclaw.connectionTimeout) || 10000;
        const isLocalhost =
          typeof window !== "undefined" &&
          (window.location?.hostname === "localhost" ||
            window.location?.hostname === "127.0.0.1");
        const ct = isLocalhost ? Math.max(baseCt, 20000) : baseCt;
        this.connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            this.ws.close();
            this.isConnecting = false;
            reject(new Error("Connection timeout"));
          }
        }, ct);

        // WebSocket event handlers
        this.ws.onopen = () => this.onOpen(resolve);
        this.ws.onmessage = this.onMessage;
        this.ws.onclose = this.onClose;
        this.ws.onerror = this.onError;
      } catch (error) {
        this.isConnecting = false;
        this.log("error", "Failed to create WebSocket:", error);
        reject(error);
      }
    });
  }

  /**
   * Handle successful connection
   */
  onOpen(resolve) {
    clearTimeout(this.connectionTimeout);
    this.isConnected = true;
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    this.log("info", "Connected to OpenClaw Gateway");
    this.emit("connected");

    // Send any queued messages
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
    this.queueDropCount = 0;

    // Send protocol-v3 handshake (OpenClaw >= 2026.2.x)
    this.sendConnectFrame();

    this.lastReceivedAt = Date.now();
    this.startHeartbeat();

    if (resolve) resolve();
  }

  /**
   * Handle incoming messages
   */
  onMessage(event) {
    this.lastReceivedAt = Date.now();
    try {
      const data = JSON.parse(event.data);
      this.log("debug", "Received message:", data);

      if (data?.type === "res") {
        this.emit("response", data);
        if (data.id === this.connectRequestId && data.ok === false) {
          this.log(
            "warn",
            `Gateway connect rejected: ${data?.error?.message || "unknown error"}`,
          );
        }
        return;
      }

      let normalized = data;
      if (data?.type === "event" && typeof data?.event === "string") {
        if (data.event === "connect.challenge") {
          this.log("debug", "Received connect challenge event");
          return;
        }
        if (
          data.event === "agent" &&
          data.payload &&
          typeof data.payload === "object"
        ) {
          const stream =
            typeof data.payload.stream === "string" ? data.payload.stream : "";
          const phase =
            typeof data.payload?.data?.phase === "string"
              ? data.payload.data.phase
              : "";
          let mappedType = "agent";
          if (stream === "assistant") mappedType = "agent.message.delta";
          else if (stream === "tool") mappedType = "agent.tool.call";
          else if (stream === "error") mappedType = "agent.message.error";
          else if (stream === "lifecycle") {
            if (phase === "start") mappedType = "agent.message.start";
            else if (phase === "end") mappedType = "agent.message.complete";
            else if (phase === "error") mappedType = "agent.message.error";
          }
          normalized = {
            ...data.payload,
            type: mappedType,
            _event: data.event,
          };
        } else if (
          data.event === "chat" &&
          data.payload &&
          typeof data.payload === "object"
        ) {
          const state =
            typeof data.payload.state === "string" ? data.payload.state : "";
          let mappedType = "chat";
          if (state === "delta") mappedType = "agent.message.delta";
          else if (state === "final") mappedType = "agent.message.complete";
          else if (state === "error") mappedType = "agent.message.error";
          normalized = {
            ...data.payload,
            type: mappedType,
            _event: data.event,
          };
        } else if (
          data.payload &&
          typeof data.payload === "object" &&
          typeof data.payload.type === "string"
        ) {
          normalized = data.payload;
        } else if (
          data.event === "session.start" ||
          data.event === "session.end" ||
          data.event === "channel.connected" ||
          data.event === "channel.disconnected" ||
          data.event === "easter.konami" ||
          data.event === "easter.grayfox" ||
          data.event === "easter.panic" ||
          data.event === "easter.codec" ||
          data.event === "command.codec"
        ) {
          normalized = { type: data.event, data: data.payload };
        } else {
          normalized = { type: data.event, data: data.payload };
        }
      }

      // Check for special commands in message content
      if (data.payload?.message || data.payload?.content) {
        const command = this._detectSpecialCommand(
          data.payload.message || data.payload.content
        );
        if (command) {
          normalized.type = command;
        }
      }

      // Batch agent.message.delta to reduce DOM thrash (configurable)
      const deltaBatchMs = Number(this.config?.openclaw?.deltaBatchMs) || 0;
      if (
        deltaBatchMs > 0 &&
        normalized.type === "agent.message.delta"
      ) {
        this._deltaBatch.push(normalized);
        if (!this._deltaBatchTimer) {
          this._deltaBatchTimer = setTimeout(() => {
            this._flushDeltaBatch();
          }, deltaBatchMs);
        }
        return;
      }

      // Emit raw message event
      this.emit("message", normalized);

      // Handle specific event types
      if (normalized.type) {
        this._lastEventType = normalized.type;
        this._lastEventAt = Date.now();
        this.emit(normalized.type, normalized);
        this.handleOpenClawEvent(normalized);
      }
    } catch (error) {
      this.log("error", "Failed to parse message:", error);
      this.emit("parseError", { error, rawData: event.data });
    }
  }

  /**
   * Flush batched agent.message.delta events as a single batch
   */
  _flushDeltaBatch() {
    this._deltaBatchTimer = null;
    if (this._deltaBatch.length === 0) return;
    const batch = this._deltaBatch;
    this._deltaBatch = [];
    const merged = {
      type: "agent.message.delta",
      _batched: true,
      _count: batch.length,
      ...batch[batch.length - 1],
    };
    this._lastEventType = merged.type;
    this._lastEventAt = Date.now();
    this.emit("message", merged);
    this.emit(merged.type, merged);
    this.handleOpenClawEvent(merged);
  }

  /**
   * Handle OpenClaw-specific events and map to OtaClaw states
   */
  handleOpenClawEvent(data) {
    // Handle easter egg triggers (bot sends event + payload; normalization may put payload in data.data)
    if (data.type === 'easter.trigger' || data.event === 'easter.trigger') {
      const payload = data.payload || data.data || {};
      const easterEgg = payload.easterEgg || data.easterEgg;
      if (easterEgg) {
        this.emit(`easter.${easterEgg}`, payload);
      }
      return;
    }
    
    const eventMap = this.config.eventMap || {};
    const eventType = data.type;

    // Check if this event maps to a state
    const state = eventMap[eventType] ?? eventMap["*"];
    if (state) {
      const eventPriority = this.config.eventPriority || {};
      const priority = eventPriority[eventType] ?? eventPriority["*"] ?? 0;
      this._lastEmittedState = state;
      this.emit("stateChange", {
        state,
        trigger: eventType,
        data,
        priority,
      });
    } else if (
      typeof eventType === "string" &&
      (eventType.includes("agent") ||
        eventType.includes("gateway") ||
        eventType.includes("discord"))
    ) {
      // Unmapped event; no state change
    }

    // Handle specific event patterns
    switch (eventType) {
      case "agent.message.start":
        this.emit("agentStart", data);
        break;

      case "agent.message.delta":
        this.emit("agentDelta", data);
        break;

      case "agent.message.complete":
        this.emit("agentComplete", data);
        // Auto-return to idle after configured duration
        this.scheduleIdleReturn();
        break;

      case "agent.message.error":
        this.emit("agentError", data);
        this.scheduleIdleReturn();
        break;

      case "agent.tool.call":
        this.emit("toolCall", data);
        this.scheduleIdleReturn();
        break;

      case "gateway.idle":
        this.emit("gatewayIdle", data);
        break;

      case "gateway.error":
        this.emit("gatewayError", data);
        this.scheduleIdleReturn();
        break;

      case "session.start":
        this.emit("sessionStart", data);
        break;
      case "session.end":
        this.emit("sessionEnd", data);
        break;
      case "channel.connected":
        this.emit("channelConnected", data);
        break;
      case "channel.disconnected":
        this.emit("channelDisconnected", data);
        break;
      case "client.interaction":
        this.emit("clientInteraction", data);
        break;

      case "command.codec":
      case "easter.codec":
        this.emit("codecCommand", data);
        break;
    }
  }

  /**
   * Check for special commands in message content
   * @param {string} content - Message text
   * @returns {string|null} Command type or null
   */
  _detectSpecialCommand(content) {
    if (!content) return null;

    const lower = content.toLowerCase().trim();

    // Codec mode toggle
    if (lower === '!codec' || lower === '/codec') {
      return 'command.codec';
    }

    // Other easter eggs can be added here
    if (lower === '!konami' || lower === 'konami code') {
      return 'easter.konami';
    }

    return null;
  }

  /**
   * Schedule return to idle state after configured duration
   */
  scheduleIdleReturn() {
    const currentState = this._lastEmittedState;
    if (!currentState) return;

    const durations = this.config.stateDurations || {};
    const duration = durations[currentState];

    if (duration && duration > 0) {
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        this.emit("stateChange", {
          state: "idle",
          trigger: "timeout",
          previousState: currentState,
        });
      }, duration);
    }
  }

  /**
   * Handle connection close
   */
  onClose(event) {
    clearTimeout(this.connectionTimeout);
    this.stopHeartbeat();
    this.isConnected = false;
    this.isConnecting = false;

    this.log("warn", `Connection closed: ${event.code} ${event.reason}`);
    this.emit("disconnected", { code: event.code, reason: event.reason });

    // Attempt reconnection if not intentionally closed
    if (event.code !== 1000 && event.code !== 1001) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle connection errors
   */
  onError(error) {
    this.log("error", "WebSocket error:", error);
    this.emit("error", error);
  }

  /**
   * Schedule reconnection attempt with exponential backoff and jitter
   * Improves UX by preventing thundering herd and providing visual feedback
   */
  scheduleReconnect() {
    const {
      reconnectInterval,
      maxReconnectAttempts,
      reconnectBackoff,
      maxBackoffMs,
      offlineAfterReconnects,
    } = this.config.openclaw || {};

    if (
      maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= maxReconnectAttempts
    ) {
      this.log("error", "Max reconnection attempts reached");
      this.emit("maxReconnectReached");
      this.emit("offlineSuggested");
      return;
    }

    this.reconnectAttempts++;

    // Calculate delay with exponential backoff
    let delay = Number(reconnectInterval) || 5000;
    if (reconnectBackoff) {
      const cap = Math.max(delay, Number(maxBackoffMs) || 60000);
      delay = Math.min(delay * Math.pow(2, this.reconnectAttempts - 1), cap);
    }

    // Add jitter (±25%) to prevent thundering herd
    const jitter = delay * 0.25;
    delay = delay + (Math.random() * jitter * 2 - jitter);
    delay = Math.round(delay);

    // Emit offline suggestion after threshold
    if (
      offlineAfterReconnects > 0 &&
      this.reconnectAttempts >= offlineAfterReconnects
    ) {
      this.emit("offlineSuggested");
    }

    this.log(
      "info",
      `Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`,
    );

    // Emit detailed reconnection event for UI feedback
    this.emit("reconnecting", {
      attempt: this.reconnectAttempts,
      maxAttempts: maxReconnectAttempts,
      delay,
      progress: this._calculateReconnectProgress(maxReconnectAttempts),
      message: this._getReconnectMessage(this.reconnectAttempts),
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  /**
   * Calculate reconnect progress percentage
   */
  _calculateReconnectProgress(maxAttempts) {
    if (!maxAttempts || maxAttempts <= 0) return 0;
    return Math.min((this.reconnectAttempts / maxAttempts) * 100, 95);
  }

  /**
   * Get user-friendly reconnect message
   */
  _getReconnectMessage(attempt) {
    const messages = [
      'Reconnecting...',
      'Connection lost. Retrying...',
      'Still reconnecting...',
      'Having trouble connecting...',
      'Attempting to reconnect...',
    ];
    return messages[Math.min(attempt - 1, messages.length - 1)];
  }

  /**
   * Heartbeat: detect stale connections (e.g. after hours, TCP half-open).
   * Sends client.refresh every 30s; if no message received in 90s, force reconnect.
   */
  startHeartbeat() {
    this.stopHeartbeat();
    const INTERVAL_MS = Math.max(
      10000,
      Number(this.config?.openclaw?.heartbeatInterval || 45000),
    );
    const STALE_MS = Math.max(
      INTERVAL_MS * 2,
      Number(this.config?.openclaw?.staleThreshold || 120000),
    );
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected || !this.ws) return;
      if (
        this.messageQueue.length > 0 &&
        this.config?.logging?.level === "debug"
      ) {
        this.log("debug", `Queue size: ${this.messageQueue.length}`);
      }
      const elapsed = Date.now() - this.lastReceivedAt;
      if (elapsed > STALE_MS) {
        this.log(
          "warn",
          `No message for ${Math.round(elapsed / 1000)}s – forcing reconnect`,
        );
        this.reconnect();
        return;
      }
      this.send({ type: "client.refresh" });
    }, INTERVAL_MS);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Force reconnect if no message received in the last maxAgeMs (e.g. when tab becomes visible after background).
   */
  reconnectIfStale(maxAgeMs = 60000) {
    if (!this.isConnected || !this.ws) return;
    if (Date.now() - this.lastReceivedAt > maxAgeMs) {
      this.log("info", "Tab visible but connection stale – reconnecting");
      this.reconnect();
    }
  }

  /**
   * Get auth token. URL param (runtime) preferred over config (default).
   * Never log or expose the token.
   */
  getAuthToken() {
    if (typeof window !== "undefined") {
      try {
        const p = new URLSearchParams(window.location.search);
        const queryToken =
          p.get("oc_token") ||
          p.get("openclaw_token") ||
          p.get("gateway_token");
        if (queryToken && queryToken.trim()) return queryToken.trim();
      } catch {}
    }
    const configToken = this.config?.openclaw?.authToken;
    if (typeof configToken === "string" && configToken.trim())
      return configToken.trim();
    return "";
  }

  sendConnectFrame() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    const protocolVersion = Math.max(
      1,
      Number(this.config?.openclaw?.protocolVersion || 3),
    );
    const authToken = this.getAuthToken();
    const frame = {
      type: "req",
      id: `otaclaw-connect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      method: "connect",
      params: {
        minProtocol: protocolVersion,
        maxProtocol: protocolVersion,
        client: {
          id: "webchat",
          displayName: "OtaClaw Widget",
          version: "1.0.0",
          platform:
            typeof navigator !== "undefined" && navigator.platform
              ? navigator.platform
              : "browser",
          mode: "webchat",
        },
        userAgent:
          typeof navigator !== "undefined" && navigator.userAgent
            ? navigator.userAgent
            : "otaclaw",
        scopes: ["operator.read", "operator.write"],
        ...(authToken ? { auth: { token: authToken } } : {}),
      },
    };
    this.connectRequestId = frame.id;
    try {
      this.ws.send(JSON.stringify(frame));
      return true;
    } catch (error) {
      this.log("error", "Failed to send connect frame:", error);
      return false;
    }
  }

  sendRequest(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    const request = {
      type: "req",
      id: `otaclaw-${method}-${Date.now()}-${++this.requestCounter}`,
      method,
      params,
    };
    try {
      this.ws.send(JSON.stringify(request));
      return true;
    } catch (error) {
      this.log("error", `Failed to send request frame (${method}):`, error);
      return false;
    }
  }

  /**
   * Keep queue bounded to avoid unbounded memory growth while offline.
   */
  enqueueMessage(message) {
    if (this.messageQueue.length >= this.maxQueuedMessages) {
      this.messageQueue.shift();
      this.queueDropCount += 1;
    }
    this.messageQueue.push(message);
  }

  /**
   * Reconnect to WebSocket
   */
  reconnect() {
    this.log("info", "Attempting to reconnect...");
    this.disconnect();
    this.connect().catch((error) => {
      this.log("error", "Reconnection failed:", error);
      this.scheduleReconnect();
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.connectionTimeout);
    clearTimeout(this.idleTimer);
    clearTimeout(this._deltaBatchTimer);
    this._deltaBatchTimer = null;
    this._deltaBatch = [];
    this.stopHeartbeat();

    if (this.ws) {
      // Remove event handlers to prevent reconnection attempts
      this.ws.onclose = null;
      this.ws.onerror = null;

      if (this.isConnected) {
        this.ws.close(1000, "Client disconnect");
      }

      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this._lastEmittedState = null;
    this.emit("disconnected", { code: 1000, reason: "Client disconnect" });
  }

  /**
   * Send message to OpenClaw
   */
  send(message) {
    if (message && typeof message === "object") {
      if (message.type === "client.connect") {
        return this.sendConnectFrame();
      }
      if (message.type === "client.refresh" || message.type === "client.ping") {
        // Gateway rejects this call for current webchat scope; avoid noisy INVALID_REQUEST loop.
        return true;
      }
    }

    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }

    if (!this.isConnected) {
      this.log("warn", "Not connected, queuing message");
      this.enqueueMessage(message);
      return false;
    }

    try {
      this.ws.send(message);
      this.log("debug", "Sent message:", message);
      return true;
    } catch (error) {
      this.log("error", "Failed to send message:", error);
      this.enqueueMessage(message);
      return false;
    }
  }

  /**
   * Subscribe to events
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe from events
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
   * Emit event to all subscribers
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
   * Get connection statistics (for debug panel).
   * Config is returned with auth token redacted.
   */
  getStats() {
    const staleThreshold = Number(
      this.config?.openclaw?.staleThreshold || 120000,
    );
    const staleSince =
      this._lastEventAt > 0 && Date.now() - this._lastEventAt > staleThreshold
        ? this._lastEventAt
        : null;
    const cfg = { ...this.config?.openclaw };
    if (cfg.authToken) cfg.authToken = "[REDACTED]";
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      uptime: this.isConnected ? Date.now() - this.startTime : 0,
      queuedMessages: this.messageQueue.length,
      lastEvent: this._lastEventType,
      lastEventAt: this._lastEventAt,
      staleSince,
      config: cfg,
    };
  }

  /**
   * Logging helper
   */
  log(level, ...args) {
    const configLevel = this.config.logging?.level || "info";
    const levels = ["debug", "info", "warn", "error"];

    if (levels.indexOf(level) >= levels.indexOf(configLevel)) {
      const prefix = `[OtaClaw WebSocket ${level.toUpperCase()}]`;
      console[level === "debug" ? "log" : level](prefix, ...args);
    }
  }
}

// Export singleton instance for global access
export const wsClient = new WebSocketClient();

// Also export class for custom instances
export default WebSocketClient;
