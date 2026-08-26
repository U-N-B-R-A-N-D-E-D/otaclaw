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
import { otaclawMonitor as monitor } from './monitor.js';
import { detectEmotion, RECENT_WINDOW } from './emotion-patterns.js';

export class AnimationController {
  constructor(config, timerManager) {
    this.config = config;
    this.timers = timerManager || new TimerManager();

    // Frame catalog for semantic animation
    this._frameCatalog = null;
    this._loadFrameCatalog();

    // Sprite catalog (loaded asynchronously by app-calibration.js)
    this._spriteCatalog = null;

    // Current animation tracking
    this._currentState = 'idle';
    this._currentToken = null;
    this._accumulatedText = '';
    this._emotionLock = null;
    this._context = null;
    this._lastFrameKey = null;
    this._poolCycleIndex = {};
    this._recentFrameKeys = {}; // state -> Set of recent frame keys for anti-repeat

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
   * Provide runtime context (category, tool, phase...) so sprite/tag selection
   * can be emotionally and task-appropriate rather than generic.
   */
  setContext(ctx) {
    this._context = ctx || null;
  }

  /**
   * Inject a preloaded frame catalog (early fetch / app.js share).
   * Single source of sprite semantics for the kiosk path.
   */
  setCatalog(catalog) {
    if (catalog && Array.isArray(catalog.frames)) {
      this._frameCatalog = catalog;
    }
  }

  getCatalog() {
    return this._frameCatalog;
  }

  /**
   * Load frame catalog for semantic animations
   */
  async _loadFrameCatalog() {
    try {
      if (typeof window !== 'undefined') {
        if (window.__otaclawEarlyCatalog) {
          this._frameCatalog = window.__otaclawEarlyCatalog;
          return;
        }
        if (window.__otaclawFrameCatalog) {
          this._frameCatalog = window.__otaclawFrameCatalog;
          return;
        }
      }
      const assetUrl = typeof window?.otaclawAssetUrl === 'function'
        ? window.otaclawAssetUrl
        : (p) => p;

      const response = await fetch(assetUrl('data/frame-catalog.json?v=20'));
      this._frameCatalog = await response.json();
      if (typeof window !== 'undefined') {
        window.__otaclawFrameCatalog = this._frameCatalog;
      }
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
   * Set the sprite catalog (loaded asynchronously by app-calibration.js).
   * Rebuilds individual sequences so catalog references are resolved.
   */
  setSpriteCatalog(catalog) {
    this._spriteCatalog = catalog;
    this._individualSequences = this._buildIndividualSequences();
  }

  /**
   * Resolve a sequence reference from the sprite catalog.
   * @private
   */
  _resolveCatalogSequence(name) {
    const seq = this._spriteCatalog?.sequences?.find((s) => s.name === name);
    if (!seq || !Array.isArray(seq.sprites) || seq.sprites.length === 0) return null;
    return seq;
  }

  /**
   * Build individual sprite sequences configuration.
   * Uses config.sprites.individualSequences as the single source of truth;
   * falls back to hardcoded defaults for any missing sequence.
   * Config entries may reference a sprite-catalog sequence by name via `catalog`.
   */
  _buildIndividualSequences() {
    const basePath = (this.config?.sprites?.basePath || 'assets/sprites/').replace(/\/$/, '');

    const defaults = {
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

    const configured = this.config?.sprites?.individualSequences || {};
    return this._mergeIndividualSequences(defaults, configured, basePath);
  }

  /**
   * Merge configured individual sequences over hardcoded defaults.
   * Configured sprites are resolved against basePath unless already absolute or protocol-relative.
   */
  _mergeIndividualSequences(defaults, configured, basePath) {
    const out = { ...defaults };
    for (const key of Object.keys(configured)) {
      const cfg = configured[key];
      if (!cfg || typeof cfg !== 'object') continue;
      const base = defaults[key] || {};
      let sprites;
      let merged = { ...base, ...cfg };

      if (typeof cfg.catalog === 'string') {
        const catSeq = this._resolveCatalogSequence(cfg.catalog);
        if (catSeq && catSeq.sprites.length) {
          sprites = catSeq.sprites.map((s) => this._resolveSpritePath(s, basePath));
          merged = { ...base, ...catSeq, ...cfg, sprites };
        } else {
          sprites = base.sprites;
        }
      } else if (Array.isArray(cfg.sprites)) {
        sprites = cfg.sprites.map((s) => this._resolveSpritePath(s, basePath));
      } else {
        sprites = base.sprites;
      }

      out[key] = { ...merged, sprites };
    }
    return out;
  }

  /**
   * Resolve a sprite path against basePath unless it is already a URL.
   */
  _resolveSpritePath(path, basePath) {
    if (!path || typeof path !== 'string') return path;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path;
    return `${basePath}/${path.replace(/^\//, '')}`;
  }

  /**
   * Overlay effects configuration.
   * Uses config.sprites.overlayEffects as the single source of truth;
   * falls back to hardcoded defaults for any missing effect.
   */
  _getOverlayConfig() {
    const basePath = (this.config?.sprites?.basePath || 'assets/sprites/').replace(/\/$/, '');

    const defaults = {
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

    const configured = this.config?.sprites?.overlayEffects || {};
    const out = {};
    for (const key of new Set([...Object.keys(defaults), ...Object.keys(configured)])) {
      const base = defaults[key] || {};
      const cfg = configured[key] || {};
      const resolved = Array.isArray(cfg.sprites)
        ? cfg.sprites.map((s) => this._resolveSpritePath(s, basePath))
        : base.sprites;
      out[key] = {
        ...base,
        ...cfg,
        sprites: resolved,
      };
    }
    return out;
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
    this._recentFrameKeys = {};

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
      monitor.warn('animation.unknown_sequence', { sequence: sequenceName });
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
    // Capture type before clearing so the hide event knows which overlay closed.
    const closingType = this._activeOverlay;
    this._activeOverlay = null;
    this._clearOverlaySprite(closingType);
  }

  /**
   * Set overlay sprite
   * @private
   */
  _setOverlaySprite(spriteUrl) {
    // Dispatch custom event for overlay
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('otaclaw-overlay', {
        detail: { type: 'show', url: spriteUrl, overlayType: this._activeOverlay }
      }));
    }
  }

  /**
   * Clear overlay sprite
   * @private
   */
  _clearOverlaySprite(closingType = null) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('otaclaw-overlay', {
        detail: { type: 'hide', overlayType: closingType }
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
  setFrameFromTag(tag, speech = '', context = null) {
    const pool = this.getOrganicFramePool(tag, context || this._context);
    if (pool.length > 0) {
      const frame = pool[Math.floor(Math.random() * pool.length)];
      this.setFrame(frame.col, frame.row, speech);
      this._lastFrameKey = `${frame.col},${frame.row}`;
      return;
    }
    this._fallbackFrameFromTag(tag, speech);
  }

  /**
   * Catalog `primary` emotions allowed per agent state (hard gate when frame.primary set).
   * Organic human: idle = calm rest only (+ rare social sparkle). Work stays faithful.
   */
  _getAllowedPrimaries(state) {
    const map = {
      // Calm rest only — no wink/play (reads as laugh on small screens)
      idle: ['idle', 'greeting'],
      thinking: ['thinking'],
      processing: ['explaining', 'talking', 'presenting', 'confident'],
      success: ['success', 'presenting', 'confident', 'playful'],
      error: ['sad', 'worried'],
      laughing: ['laughing', 'playful'],
      surprised: ['surprised'],
      curious: ['curious'],
      confused: ['confused'],
      excited: ['success', 'presenting', 'playful', 'confident', 'laughing'],
      worried: ['worried'],
      sad: ['sad'],
      scared: ['scared'],
      presenting: ['presenting', 'explaining', 'confident'],
      greeting: ['greeting'],
      confident: ['confident'],
    };
    return map[state] || [state];
  }

  /**
   * Catalog `lane` allowed per state.
   */
  _getAllowedLanes(state) {
    const map = {
      idle: ['idle', 'social'],
      thinking: ['work'],
      processing: ['work'],
      curious: ['work'],
      confused: ['work'],
      confident: ['work'],
      presenting: ['work', 'react'],
      success: ['react', 'social', 'work'],
      error: ['react'],
      laughing: ['react', 'social'],
      surprised: ['react'],
      worried: ['react'],
      sad: ['react'],
      scared: ['react'],
      excited: ['react', 'social', 'work'],
      greeting: ['social'],
    };
    return map[state] || ['work', 'react', 'social'];
  }

  /**
   * Legacy tag aliases (tests + frames without `primary` yet).
   */
  _getPrimaryTags(state) {
    const map = {
      idle: ['idle_base', 'base', 'greeting', 'waving'],
      thinking: ['thinking', 'contemplative'],
      processing: ['explaining', 'talking', 'processing', 'assertive', 'ready'],
      success: ['success', 'approval', 'assertive', 'wink', 'playful', 'ta-da'],
      error: ['error', 'disappointed', 'sad', 'worried'],
      laughing: ['laughing', 'funny', 'wink', 'playful'],
      surprised: ['surprised', 'shocked', 'amazed'],
      curious: ['curious', 'interested'],
      confused: ['confused', 'puzzled', 'uncertain', 'shrug'],
      excited: ['excited', 'ta-da', 'presenting', 'playful'],
      worried: ['worried', 'concerned', 'anxious'],
      sad: ['sad', 'disappointed'],
      scared: ['scared', 'frightened'],
      presenting: ['presenting', 'ta-da', 'assertive'],
      greeting: ['greeting', 'waving'],
    };
    return map[state] || [state];
  }

  /**
   * Soft secondary tags (rank boost only — never expand eligibility alone).
   */
  _getSecondaryTags(state) {
    const map = {
      idle: ['idle', 'calm', 'resting', 'waiting', 'polite'],
      thinking: ['calm'],
      processing: ['emphasis', 'dynamic', 'ready'],
      success: ['happy', 'positive'],
      error: ['unpleasant', 'distressed'],
      laughing: ['happy', 'positive', 'excited'],
      surprised: ['amazed'],
      curious: ['positive'],
      confused: ['questioning'],
      excited: ['positive'],
      worried: ['unpleasant'],
      presenting: ['positive'],
      greeting: ['hello', 'happy'],
    };
    return map[state] || [];
  }

  /**
   * Tags that disqualify a frame (anti-bleed only — never quarantine a whole lane).
   * Pain/distress stays out of calm work. Social is allowed in idle/laugh/success/greeting.
   */
  _getExcludedTags(state) {
    if (state === 'idle') {
      // Idle: calm rest + rare wave. No wink (reads as laugh), no pain/scare/ta-da.
      return [
        'laughing', 'funny', 'wink', 'playful',
        'scared', 'surprised', 'shocked', 'ta-da',
        'error', 'sad', 'alarmed', 'distressed', 'worried', 'unpleasant',
        'cold', 'uncomfortable',
      ];
    }
    const exclude = [];
    if (!['laughing', 'excited'].includes(state)) {
      exclude.push('laughing', 'funny');
    }
    // Social celebrate only where it belongs (wink ≠ idle)
    if (!['laughing', 'success', 'excited'].includes(state)) {
      exclude.push('wink', 'playful');
    }
    if (!['laughing', 'success', 'excited', 'greeting', 'idle'].includes(state)) {
      exclude.push('waving', 'greeting');
    }
    if (!['worried', 'error', 'sad', 'scared'].includes(state)) {
      exclude.push(
        'scared', 'frightened', 'worried', 'unpleasant', 'distressed',
        'sad', 'error', 'cold', 'uncomfortable', 'alarmed',
      );
    }
    if (state === 'thinking' || state === 'processing' || state === 'curious') {
      exclude.push('confused');
    }
    return exclude;
  }

  _isWorkState(state) {
    return [
      'thinking', 'processing', 'curious', 'presenting', 'confused', 'confident',
    ].includes(state);
  }

  /**
   * Search-tag list for legacy callers / tests.
   */
  _getSearchTagsForState(state, context = null) {
    let tags = [
      ...this._getPrimaryTags(state),
      ...this._getSecondaryTags(state),
    ];

    if (state === 'idle') {
      return [...new Set([...this._getPrimaryTags('idle'), ...this._getSecondaryTags('idle')])];
    }

    const c = context || this._context || {};
    if (c.category === 'creative') tags = [...tags, 'excited', 'presenting', 'ta-da'];
    else if (c.category === 'search') tags = [...tags, 'curious', 'listening', 'phone'];
    else if (c.category === 'analytical') tags = [...tags, 'thinking', 'confident', 'contemplative'];
    else if (c.category === 'communication') tags = [...tags, 'talking', 'presenting', 'dynamic'];
    else if (c.category === 'risky') tags = [...tags, 'worried', 'concerned'];

    return [...new Set(tags.filter((t) => t !== 'neutral'))];
  }

  /**
   * Whether a catalog frame is eligible for this agent state.
   * Prefers `primary` + `lane` (v2); falls back to tag matching for fixtures.
   */
  _frameEligibleForState(frame, stateName, excludedTags) {
    const tags = Array.isArray(frame.tags) ? frame.tags : [];

    if (stateName === 'idle') {
      // Exception: safe exotic spice frames (wink) are allowed as a rare ~5% sparkle,
      // even though they normally read as laugh. They must pass the taxonomy gate.
      const spiceSet = new Set(['4,3', '5,3', '0,3', '1,3']);
      if (spiceSet.has(`${frame.col},${frame.row}`) && (frame.mood === 'calm' || frame.mood === 'social')) {
        return true;
      }
    }

    if (tags.some((t) => excludedTags.includes(t))) return false;

    // Hard taxonomy quarantine: pain/fear moods never enter calm/work pools.
    const mood = frame.mood;
    const quarantineStates = ['idle', 'thinking', 'waiting', 'processing', 'curious', 'confident', 'presenting'];
    if ((mood === 'pain' || mood === 'fear') && quarantineStates.includes(stateName)) {
      return false;
    }

    const allowedPrimaries = this._getAllowedPrimaries(stateName);
    const allowedLanes = this._getAllowedLanes(stateName);

    if (stateName === 'idle') {
      // Organic rest: true idle bases, plus rare wave only (no wink)
      if (frame.primary === 'idle' && frame.lane === 'idle') return true;
      if (frame.primary === 'greeting' && frame.lane === 'social') return true;
      if (!frame.primary) {
        const hits = this._getPrimaryTags('idle').filter((t) => tags.includes(t));
        return hits.length > 0 && !tags.includes('shrug') && !tags.includes('open') && !tags.includes('wink');
      }
      return false;
    }

    if (frame.primary) {
      if (frame.lane && !allowedLanes.includes(frame.lane)) return false;
      return allowedPrimaries.includes(frame.primary);
    }

    const primaryHits = this._getPrimaryTags(stateName).filter((t) => tags.includes(t));
    return primaryHits.length > 0;
  }

  /**
   * Sole organic pool builder for kiosk + core.
   * Work = fidelity. Idle = life (whole calm/social repertoire, base-weighted).
   * Every catalog frame is reachable from ≥1 state.
   */
  getOrganicFramePool(stateName, context = null) {
    const cat = this._frameCatalog;
    const ctx = stateName === 'idle' ? {} : (context || this._context || {});
    const secondary = this._getSecondaryTags(stateName);
    const excluded = this._getExcludedTags(stateName);
    const isWork = this._isWorkState(stateName);

    let boost = [];
    const widen = this.config?.sprites?.toolCategoryWidening !== false;
    if (widen && (isWork || stateName === 'success' || stateName === 'excited')) {
      if (ctx.category === 'creative') boost = ['excited', 'presenting', 'ta-da', 'positive'];
      else if (ctx.category === 'search') boost = ['curious', 'listening', 'talking', 'phone'];
      else if (ctx.category === 'analytical') boost = ['thinking', 'confident', 'contemplative'];
      else if (ctx.category === 'communication') boost = ['talking', 'presenting', 'dynamic'];
      else if (ctx.category === 'risky') boost = ['worried', 'concerned'];
    }

    // Time-of-day mood tint: taxonomy-safe tag boosts only.
    if (this.config?.sprites?.timeOfDayMood !== false) {
      const hour = new Date().getHours();
      if (hour < 8) {
        boost.push('tired', 'subdued', 'low-energy');
      } else if (hour >= 7 && hour < 10) {
        boost.push('ready', 'alert', 'focused', 'assertive');
      } else if (hour >= 22) {
        boost.push('calm', 'closed', 'resting', 'waiting');
      }
    }

    const fallbacks = {
      thinking: [{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 11, row: 0 }, { col: 4, row: 0 }],
      processing: [
        { col: 6, row: 0 }, { col: 7, row: 0 }, { col: 6, row: 1 }, { col: 8, row: 1 },
        { col: 10, row: 1 }, { col: 6, row: 2 },
      ],
      success: [
        { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 },
        { col: 6, row: 3 }, { col: 4, row: 3 }, { col: 8, row: 1 },
      ],
      error: [{ col: 0, row: 2 }, { col: 2, row: 2 }, { col: 4, row: 2 }],
      laughing: [{ col: 2, row: 3 }, { col: 3, row: 3 }, { col: 4, row: 3 }, { col: 5, row: 3 }],
      surprised: [{ col: 9, row: 0 }, { col: 10, row: 0 }],
      curious: [{ col: 5, row: 2 }],
      confused: [{ col: 1, row: 2 }, { col: 5, row: 0 }],
      excited: [{ col: 2, row: 1 }, { col: 6, row: 3 }, { col: 7, row: 3 }, { col: 4, row: 3 }],
      worried: [{ col: 0, row: 2 }, { col: 4, row: 2 }, { col: 9, row: 3 }],
      idle: [
        { col: 0, row: 0 }, { col: 3, row: 0 }, { col: 8, row: 0 },
        { col: 7, row: 2 }, { col: 4, row: 3 },
      ],
      presenting: [{ col: 6, row: 3 }, { col: 7, row: 3 }, { col: 6, row: 0 }, { col: 10, row: 1 }],
      greeting: [{ col: 7, row: 2 }, { col: 4, row: 3 }, { col: 5, row: 3 }],
      confused: [{ col: 5, row: 0 }, { col: 1, row: 2 }, { col: 5, row: 1 }, { col: 4, row: 1 }],
      scared: [{ col: 10, row: 3 }],
    };

    if (!cat?.frames?.length) {
      return fallbacks[stateName] || [{ col: 0, row: 0 }];
    }

    const scored = [];
    for (const f of cat.frames) {
      const tags = Array.isArray(f.tags) ? f.tags : [];
      if (!this._frameEligibleForState(f, stateName, excluded)) continue;

      let score = 0;
      if (f.primary && this._getAllowedPrimaries(stateName).includes(f.primary)) {
        score += 20;
      } else {
        const primaryHits = this._getPrimaryTags(stateName).filter((t) => tags.includes(t));
        score += primaryHits.length * 10;
      }
      for (const t of secondary) {
        if (tags.includes(t)) score += 2;
      }
      for (const t of boost) {
        if (tags.includes(t) || f.primary === t) score += 3;
      }
      if (stateName === 'idle') {
        // Weight: calm base dominates; wave is rare
        if (f.primary === 'idle' || tags.includes('idle_base') || tags.includes('base')) score += 16;
        else if (f.primary === 'greeting') score += 1;
      }
      scored.push({ col: f.col, row: f.row, score, tags, primary: f.primary, lane: f.lane });
    }

    scored.sort((a, b) => b.score - a.score);

    let pool = scored.map(({ col, row }) => ({ col, row }));
    if (pool.length === 0) {
      return fallbacks[stateName] || [{ col: 0, row: 0 }];
    }

    // No work-pool slice: every eligible cell must stay reachable (100% sheet use).

    if (stateName === 'idle') {
      const baseFrames = scored
        .filter((s) => s.primary === 'idle' || s.tags.includes('idle_base') || s.tags.includes('base'))
        .map(({ col, row }) => ({ col, row }));
      if (baseFrames.length) {
        // Heavy base bias so pick ~80%+ lands on calm rest
        pool = [...baseFrames, ...baseFrames, ...baseFrames, ...baseFrames, ...pool];
      }
    }

    // Anti-repeat memory: don't offer the same frame within the configured window.
    const windowSize = Math.max(0, Number(this.config?.sprites?.antiRepeatWindow) || 0);
    if (windowSize > 0 && pool.length > windowSize) {
      let recent = this._recentFrameKeys[stateName] || new Set();
      while (recent.size > 0) {
        const filtered = pool.filter((f) => !recent.has(`${f.col},${f.row}`));
        if (filtered.length) {
          pool = filtered;
          break;
        }
        // All frames are recent; drop the oldest one and try again.
        const oldest = Array.from(recent)[0];
        recent = new Set(Array.from(recent).filter((k) => k !== oldest));
        this._recentFrameKeys[stateName] = recent;
      }
    }

    return pool;
  }

  /**
   * Pick next frame from organic pool (stable cycle for work, weighted random for idle).
   */
  pickOrganicFrame(stateName, context = null, { stable = false } = {}) {
    const ctx = context || this._context || {};
    const pool = this.getOrganicFramePool(stateName, ctx);
    if (!pool.length) return { col: 0, row: 0 };

    let frame;
    if (stable || this._isWorkState(stateName)) {
      const cycleKey = `${stateName}:${ctx.category || 'neutral'}`;
      const idx = this._poolCycleIndex[cycleKey] || 0;
      frame = pool[idx % pool.length];
      this._poolCycleIndex[cycleKey] = idx + 1;
    } else if (stateName === 'idle' && pool.length > 1) {
      // Organic rest: ~90% calm base, ~5% safe exotic spice, remainder rare wave
      const baseKeys = new Set(['0,0', '3,0', '8,0']);
      const bases = pool.filter((f) => baseKeys.has(`${f.col},${f.row}`));
      const spiceSet = new Set(['4,3', '5,3', '0,3', '1,3']);
      const spiceFrames = pool.filter((f) => {
        if (!spiceSet.has(`${f.col},${f.row}`)) return false;
        const frame = this._frameCatalog?.frames?.find((fr) => fr.col === f.col && fr.row === f.row);
        return frame && (frame.mood === 'calm' || frame.mood === 'social');
      });
      const spiceChance = this.config?.sprites?.idleSpiceChance ?? 0.05;
      const sparkle = pool.filter((f) => !baseKeys.has(`${f.col},${f.row}`) && !spiceSet.has(`${f.col},${f.row}`));
      const roll = Math.random();
      if (spiceFrames.length && roll < spiceChance) {
        frame = spiceFrames[Math.floor(Math.random() * spiceFrames.length)];
      } else if (bases.length && roll < 0.9) {
        frame = bases[Math.floor(Math.random() * bases.length)];
      } else if (sparkle.length && Math.random() < 0.35) {
        frame = sparkle[Math.floor(Math.random() * sparkle.length)];
      } else if (bases.length) {
        frame = bases[Math.floor(Math.random() * bases.length)];
      } else {
        frame = pool[Math.floor(Math.random() * pool.length)];
      }
    } else {
      frame = pool[Math.floor(Math.random() * pool.length)];
    }

    this._lastFrameKey = `${frame.col},${frame.row}`;

    // Update anti-repeat window for this state.
    const windowSize = Math.max(0, Number(this.config?.sprites?.antiRepeatWindow) || 0);
    if (windowSize > 0) {
      if (!this._recentFrameKeys[stateName]) this._recentFrameKeys[stateName] = new Set();
      this._recentFrameKeys[stateName].add(this._lastFrameKey);
      const all = Array.from(this._recentFrameKeys[stateName]);
      if (all.length > windowSize) {
        this._recentFrameKeys[stateName] = new Set(all.slice(all.length - windowSize));
      }
    }

    return frame;
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
      surprised: { col: 9, row: 0 },
      curious: { col: 5, row: 2 },
      confused: { col: 5, row: 0 },
      excited: { col: 2, row: 1 },
      worried: { col: 0, row: 2 },
    };

    const frame = fallbacks[tag] || { col: 0, row: 0 };
    this.setFrame(frame.col, frame.row, speech);
  }

  /**
   * Idle = life only: calm base holds + occasional micro gestures.
   * Ignores task category (fidelity is for work states).
   */
  startIdle() {
    this.stopAll();
    this._currentState = 'idle';
    this._blinkEnabled = true;
    const token = this._generateToken();
    this._currentToken = token;

    const schedule = () => {
      if (!this._isTokenValid(token)) return;

      const frame = this.pickOrganicFrame('idle', {}, { stable: false });
      // Idle never drives the bubble — leave it alone after app clears it on enter.
      this.setFrame(frame.col, frame.row, undefined);

      const baseKeys = new Set(['0,0', '3,0', '8,0']);
      const isBase = baseKeys.has(`${frame.col},${frame.row}`);
      // Human rest: long holds on calm, brief sparkle if social
      const delay = isBase
        ? 4000 + Math.random() * 4000
        : 700 + Math.random() * 500;

      this.timers.setTimeout('idle', schedule, delay);
    };

    schedule();
  }

  /**
   * Work = fidelity: stable cycle through a narrow category-matched pool.
   * Speech is applied once on the first frame only — later ticks leave the
   * bubble alone so it doesn't flash like a notification tray.
   */
  startWork(stateName, speech = '') {
    const state = stateName || 'thinking';
    this.stopAll();
    this._currentState = state;
    this._blinkEnabled = true;
    const token = this._generateToken();
    this._currentToken = token;

    const text = speech || this._t(state) || this._t('thinking');
    let spokeOnce = false;

    const schedule = () => {
      if (!this._isTokenValid(token)) return;
      if (this._currentState !== state) return;

      const frame = this.pickOrganicFrame(state, this._context, { stable: true });
      // First tick: set speech. Later ticks: omit speech so the frame callback
      // can skip bubble updates (avoids constant notification spam).
      if (!spokeOnce) {
        this.setFrame(frame.col, frame.row, text);
        spokeOnce = true;
      } else {
        this.setFrame(frame.col, frame.row, undefined);
      }

      const delay = 2800 + Math.random() * 800;
      this.timers.setTimeout('workPool', schedule, delay);
    };

    schedule();
  }

  /**
   * Start processing animation
   */
  startProcessing(speech) {
    this.startWork('processing', speech);
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
   * Start thinking animation with progressive phases.
   * Phases use cumulative thresholds — phase N is active while
   * `elapsed < maxMs`. Advances thinking (0-15s) -> curious (15-30s) ->
   * deep thinking (30s+, individual think sprites).
   */
  startThinking(_getTextFn) {
    this.stopAll();
    this._currentState = 'thinking';
    const token = this._generateToken();
    this._currentToken = token;

    const phases = [
      { tag: 'thinking', speech: this._t('thinking'), maxMs: 8000 },
      { tag: 'curious', speech: this._t('curious') || 'Hmm?', maxMs: 10000 },
      // Deep thinking phase uses individual think sprites (kicks in ~10s)
      { type: 'deep', tag: 'thinking', speech: 'Let me think...', maxMs: Infinity },
    ];

    const startTime = Date.now();

    const runPhase = () => {
      if (!this._isTokenValid(token)) return;

      const elapsed = Date.now() - startTime;
      // First phase whose threshold is still ahead of us is the active one.
      const phase = phases.find(p => p.maxMs > elapsed) || phases[phases.length - 1];

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

      // Re-check exactly when this phase's own threshold is crossed.
      if (phase.maxMs !== Infinity) {
        const delay = phase.maxMs - elapsed + 200;
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
   * Analyze text and determine emotion.
   * Called on each message delta to detect emotional content.
   * Also checks for easter egg triggers.
   *
   * Uses the shared, precision-tuned pattern table in emotion-patterns.js —
   * only unambiguous signals (explicit laughter, strong exclamation/surprise,
   * explicit apology/error, explicit confusion) produce an override. Everyday
   * helpful-assistant phrasing intentionally returns null so the caller keeps
   * whatever contextual/category-driven state it was already in.
   */
  analyzeEmotion(text) {
    if (!text) return null;

    this._accumulatedText += text.toLowerCase();
    const recent = this._accumulatedText.slice(-RECENT_WINDOW);

    // Check for easter eggs first
    const easterEgg = this._checkEasterEggs(recent);
    if (easterEgg) {
      this._triggerEasterEgg(easterEgg);
    }

    const emotion = detectEmotion(recent);
    if (emotion) {
      this._emotionLock = emotion;
      return emotion;
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
