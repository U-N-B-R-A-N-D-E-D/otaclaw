/**
 * ConfigValidator - Validates OtaClaw configuration at runtime
 *
 * Detects configuration issues early before they cause cryptic runtime errors.
 * Provides clear error messages for common misconfigurations.
 *
 * ## Usage
 * ```javascript
 * const validator = new ConfigValidator(config);
 * const result = validator.validate();
 *
 * if (!result.valid) {
 *   console.error('Config errors:', result.errors);
 *   console.warn('Config warnings:', result.warnings);
 * }
 * ```
 */

export class ConfigValidator {
  constructor(config) {
    this.config = config;
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate entire configuration
   * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
   */
  validate() {
    this.errors = [];
    this.warnings = [];

    if (!this.config) {
      this.errors.push('Configuration is null or undefined');
      return { valid: false, errors: this.errors, warnings: this.warnings };
    }

    // Validate mode first
    this._validateMode();

    // Validate sections
    this._validateOpenClaw();
    this._validateLocalCluster();
    this._validateBehavior();
    this._validateStates();
    this._validateSprites();
    this._validateEventMap();
    this._validateDurations();

    const valid = this.errors.length === 0;

    if (valid && this.warnings.length > 0) {
      console.warn('[ConfigValidator] Warnings:', this.warnings);
    }

    return {
      valid,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Validate deployment mode
   */
  _validateMode() {
    const validModes = ['public', 'local'];
    const mode = this.config.mode || 'public';

    if (!validModes.includes(mode)) {
      this.warnings.push(`mode "${mode}" is not recognized (valid: ${validModes.join(', ')}), defaulting to "public"`);
    }
  }

  /**
   * Validate local cluster settings (for local mode)
   */
  _validateLocalCluster() {
    const mode = this.config.mode || 'public';
    const cluster = this.config.localCluster;

    // Skip validation if not in local mode or no cluster config
    if (mode !== 'local') return;
    if (!cluster) {
      this.warnings.push('localCluster section missing in local mode');
      return;
    }

    // Validate nodes array
    if (cluster.nodes !== undefined) {
      if (!Array.isArray(cluster.nodes)) {
        this.errors.push('localCluster.nodes must be an array');
      } else {
        for (const node of cluster.nodes) {
          if (typeof node !== 'string' || !node.match(/^(\d{1,3}\.){3}\d{1,3}$/)) {
            this.warnings.push(`localCluster.nodes contains invalid IP: ${node}`);
          }
        }
      }
    }

    // Validate model name
    if (cluster.modelName && typeof cluster.modelName !== 'string') {
      this.errors.push('localCluster.modelName must be a string');
    }

    // Validate showClusterStatus
    if (cluster.showClusterStatus !== undefined && typeof cluster.showClusterStatus !== 'boolean') {
      this.errors.push('localCluster.showClusterStatus must be a boolean');
    }
  }

  /**
   * Validate OpenClaw connection settings
   */
  _validateOpenClaw() {
    const oc = this.config.openclaw;

    if (!oc) {
      this.errors.push('Missing required section: openclaw');
      return;
    }

    // Host validation
    if (!oc.host) {
      this.warnings.push('openclaw.host is not set, will use "auto"');
    }

    // Port validation
    const port = Number(oc.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      this.errors.push(`openclaw.port must be a valid port number (1-65535), got: ${oc.port}`);
    }

    // WebSocket path
    if (oc.wsPath && typeof oc.wsPath !== 'string') {
      this.errors.push('openclaw.wsPath must be a string');
    }

    // Timeouts
    if (oc.connectionTimeout !== undefined) {
      const timeout = Number(oc.connectionTimeout);
      if (isNaN(timeout) || timeout < 1000) {
        this.warnings.push('openclaw.connectionTimeout is very low (<1000ms), may cause connection failures');
      }
    }

    // Reconnect settings
    if (oc.maxReconnectAttempts !== undefined && oc.maxReconnectAttempts < 0) {
      this.errors.push('openclaw.maxReconnectAttempts must be >= 0');
    }

    if (oc.reconnectInterval !== undefined) {
      const interval = Number(oc.reconnectInterval);
      if (isNaN(interval) || interval < 1000) {
        this.warnings.push('openclaw.reconnectInterval is very low (<1000ms)');
      }
    }
  }

  /**
   * Validate behavior settings
   */
  _validateBehavior() {
    const behavior = this.config.behavior;

    if (!behavior) {
      this.warnings.push('Missing behavior section, using defaults');
      return;
    }

    // Profile validation
    const validProfiles = ['default', 'minimal', 'expressive'];
    if (behavior.profile && !validProfiles.includes(behavior.profile)) {
      this.warnings.push(`behavior.profile "${behavior.profile}" is not recognized (valid: ${validProfiles.join(', ')})`);
    }

    // Idle timeout
    if (behavior.idleTimeout !== undefined) {
      const timeout = Number(behavior.idleTimeout);
      if (isNaN(timeout) || timeout < 0) {
        this.errors.push('behavior.idleTimeout must be a non-negative number');
      }
    }

    // Sleep idle
    if (behavior.sleepIdleMs !== undefined) {
      const sleepMs = Number(behavior.sleepIdleMs);
      if (isNaN(sleepMs)) {
        this.errors.push('behavior.sleepIdleMs must be a number');
      } else if (sleepMs > 0 && sleepMs < 30000) {
        this.warnings.push('behavior.sleepIdleMs is less than 30 seconds, may be annoying');
      }
    }
  }

  /**
   * Validate states configuration
   */
  _validateStates() {
    const states = this.config.states;

    if (!states) {
      this.warnings.push('Missing states array, using defaults');
      return;
    }

    if (!Array.isArray(states)) {
      this.errors.push('states must be an array');
      return;
    }

    const requiredStates = ['idle', 'thinking', 'processing', 'success', 'error'];
    for (const state of requiredStates) {
      if (!states.includes(state)) {
        this.warnings.push(`Missing recommended state: "${state}"`);
      }
    }

    // Check for duplicates
    const unique = new Set(states);
    if (unique.size !== states.length) {
      this.errors.push('states array contains duplicates');
    }
  }

  /**
   * Validate sprite configuration
   */
  _validateSprites() {
    const sprites = this.config.sprites;

    if (!sprites) {
      this.warnings.push('Missing sprites configuration, using defaults');
      return;
    }

    // Validate dimensions
    const dimensions = ['sheetWidth', 'sheetHeight', 'cellWidth', 'cellHeight'];
    for (const dim of dimensions) {
      if (sprites[dim] !== undefined) {
        const val = Number(sprites[dim]);
        if (isNaN(val) || val <= 0) {
          this.errors.push(`sprites.${dim} must be a positive number`);
        }
      }
    }

    // Validate tag mappings
    if (sprites.tagToFrames) {
      if (typeof sprites.tagToFrames !== 'object') {
        this.errors.push('sprites.tagToFrames must be an object');
      } else {
        for (const [tag, frames] of Object.entries(sprites.tagToFrames)) {
          if (!Array.isArray(frames)) {
            this.errors.push(`sprites.tagToFrames["${tag}"] must be an array of [col,row] arrays`);
            continue;
          }
          for (const frame of frames) {
            if (!Array.isArray(frame) || frame.length !== 2 ||
                typeof frame[0] !== 'number' || typeof frame[1] !== 'number') {
              this.errors.push(`sprites.tagToFrames["${tag}"] contains invalid frame: ${JSON.stringify(frame)}`);
              break;
            }
          }
        }
      }
    }

    // Validate idle sprites
    if (sprites.idleSprites && !Array.isArray(sprites.idleSprites)) {
      this.errors.push('sprites.idleSprites must be an array');
    }
  }

  /**
   * Validate event map configuration
   */
  _validateEventMap() {
    const eventMap = this.config.eventMap;
    const states = this.config.states || [];

    if (!eventMap) {
      this.warnings.push('Missing eventMap, no OpenClaw events will trigger state changes');
      return;
    }

    if (typeof eventMap !== 'object') {
      this.errors.push('eventMap must be an object');
      return;
    }

    // Validate that mapped states exist
    for (const [event, state] of Object.entries(eventMap)) {
      if (state === '*') continue; // Wildcard is valid

      if (!states.includes(state)) {
        this.errors.push(`eventMap["${event}"] maps to unknown state "${state}"`);
      }
    }

    // Warn about missing critical events
    const criticalEvents = [
      'agent.message.start',
      'agent.message.delta',
      'agent.message.complete',
      'agent.message.error',
    ];

    for (const event of criticalEvents) {
      if (!eventMap[event]) {
        this.warnings.push(`Missing eventMap mapping for "${event}"`);
      }
    }
  }

  /**
   * Validate state durations
   */
  _validateDurations() {
    const durations = this.config.stateDurations;

    if (!durations) return;

    if (typeof durations !== 'object') {
      this.errors.push('stateDurations must be an object');
      return;
    }

    const states = this.config.states || [];

    for (const [state, duration] of Object.entries(durations)) {
      if (!states.includes(state)) {
        this.warnings.push(`stateDurations["${state}"] is not a recognized state`);
      }

      const val = Number(duration);
      if (isNaN(val) || val < 0) {
        this.errors.push(`stateDurations["${state}"] must be a non-negative number`);
      }
    }
  }

  /**
   * Get a summary of the configuration
   * Useful for debugging
   */
  getSummary() {
    const oc = this.config?.openclaw || {};
    const behavior = this.config?.behavior || {};
    const states = this.config?.states || [];
    const cluster = this.config?.localCluster || {};

    const summary = {
      mode: this.config?.mode || 'public',
      openclaw: {
        host: oc.host || 'auto',
        port: oc.port || 18789,
        wsPath: oc.wsPath || '/ws',
      },
      behavior: {
        profile: behavior.profile || 'default',
        animations: behavior.animations !== false,
        touchEnabled: behavior.touchEnabled !== false,
        sounds: behavior.sounds === true,
      },
      states: {
        count: states.length,
        list: states.slice(0, 10),
      },
      sprites: {
        hasTagToFrames: !!this.config?.sprites?.tagToFrames,
        hasIdleSprites: !!this.config?.sprites?.idleSprites,
      },
      eventMap: {
        mappings: Object.keys(this.config?.eventMap || {}).length,
      },
    };

    // Add cluster info if in local mode
    if (this.config?.mode === 'local' && cluster.nodes) {
      summary.localCluster = {
        nodes: cluster.nodes.length,
        model: cluster.modelName || 'unknown',
        showStatus: cluster.showClusterStatus || false,
      };
    }

    return summary;
  }
}

/**
 * Quick validation function for one-off checks
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
export function validateConfig(config) {
  const validator = new ConfigValidator(config);
  return validator.validate();
}

export default ConfigValidator;
