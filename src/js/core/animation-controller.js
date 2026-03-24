/**
 * AnimationController - Centralized sprite animation management
 *
 * Encapsulates all sprite/animation logic that was previously scattered
 * throughout app.js. Provides clean state-based animation control.
 *
 * ## Architecture
 * - Each state (idle, thinking, success, etc.) has its own animation strategy
 * - Token-based race condition prevention
 * - Automatic cleanup when switching states
 * - Frame catalog integration for semantic tag-based animation
 *
 * ## Usage
 * ```javascript
 * const animator = new AnimationController(config, timerManager);
 * animator.setFrameCallback((col, row, speech) => updateSprite(col, row, speech));
 *
 * // Start state animations
 * animator.startIdle();
 * animator.startThinking();
 * animator.startSuccess();
 *
 * // Stop all animations
 * animator.stopAll();
 * ```
 */

import { TimerManager } from './timer-manager.js';

export class AnimationController {
  constructor(config, timerManager) {
    this.config = config;
    this.timers = timerManager || new TimerManager();

    // Frame catalog for semantic animation
    this._frameCatalog = null;
    this._loadFrameCatalog();

    // Current animation tracking
    this._currentState = 'idle';
    this._currentToken = null;
    this._accumulatedText = '';
    this._emotionLock = null;

    // Callback for frame updates
    this._frameCallback = null;

    // Performance optimization for Pi 60fps
    this._rafId = null;              // requestAnimationFrame ID
    this._pendingFrameUpdate = null; // Buffered frame update
    this._lastFrameTime = 0;         // Last frame timestamp
    this._minFrameInterval = 1000 / 30; // Cap at 30fps (smooth on Pi)

    // Preloaded metrics
    this._metrics = this._getSpriteSheetMetrics();

    // Individual sprite sequences configuration
    this._individualSequences = this._buildIndividualSequences();

    // Overlay effects state
    this._activeOverlay = null;
    this._overlayTimer = null;

    // Blink state
    this._blinkEnabled = true;
    this._nextBlinkDelay = 3000;

    // Error tracking
    this._consecutiveErrors = 0;

    // Bind RAF methods
    this._scheduleFrameUpdate = this._scheduleFrameUpdate.bind(this);
  }

  /**
   * Set callback for frame updates
   * @param {Function} callback - (col, row, speech) => void
   */
  setFrameCallback(callback) {
    this._frameCallback = callback;
  }

  /**
   * Load frame catalog for semantic animations
   */
  async _loadFrameCatalog() {
    try {
      const assetUrl = typeof window?.otaclawAssetUrl === 'function'
        ? window.otaclawAssetUrl
        : (p) => p;

      const response = await fetch(assetUrl('data/frame-catalog.json?v=15'));
      this._frameCatalog = await response.json();
    } catch {
      // Catalog is optional - fallbacks exist
      this._frameCatalog = null;
    }
  }

  /**
   * Get sprite sheet metrics from config
   */
  _getSpriteSheetMetrics() {
    const sprites = this.config?.sprites || {};
    return {
      sheetW: Number(sprites.sheetWidth || 567),
      sheetH: Number(sprites.sheetHeight || 278),
      frameW: Number(sprites.cellWidth || 47),
      frameH: Number(sprites.cellHeight || 70),
    };
  }

  /**
   * Build individual sprite sequences configuration
   * Maps emotion states to individual sprite sequences for expressive animations
   */
  _buildIndividualSequences() {
    const basePath = (this.config?.sprites?.basePath || 'assets/sprites/').replace(/\/$/, '');

    return {
      // Success: thumbs-up celebration (7 frames)
      success: {
        sprites: [
          `${basePath}/otacon_sprite_thumbs_00.png`,
          `${basePath}/otacon_sprite_thumbs_01.png`,
          `${basePath}/otacon_sprite_thumbs_02.png`,
          `${basePath}/otacon_sprite_thumbs_03.png`,
          `${basePath}/otacon_sprite_thumbs_04.png`,
          `${basePath}/otacon_sprite_thumbs_05.png`,
          `${basePath}/otacon_sprite_thumbs_06.png`,
        ],
        frameMs: 150,
        loop: false,
        returnToSheet: true,
      },

      // Laughing: laugh animation (3 frames)
      laughing: {
        sprites: [
          `${basePath}/otacon_sprite_laugh_00.png`,
          `${basePath}/otacon_sprite_laugh_01.png`,
          `${basePath}/otacon_sprite_laugh_02.png`,
        ],
        frameMs: 200,
        loop: true,
        returnToSheet: false,
      },

      // Thinking deep: thinking animation (3 frames)
      // Used after 10+ seconds of thinking
      thinkingDeep: {
        sprites: [
          `${basePath}/otacon_sprite_think_00.png`,
          `${basePath}/otacon_sprite_think_01.png`,
          `${basePath}/otacon_sprite_think_02.png`,
        ],
        frameMs: 800,
        loop: true,
        returnToSheet: false,
      },

      // Shrug: when confused/unsure
      confused: {
        sprites: [
          `${basePath}/otacon_sprite_shrug_00.png`,
          `${basePath}/otacon_sprite_shrug_01.png`,
        ],
        frameMs: 600,
        loop: false,
        returnToSheet: true,
      },

      // Frustrated: when errors repeat
      frustrated: {
        sprites: [
          `${basePath}/otacon_sprite_frustration_00.png`,
          `${basePath}/otacon_sprite_frustration_01.png`,
        ],
        frameMs: 400,
        loop: true,
        returnToSheet: false,
      },

      // Cold easter egg: when "cold" mentioned
      cold: {
        sprites: [
          `${basePath}/otacon_sprite_coat_00.png`,
          `${basePath}/otacon_sprite_coat_01.png`,
          `${basePath}/otacon_sprite_coat_02.png`,
          `${basePath}/otacon_sprite_coat_03.png`,
        ],
        frameMs: 300,
        loop: false,
        returnToSheet: true,
      },
    };
  }

  /**
   * Overlay effects configuration
   */
  _getOverlayConfig() {
    const basePath = (this.config?.sprites?.basePath || 'assets/sprites/').replace(/\/$/, '');

    return {
      // Blink: natural blinking (3 frames)
      blink: {
        sprites: [
          `${basePath}/otacon_sprite_blink_00.png`,
          `${basePath}/otacon_sprite_blink_01.png`,
          `${basePath}/otacon_sprite_blink_02.png`,
        ],
        duration: 200,
      },

      // Blush: shy/flattered (5 frames)
      blush: {
        sprites: [
          `${basePath}/otacon_sprite_blush_00.png`,
          `${basePath}/otacon_sprite_blush_01.png`,
          `${basePath}/otacon_sprite_blush_02.png`,
          `${basePath}/otacon_sprite_blush_03.png`,
          `${basePath}/otacon_sprite_blush_04.png`,
        ],
        frameMs: 150,
        holdLast: 2000,
      },
    };
  }

  /**
   * Generate unique token for race condition prevention
   */
  _generateToken() {
    return {};
  }

  /**
   * Check if current token is still valid
   */
  _isTokenValid(token) {
    return token === this._currentToken;
  }

  /**
   * Stop all animations and invalidate current token
   * Performance: Cancels RAF and clears frame buffer
   */
  stopAll() {
    this._currentToken = null;
    this._emotionLock = null;
    this.timers.clearAll();
    this._stopOverlay();
    this._blinkEnabled = false;

    // Cancel pending RAF and clear frame buffer
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._pendingFrameUpdate = null;
  }

  /**
   * Run an individual sprite sequence
   * @param {string} sequenceName - Key from _individualSequences
   * @param {Object} options - { speech, onComplete, overrideToken }
   */
  _runIndividualSequence(sequenceName, options = {}) {
    const sequence = this._individualSequences[sequenceName];
    if (!sequence) {
      console.warn(`[AnimationController] Unknown sequence: ${sequenceName}`);
      return;
    }

    const { speech = '', onComplete, overrideToken } = options;
    const token = overrideToken || this._currentToken;

    if (!this._isTokenValid(token)) return;

    const { sprites, frameMs, loop, returnToSheet } = sequence;
    let idx = 0;
    let direction = 1; // For ping-pong animations

    const runFrame = () => {
      if (!this._isTokenValid(token)) return;

      const sprite = sprites[idx];
      this._setIndividualSprite(sprite, speech);

      if (loop) {
        // Loop back and forth (ping-pong)
        idx += direction;
        if (idx >= sprites.length - 1) {
          idx = sprites.length - 1;
          direction = -1;
        } else if (idx <= 0) {
          idx = 0;
          direction = 1;
        }
        this.timers.setTimeout(`sequence_${sequenceName}`, runFrame, frameMs);
      } else {
        // Play once, optionally return to sheet
        idx++;
        if (idx < sprites.length) {
          this.timers.setTimeout(`sequence_${sequenceName}`, runFrame, frameMs);
        } else if (returnToSheet && this._isTokenValid(token)) {
          // Return to sheet-based animation
          this._startTagPool(this._currentState, speech, this._currentState, token);
        } else if (onComplete) {
          onComplete();
        }
      }
    };

    runFrame();
  }

  /**
   * Set individual sprite (for sequences)
   * @private
   */
  _setIndividualSprite(spriteUrl, speech = '') {
    if (!this._frameCallback) return;

    // Callback with special format to indicate individual sprite
    // Format: { type: 'individual', url: spriteUrl, speech }
    this._frameCallback(-1, -1, speech, { type: 'individual', url: spriteUrl });
  }

  /**
   * Show overlay effect (blink, blush, etc.)
   * @param {string} overlayType - 'blink', 'blush'
   * @param {Function} onComplete
   */
  _showOverlay(overlayType, onComplete) {
    const config = this._getOverlayConfig()[overlayType];
    if (!config) return;

    this._stopOverlay();
    this._activeOverlay = overlayType;

    const { sprites, frameMs, holdLast } = config;
    let idx = 0;

    const runFrame = () => {
      if (this._activeOverlay !== overlayType) return;

      const sprite = sprites[idx];
      this._setOverlaySprite(sprite);

      idx++;

      if (idx < sprites.length) {
        this._overlayTimer = setTimeout(runFrame, frameMs || 50);
      } else if (holdLast) {
        // Hold the last frame
        this._overlayTimer = setTimeout(() => {
          this._stopOverlay();
          if (onComplete) onComplete();
        }, holdLast);
      } else {
        // Immediate cleanup
        this._stopOverlay();
        if (onComplete) onComplete();
      }
    };

    runFrame();
  }

  /**
   * Stop current overlay
   */
  _stopOverlay() {
    if (this._overlayTimer) {
      clearTimeout(this._overlayTimer);
      this._overlayTimer = null;
    }
    this._activeOverlay = null;
    this._clearOverlaySprite();
  }

  /**
   * Set overlay sprite
   * @private
   */
  _setOverlaySprite(spriteUrl) {
    // Dispatch custom event for overlay
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('otaclaw-overlay', {
        detail: { type: 'show', url: spriteUrl }
      }));
    }
  }

  /**
   * Clear overlay sprite
   * @private
   */
  _clearOverlaySprite() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('otaclaw-overlay', {
        detail: { type: 'hide' }
      }));
    }
  }

  /**
   * Start automatic blink system
   */
  _startBlinkSystem() {
    if (!this._blinkEnabled) return;

    const scheduleBlink = () => {
      if (!this._blinkEnabled || this._activeOverlay) return;

      // Only blink when in idle or calm states
      const blinkableStates = ['idle', 'thinking', 'calm', 'waiting'];
      if (!blinkableStates.includes(this._currentState)) {
        this._scheduleNextBlink(scheduleBlink);
        return;
      }

      this._showOverlay('blink', () => {
        this._scheduleNextBlink(scheduleBlink);
      });
    };

    this._scheduleNextBlink(scheduleBlink);
  }

  /**
   * Schedule next blink
   */
  _scheduleNextBlink(callback) {
    // Random delay between 2-6 seconds for natural feel
    const delay = 2000 + Math.random() * 4000;
    this.timers.setTimeout('blinkSchedule', callback, delay);
  }

  /**
   * Trigger blush overlay (e.g., on tickle or compliment)
   */
  triggerBlush() {
    this._showOverlay('blush');
  }

  /**
   * Check if text mentions cold (easter egg trigger)
   */
  _checkEasterEggs(text) {
    if (!text) return null;

    const lower = text.toLowerCase();

    // Cold easter egg
    if (lower.includes('cold') || lower.includes('freezing') || lower.includes('chilly')) {
      return 'cold';
    }

    return null;
  }

  /**
   * Set frame directly (col, row) - Performance optimized
   * Uses requestAnimationFrame and throttling for smooth 60fps on Pi
   */
  setFrame(col, row, speech = '', options = {}) {
    if (!this._frameCallback) return;

    // For individual sprites, skip throttling
    if (options?.type === 'individual') {
      this._frameCallback(col, row, speech, options);
      return;
    }

    // Schedule frame update via RAF for smooth animations
    this._pendingFrameUpdate = { col, row, speech };
    this._scheduleFrameUpdate();
  }

  /**
   * Schedule frame update using requestAnimationFrame
   * Throttles to target frame rate for Pi performance
   */
  _scheduleFrameUpdate() {
    if (this._rafId) return; // Already scheduled

    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;

      if (!this._pendingFrameUpdate) return;

      // eslint-disable-next-line no-undef
      const now = performance.now();
      const elapsed = now - this._lastFrameTime;

      // Throttle frame updates
      if (elapsed < this._minFrameInterval) {
        // Too soon, reschedule
        this._scheduleFrameUpdate();
        return;
      }

      // Apply the frame update
      const { col, row, speech } = this._pendingFrameUpdate;
      this._pendingFrameUpdate = null;
      this._lastFrameTime = now;

      this._frameCallback(col, row, speech);
    });
  }

  /**
   * Batch DOM updates for better performance
   * Reduces layout thrashing
   */
  _batchUpdate(updateFn) {
    if (this._frameBuffer) {
      // Add to existing buffer
      const prevFn = this._frameBuffer;
      this._frameBuffer = () => {
        prevFn();
        updateFn();
      };
    } else {
      this._frameBuffer = updateFn;
      // Schedule flush
      requestAnimationFrame(() => {
        if (this._frameBuffer) {
          this._frameBuffer();
          this._frameBuffer = null;
        }
      });
    }
  }

  /**
   * Set frame from emotion tag using frame catalog
   */
  setFrameFromTag(tag, speech = '') {
    if (!this._frameCatalog?.frames) {
      // Fallback without catalog
      this._fallbackFrameFromTag(tag, speech);
      return;
    }

    const searchTags = this._getSearchTagsForState(tag);
    const pool = this._frameCatalog.frames.filter(f =>
      f.tags && f.tags.some(t => searchTags.includes(t))
    );

    if (pool.length > 0) {
      const frame = pool[Math.floor(Math.random() * pool.length)];
      this.setFrame(frame.col, frame.row, speech);
    } else {
      this._fallbackFrameFromTag(tag, speech);
    }
  }

  /**
   * Get search tags for a given state
   */
  _getSearchTagsForState(state) {
    const tagMap = {
      idle: ['idle', 'calm', 'resting', 'neutral', 'waiting', 'polite'],
      thinking: ['thinking', 'contemplative', 'neutral', 'puzzled', 'questioning'],
      processing: ['explaining', 'talking', 'neutral', 'thinking', 'asking', 'dynamic'],
      success: ['success', 'happy', 'positive', 'confident', 'presenting'],
      error: ['error', 'disappointed', 'sad', 'worried', 'unpleasant'],
      laughing: ['laughing', 'happy', 'playful', 'excited'],
      surprised: ['surprised', 'amazed', 'shocked', 'wonder'],
      curious: ['curious', 'interested', 'intrigued'],
      confused: ['confused', 'puzzled', 'uncertain'],
      excited: ['excited', 'enthusiastic', 'energetic'],
      worried: ['worried', 'concerned', 'anxious'],
      sad: ['sad', 'disappointed', 'unhappy'],
    };

    return tagMap[state] || [state, 'neutral'];
  }

  /**
   * Fallback frame coordinates when catalog unavailable
   */
  _fallbackFrameFromTag(tag, speech) {
    const fallbacks = {
      idle: { col: 0, row: 0 },
      thinking: { col: 1, row: 0 },
      processing: { col: 2, row: 0 },
      success: { col: 0, row: 1 },
      error: { col: 0, row: 2 },
      laughing: { col: 2, row: 3 },
      surprised: { col: 0, row: 3 },
      curious: { col: 3, row: 0 },
      confused: { col: 4, row: 0 },
      excited: { col: 1, row: 1 },
    };

    const frame = fallbacks[tag] || { col: 0, row: 0 };
    this.setFrame(frame.col, frame.row, speech);
  }

  /**
   * Start idle animation with organic timing
   */
  startIdle() {
    this.stopAll();
    this._currentState = 'idle';
    const token = this._generateToken();
    this._currentToken = token;

    let forceBaseNext = false;

    const schedule = () => {
      if (!this._isTokenValid(token)) return;

      // Get pool of frames for idle
      const searchTags = this._getSearchTagsForState('idle');
      let pool = [];

      if (this._frameCatalog?.frames) {
        pool = this._frameCatalog.frames.filter(f =>
          f.tags && f.tags.some(t => searchTags.includes(t))
        );
      }

      // Fallback to base frame if no catalog
      if (pool.length === 0) {
        pool = [{ col: 0, row: 0 }];
      }

      // Force base frame if needed, otherwise random from pool
      const frame = forceBaseNext
        ? { col: 0, row: 0 }
        : pool[Math.floor(Math.random() * pool.length)];

      forceBaseNext = (frame.col !== 0 || frame.row !== 0);

      this.setFrame(frame.col, frame.row, '');

      // Calculate delay: base frames hold longer, variants are brief
      const delay = (frame.col === 0 && frame.row === 0)
        ? 2000 + Math.random() * 3000  // 2-5s for base
        : 800 + Math.random() * 600;     // 0.8-1.4s for variants

      this.timers.setTimeout('idle', schedule, delay);
    };

    schedule();
  }

  /**
   * Start thinking animation with progressive phases
   */
  startThinking(_getTextFn) {
    this.stopAll();
    this._currentState = 'thinking';
    const token = this._generateToken();
    this._currentToken = token;

    const phases = [
      { tag: 'thinking', speech: this._t('thinking'), maxMs: 15000 },
      { tag: 'processing', speech: this._t('processing'), maxMs: 45000 },
      { tag: 'thinking', speech: 'Let me see...', maxMs: 60000 },
    ];

    const startTime = Date.now();

    const runPhase = () => {
      if (!this._isTokenValid(token)) return;

      const elapsed = Date.now() - startTime;
      let phase = phases[0];
      for (let i = phases.length - 1; i >= 0; i--) {
        if (elapsed >= phases[i].maxMs) continue;
        phase = phases[i];
        break;
      }

      // Run tag pool animation for this phase
      this._runTagPool(phase.tag, phase.speech, 'thinking', token);

      // Schedule next phase check
      const nextPhase = phases.find(p => p.maxMs > elapsed);
      if (nextPhase && nextPhase.maxMs !== Infinity) {
        const delay = nextPhase.maxMs - elapsed + 200;
        this.timers.setTimeout('thinkingPhase', runPhase, delay);
      }
    };

    runPhase();
  }

  /**
   * Start processing animation
   */
  startProcessing(speech) {
    this.stopAll();
    this._currentState = 'processing';
    const token = this._generateToken();
    this._currentToken = token;

    this._runTagPool('processing', speech, 'processing', token);
  }

  /**
   * Start success animation
   * Uses thumbs-up individual sequence for celebration
   */
  startSuccess(speech) {
    this.stopAll();
    this._currentState = 'success';
    const token = this._generateToken();
    this._currentToken = token;

    // Use individual thumbs sequence (more expressive)
    this._runIndividualSequence('success', {
      speech,
      overrideToken: token,
      onComplete: () => {
        // After thumbs celebration, return to happy idle
        if (this._isTokenValid(token)) {
          this._runTagPool('success', speech, 'success', token, 2000);
        }
      },
    });
  }

  /**
   * Start error animation
   * Uses frustrated sequence for repeated errors
   */
  startError(speech) {
    this.stopAll();
    this._currentState = 'error';
    const token = this._generateToken();
    this._currentToken = token;

    // Check if this is a repeated error (frustrated state)
    if (this._consecutiveErrors > 1) {
      this._runIndividualSequence('frustrated', {
        speech,
        overrideToken: token,
      });
    } else {
      this._runTagPool('error', speech, 'error', token, 2000);
    }
  }

  /**
   * Track consecutive errors
   */
  _consecutiveErrors = 0;
  recordError() {
    this._consecutiveErrors++;
  }
  clearErrors() {
    this._consecutiveErrors = 0;
  }

  /**
   * Start laughing animation
   * Uses laugh individual sequence (more expressive than sheet)
   */
  startLaughing(speech) {
    this.stopAll();
    this._currentState = 'laughing';
    const token = this._generateToken();
    this._currentToken = token;

    // Use individual laugh sequence (looping)
    this._runIndividualSequence('laughing', {
      speech,
      overrideToken: token,
    });

    // Trigger blush overlay (laughing = happy/flattered)
    this.triggerBlush();
  }

  /**
   * Start surprised animation
   */
  startSurprised(speech) {
    this.stopAll();
    this._currentState = 'surprised';
    const token = this._generateToken();
    this._currentToken = token;

    this._runTagPool('surprised', speech, 'surprised', token, 1500);
  }

  /**
   * Start confused animation
   * Uses shrug sequence for "I don't know"
   */
  startConfused(speech) {
    this.stopAll();
    this._currentState = 'confused';
    const token = this._generateToken();
    this._currentToken = token;

    this._runIndividualSequence('confused', {
      speech,
      overrideToken: token,
    });
  }

  /**
   * Start thinking animation with progressive phases
   * Switches to deep thinking (think sprites) after 10s
   */
  startThinking(_getTextFn) {
    this.stopAll();
    this._currentState = 'thinking';
    const token = this._generateToken();
    this._currentToken = token;

    const phases = [
      { tag: 'thinking', speech: this._t('thinking'), maxMs: 15000 },
      { tag: 'curious', speech: this._t('curious') || 'Hmm?', maxMs: 15000 },
      // Deep thinking phase uses individual think sprites
      { type: 'deep', tag: 'thinking', speech: 'Let me think...', maxMs: Infinity },
    ];

    const startTime = Date.now();

    const runPhase = () => {
      if (!this._isTokenValid(token)) return;

      const elapsed = Date.now() - startTime;
      let phase = phases[0];

      for (let i = phases.length - 1; i >= 0; i--) {
        if (elapsed >= phases[i].maxMs) continue;
        phase = phases[i];
        break;
      }

      if (phase.type === 'deep') {
        // Use individual think sequence for deep thinking
        this._runIndividualSequence('thinkingDeep', {
          speech: phase.speech,
          overrideToken: token,
        });
      } else {
        // Use sheet tag pool for initial thinking
        this._runTagPool(phase.tag, phase.speech, 'thinking', token);
      }

      // Schedule next phase
      const nextPhase = phases.find(p => p.minMs > elapsed);
      if (nextPhase && nextPhase.maxMs !== Infinity) {
        const delay = nextPhase.maxMs - elapsed + 200;
        this.timers.setTimeout('thinkingPhase', runPhase, delay);
      }
    };

    runPhase();
  }

  /**
   * Run tag pool animation with given parameters
   * @private
   */
  _runTagPool(tag, speech, stateName, token, fixedDelay = null) {
    const schedule = () => {
      if (!this._isTokenValid(token)) return;
      if (this._currentState !== stateName) return;

      this.setFrameFromTag(tag, speech);

      const delay = fixedDelay !== null
        ? fixedDelay
        : this._calculateDelay(stateName);

      this.timers.setTimeout(`${stateName}Pool`, schedule, delay);
    };

    schedule();
  }

  /**
   * Calculate delay for state animations
   */
  _calculateDelay(state) {
    switch (state) {
      case 'idle':
        return 2000 + Math.random() * 3000;
      case 'thinking':
      case 'processing':
        return 800 + Math.random() * 1000;
      case 'laughing':
        return 300 + Math.random() * 400;
      case 'success':
      case 'error':
      case 'surprised':
        return 2000;
      default:
        return 1500;
    }
  }

  /**
   * Analyze text and determine emotion
   * Called on each message delta to detect emotional content
   * Also checks for easter egg triggers
   */
  analyzeEmotion(text) {
    if (!text) return null;

    this._accumulatedText += text.toLowerCase();
    const recent = this._accumulatedText.slice(-120);

    // Check for easter eggs first
    const easterEgg = this._checkEasterEggs(recent);
    if (easterEgg) {
      this._triggerEasterEgg(easterEgg);
    }

    const scores = {
      laughing: 0,
      surprised: 0,
      excited: 0,
      worried: 0,
      curious: 0,
      thinking: 0,
      presenting: 0,
      sad: 0,
      confused: 0,
    };

    const patterns = [
      [/haha|hehe|😂|🤣|😆|lol|lmao|rofl/gi, 'laughing', 3],
      [/funny|joke|hilarious|comedy|humor/gi, 'laughing', 2],
      [/happy|glad|love|excellent|great|awesome|fantastic/gi, 'laughing', 1],
      [/wow|amazing|incredible|omg|gosh|impressive|wonderful/gi, 'surprised', 3],
      [/!!+/g, 'surprised', 1],
      [/🎉|🚀|💪|excited|can't wait|thrilling/gi, 'excited', 3],
      [/cool|neat|nice|sweet/gi, 'excited', 1],
      [/oops|uh oh|sorry|😅|apologies|unfortunately|problem/gi, 'worried', 3],
      [/careful|warning|caution|risk|danger/gi, 'worried', 2],
      [/sad|😢|😭|miss|lost|gone|disappointing/gi, 'sad', 3],
      [/\?{2,}/g, 'confused', 2],
      [/confused|unclear|don't understand|what do you mean/gi, 'confused', 3],
      [/hmm|🤔|let me think|let's see|analyzing|considering/gi, 'thinking', 2],
      [/interesting|perhaps|maybe|might/gi, 'thinking', 1],
      [/\?/g, 'curious', 1],
      [/what|how|why|tell me|explain|curious|wonder/gi, 'curious', 1],
      [/here|look|check|presenting|result|done|built|created/gi, 'presenting', 2],
      [/ta-da|voilà|behold/gi, 'presenting', 3],
    ];

    for (const [regex, emotion, weight] of patterns) {
      const matches = recent.match(regex);
      if (matches) {
        scores[emotion] += matches.length * weight;
      }
    }

    let bestEmotion = null;
    let bestScore = 0;
    for (const [emotion, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestEmotion = emotion;
      }
    }

    if (bestScore >= 2) {
      this._emotionLock = bestEmotion;
      return bestEmotion;
    }

    return null;
  }

  /**
   * Trigger easter egg animation
   */
  _triggerEasterEgg(type) {
    if (type === 'cold') {
      // Briefly show cold animation (coat sequence)
      this._runIndividualSequence('cold', {
        speech: 'Brrr...',
      });

      // Return to previous state after animation
      setTimeout(() => {
        if (this._currentState === 'idle') {
          this.startIdle();
        }
      }, 2000);
    }
  }

  /**
   * Get current emotion lock (if any)
   */
  getEmotionLock() {
    return this._emotionLock;
  }

  /**
   * Clear emotion lock
   */
  clearEmotionLock() {
    this._emotionLock = null;
    this._accumulatedText = '';
  }

  /**
   * Reset accumulated text (called on new message)
   */
  resetAccumulatedText() {
    this._accumulatedText = '';
    this._emotionLock = null;
  }

  /**
   * Get current animation state
   */
  getCurrentState() {
    return this._currentState;
  }

  /**
   * i18n helper - gets translation from config
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
    };

    const val = this.config?.i18n?.[key] ||
      this.config?.personalities?.[this.config?.personality]?.[key] ||
      fallbacks[key] ||
      key;

    return Array.isArray(val)
      ? val[Math.floor(Math.random() * val.length)]
      : val;
  }

  /**
   * Play a sequence of frames from tagToSequences config
   */
  playSequence(tag, onComplete) {
    const seqMap = this.config?.sprites?.tagToSequences;
    const seq = seqMap?.[tag.toLowerCase()];

    if (!Array.isArray(seq) || seq.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    this.stopAll();
    const token = this._generateToken();
    this._currentToken = token;

    const frameMs = Number(this.config?.sprites?.tagSequenceFrameMs) || 350;
    let idx = 0;

    const schedule = () => {
      if (!this._isTokenValid(token)) return;

      const [col, row] = seq[idx];
      this.setFrame(col, row, '');

      idx++;
      if (idx < seq.length) {
        this.timers.setTimeout('sequence', schedule, frameMs);
      } else {
        if (onComplete) onComplete();
      }
    };

    schedule();
  }

  /**
   * Clean up all resources - Memory leak prevention
   * Must be called when disposing AnimationController
   */
  destroy() {
    // Stop all animations and clear timers
    this.stopAll();

    // Cancel any pending RAF
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    // Clear frame callback and buffer
    this._frameCallback = null;
    this._pendingFrameUpdate = null;

    // Clear references to prevent memory leaks
    this._frameCatalog = null;
    this._individualSequences = null;
    this._overlayConfig = null;
    this.config = null;
    this.timers = null;
  }
}

export default AnimationController;
