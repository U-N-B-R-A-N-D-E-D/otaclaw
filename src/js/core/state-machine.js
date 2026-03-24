/**
 * StateMachine - Centralized emotional state management
 *
 * Encapsulates all state transition logic that was previously scattered
 * throughout the codebase. Provides predictable, testable state transitions.
 *
 * ## State Flow
 * ```
 * idle ←→ thinking → processing → success → idle
 *   ↑      ↓              ↓          ↓
 *   └──── error ←──────────┴──────────┘
 *
 * Interrupts (higher priority):
 * - tool.call → surprised → thinking
 * - user.tap → thinking
 * - tickle → laughing → idle
 * ```
 *
 * ## Usage
 * ```javascript
 * const sm = new StateMachine(config, {
 *   onStateChange: (from, to, context) => updateUI(from, to),
 *   onAnimationStart: (state) => animator.start(state),
 * });
 *
 * sm.transition('thinking', { trigger: 'agent.start' });
 * sm.transition('success', { trigger: 'agent.complete' });
 * ```
 */

export class StateMachine {
  constructor(config, callbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;

    this.currentState = 'idle';
    this.previousState = null;
    this.history = [];
    this.maxHistory = 50;

    // Timer references for auto-return
    this._returnTimer = null;

    // Activity tracking
    this._lastActivityTime = Date.now();
    this._inactivityThreshold = 45000; // 45s

    // Setup inactivity monitor
    this._startInactivityMonitor();
  }

  /**
   * Get list of valid states from config
   */
  getValidStates() {
    return this.config?.states || [
      'idle', 'thinking', 'processing', 'success', 'error',
      'laughing', 'surprised', 'curious', 'confused', 'excited',
      'worried', 'sad', 'presenting'
    ];
  }

  /**
   * Check if a state is valid
   */
  isValidState(state) {
    return this.getValidStates().includes(state);
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
   * Main transition method
   * @param {string} newState - Target state
   * @param {Object} context - Transition context
   * @param {string} context.trigger - What triggered this transition
   * @param {Object} context.data - Additional data
   * @param {string} context.speech - Speech bubble text
   * @param {boolean} context.force - Force transition even if same state
   * @returns {boolean} Whether transition occurred
   */
  transition(newState, context = {}) {
    const { trigger, data, speech, force = false } = context;

    // Validate state
    if (!this.isValidState(newState)) {
      console.error(`[StateMachine] Invalid state: ${newState}`);
      return false;
    }

    // Skip if same state (unless forced)
    if (this.currentState === newState && !force) {
      return false;
    }

    // Record activity
    this._lastActivityTime = Date.now();

    // Store previous state
    this.previousState = this.currentState;
    this.currentState = newState;

    // Add to history
    this._addToHistory({
      state: newState,
      previousState: this.previousState,
      trigger,
      data,
      speech,
      timestamp: Date.now(),
    });

    // Clear existing return timer
    this._clearReturnTimer();

    // Handle special transition logic
    this._handleSpecialTransitions(newState, context);

    // Schedule auto-return if needed
    this._scheduleAutoReturn(newState, context);

    // Notify callbacks
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(this.previousState, newState, context);
    }

    // Start animation for new state
    if (this.callbacks.onAnimationStart) {
      this.callbacks.onAnimationStart(newState, speech);
    }

    return true;
  }

  /**
   * Handle special transition cases
   */
  _handleSpecialTransitions(state, context) {
    // Tool call interrupt: surprised briefly, then return to thinking
    if (state === 'surprised' && context.trigger === 'tool.call') {
      const prev = this.previousState;
      if (prev === 'thinking' || prev === 'processing') {
        const duration = this.config?.stateDurations?.surprised || 2500;
        this._returnTimer = setTimeout(() => {
          if (this.currentState === 'surprised') {
            this.transition('thinking', {
              trigger: 'tool.return',
              speech: this._t('thinking'),
            });
          }
        }, duration);
      }
    }

    // State chaining: success → presenting → idle
    const chain = this.config?.stateChaining?.[state];
    if (chain?.next && chain.duration > 0) {
      this._returnTimer = setTimeout(() => {
        if (this.currentState === chain.next) {
          this.transition('idle', {
            trigger: 'chain.complete',
            previousState: chain.next,
          });
        }
      }, chain.duration);
    }
  }

  /**
   * Schedule automatic return to idle
   */
  _scheduleAutoReturn(state, context) {
    // States that don't auto-return
    const persistentStates = ['idle', 'thinking', 'processing'];
    if (persistentStates.includes(state)) return;

    // Get duration for this state
    const durations = this.config?.stateDurations || {};
    let duration = durations[state];

    // For thinking/processing timeout fallback
    if (!duration && ['thinking', 'processing'].includes(context.previousState)) {
      duration = this.config?.behavior?.agentResponseTimeoutMs || 35000;
    }

    // Calculate dynamic duration based on speech text length
    if (context.speech) {
      duration = this._calculateDurationFromText(context.speech, duration);
    }

    if (!duration || duration <= 0) return;

    this._returnTimer = setTimeout(() => {
      if (this.currentState !== state) return;

      const targetState = ['thinking', 'processing'].includes(state) ? 'error' : 'idle';
      const opts = { trigger: 'timeout', previousState: state };

      if (targetState === 'error') {
        opts.speech = this.config?.i18n?.timeout || 'Timeout';
      }

      this.transition(targetState, opts);
    }, duration);
  }

  /**
   * Calculate state duration based on speech text length
   * Ensures users have enough time to read the bubble
   */
  _calculateDurationFromText(text, defaultDuration) {
    if (!text || text.length === 0) return defaultDuration;

    // Base reading speed: ~200ms per word (average 5 chars per word)
    const words = text.trim().split(/\s+/).length;
    const readingTime = words * 250; // 250ms per word for comfortable reading

    // Minimum and maximum bounds
    const minTime = Math.max(defaultDuration || 2000, 2000);
    const maxTime = 10000; // Max 10 seconds

    // Add buffer for short texts, use reading time for longer texts
    const calculated = Math.max(readingTime, minTime);

    return Math.min(calculated, maxTime);
  }

  /**
   * Clear auto-return timer
   */
  _clearReturnTimer() {
    if (this._returnTimer) {
      clearTimeout(this._returnTimer);
      this._returnTimer = null;
    }
  }

  /**
   * Start inactivity monitoring
   */
  _startInactivityMonitor() {
    // Check every 5 seconds for inactivity
    this._inactivityInterval = setInterval(() => {
      const elapsed = Date.now() - this._lastActivityTime;

      if (elapsed > this._inactivityThreshold) {
        // Force return to idle if stuck in non-idle state
        if (this.currentState !== 'idle' && this.currentState !== 'sleeping') {
          console.log(`[StateMachine] Inactivity timeout, forcing idle (was ${this.currentState})`);
          this.transition('idle', {
            trigger: 'inactivity.timeout',
            force: true,
          });
        }
      }
    }, 5000);
  }

  /**
   * Add entry to history
   */
  _addToHistory(entry) {
    this.history.unshift(entry);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }
  }

  /**
   * Get state history
   */
  getHistory(limit = 10) {
    return this.history.slice(0, limit);
  }

  /**
   * Get event priority (for conflict resolution)
   */
  getEventPriority(eventType) {
    const priorities = this.config?.eventPriority || {};
    return priorities[eventType] || priorities['*'] || 0;
  }

  /**
   * Check if event should override current state
   */
  shouldOverride(eventType) {
    const eventPriority = this.getEventPriority(eventType);

    // Get current state's priority (based on what triggered it)
    const lastEntry = this.history[0];
    const currentPriority = lastEntry
      ? this.getEventPriority(lastEntry.trigger)
      : 0;

    return eventPriority >= currentPriority;
  }

  /**
   * Handle user tap interaction
   */
  onTap() {
    if (this.currentState === 'idle') {
      this.transition('thinking', {
        trigger: 'user.tap',
        speech: this._t('thinking'),
      });

      // Auto-return after brief delay
      setTimeout(() => {
        if (this.currentState === 'thinking') {
          this.transition('idle', { trigger: 'tap.timeout' });
        }
      }, 1000);

      return true;
    }
    return false;
  }

  /**
   * Handle tickle interaction
   */
  onTickle(position) {
    this.transition('laughing', {
      trigger: 'user.tickle',
      speech: this._t('laughing'),
      data: { position },
    });

    // Auto-return after duration
    const duration = this.config?.stateDurations?.laughing || 4000;
    setTimeout(() => {
      if (this.currentState === 'laughing') {
        this.transition('idle', { trigger: 'tickle.end' });
      }
    }, duration);

    return true;
  }

  /**
   * Handle WebSocket events
   */
  handleEvent(eventType, data = {}) {
    // Check priority
    if (!this.shouldOverride(eventType)) {
      return false;
    }

    // Map event to state
    const eventMap = this.config?.eventMap || {};
    const targetState = eventMap[eventType];

    if (!targetState) {
      return false;
    }

    // Determine speech based on state
    const speech = this._getSpeechForState(targetState, data);

    return this.transition(targetState, {
      trigger: eventType,
      data,
      speech,
    });
  }

  /**
   * Get appropriate speech for a state
   */
  _getSpeechForState(state, data) {
    // Error states: extract brief reason
    if (state === 'error' && data) {
      return this._briefErrorReason(data);
    }

    // Standard states: use i18n
    const standardSpeech = {
      thinking: this._t('thinking'),
      processing: this._t('processing'),
      success: this._t('success'),
      surprised: this._t('surprised'),
      laughing: this._t('laughing'),
      curious: this._t('curious'),
      confused: this._t('confused'),
      excited: this._t('excited'),
    };

    return standardSpeech[state] || '';
  }

  /**
   * Extract brief error reason
   */
  _briefErrorReason(data) {
    const t = (k) => this._t(k);

    if (!data) return t('error');

    const msg = data.error?.message ??
      data.message ??
      data.error ??
      data.reason ??
      (typeof data === 'string' ? data : '');

    if (!msg) return t('error');

    const s = String(msg).toLowerCase();

    if (s.includes('listener') && s.includes('timeout')) return t('listenerTimeout');
    if (s.includes('embedded run timeout')) return t('runTimeout');
    if (s.includes('connection') || s.includes('econnrefused')) return t('connectionError');
    if (s.includes('timeout') || s.includes('timed out')) return t('timeout');
    if (s.includes('network')) return t('networkError');
    if (s.includes('reject') || s.includes('refused')) return t('rejected');

    return String(msg).length > 28
      ? String(msg).slice(0, 25) + '…'
      : String(msg);
  }

  /**
   * i18n helper
   */
  _t(key) {
    const fallbacks = {
      thinking: 'Hmmm....',
      processing: 'Processing',
      success: 'Got it!',
      error: 'Oops...',
      laughing: 'Haha!',
      surprised: 'Woah!',
      curious: 'Hmm?',
      confused: 'Huh?',
      excited: 'Wow!',
      worried: 'Hmm...',
      presenting: 'Ta-da!',
      timeout: 'Timeout',
      listenerTimeout: 'Listener timeout',
      connectionError: 'Connection error',
      networkError: 'Network error',
      rejected: 'Rejected',
      idle: '',
    };

    const val = this.config?.i18n?.[key] ??
      this.config?.personalities?.[this.config?.personality]?.[key] ??
      fallbacks[key] ??
      key;

    return Array.isArray(val)
      ? val[Math.floor(Math.random() * val.length)]
      : val;
  }

  /**
   * Clean up all resources - Memory leak prevention
   * Clears timers, intervals, and releases references
   */
  destroy() {
    // Clear auto-return timer
    this._clearReturnTimer();

    // Clear inactivity monitoring
    if (this._inactivityInterval) {
      clearInterval(this._inactivityInterval);
      this._inactivityInterval = null;
    }

    // Clear state history to free memory
    this.history = [];

    // Clear callbacks to prevent detached references
    this.onStateChange = null;
    this.onAnimationStart = null;

    // Clear config reference
    this.config = null;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      currentState: this.currentState,
      previousState: this.previousState,
      historyCount: this.history.length,
      lastActivity: this._lastActivityTime,
      timeSinceActivity: Date.now() - this._lastActivityTime,
    };
  }
}

export default StateMachine;
