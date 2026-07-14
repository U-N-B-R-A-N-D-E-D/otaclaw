/**
 * CharacterExpressionEngine - Otacon-style speech expression management
 *
 * Maps processing states and LLM activities to short, in-character phrases.
 * Ensures NO technical content (file paths, commands, etc.) ever reaches
 * the speech bubble - only Otacon-style personality expressions.
 *
 * ## Design Principles
 * - All expressions are 20 chars or less (bubble friendly)
 * - Personality: nerdy, anxious, helpful, anime-loving, loyal
 * - Technical operations map to character reactions
 * - Emotional variety prevents repetition
 *
 * ## Usage
 * ```javascript
 * const expressions = new CharacterExpressionEngine(config);
 * const expr = expressions.getExpression({
 *   state: 'thinking',
 *   activity: 'reading',
 *   progress: 'active'
 * });
 * // Returns: "Reading..." or "Hmmm..." or "Scanning..."
 * ```
 */

export class CharacterExpressionEngine {
  constructor(config = {}) {
    this.config = config;
    this._expressionHistory = [];
    this._lastActivity = null;
    this._varietyIndex = 0;

    // Expression pools for variety (prevent repetition)
    this._pools = this._buildExpressionPools();
  }

  /**
   * Build expression pools for each activity type
   * Each pool contains multiple variations for variety
   */
  _buildExpressionPools() {
    return {
      // File operations - nerdy/technical but brief
      reading: [
        "Reading...",
        "Scanning...",
        "Hmmm...",
        "Analyzing...",
        "Checking...",
        "Oh! Files...",
      ],

      // Writing code - creator mindset
      writing: [
        "Coding...",
        "Building...",
        "Typing...",
        "Creating...",
        "Hmmm...",
        "Designing...",
      ],

      // Searching - curious/investigative
      searching: [
        "Searching...",
        "Looking...",
        "Hunting...",
        "Digging...",
        "Finding...",
        "Where is it?",
      ],

      // Processing - working hard
      processing: [
        "Working...",
        "Processing...",
        "Thinking...",
        "Hmmm...",
        "Crunching...",
        "Almost...",
      ],

      // Debugging - problem solving
      debugging: [
        "Fixing...",
        "Debugging...",
        "Checking...",
        "Hmmm...",
        "Solving...",
        "Tracing...",
      ],

      // Planning - strategic thinking
      planning: [
        "Planning...",
        "Mapping...",
        "Structuring...",
        "Hmmm...",
        "Organizing...",
      ],

      // Terminal/execution - action oriented
      executing: [
        "Running...",
        "Executing...",
        "Launching...",
        "Go!",
        "Working...",
      ],

      // Web/API operations - connected
      browsing: [
        "Browsing...",
        "Fetching...",
        "Connecting...",
        "Loading...",
        "Accessing...",
      ],

      // Testing - verification
      testing: [
        "Testing...",
        "Verifying...",
        "Checking...",
        "Validating...",
        "Hmmm...",
      ],

      // Waiting - patient/anxious
      waiting: [
        "Waiting...",
        "Hmmm...",
        "Standby...",
        "Patience...",
        "Soon...",
        "Any moment...",
      ],

      // Success - celebration!
      success: [
        "Got it!",
        "Done!",
        "Finished!",
        "Success!",
        "Ta-da!",
        "Complete!",
        "Yay!",
      ],

      // Error - apologetic/anxious
      error: [
        "Oops...",
        "Oh no...",
        "Error...",
        "Sorry!",
        "Uh oh...",
        "Hmm...",
        "Failed...",
      ],

      // Thinking - contemplative
      thinking: [
        "Hmmm...",
        "Thinking...",
        "Pondering...",
        "Wondering...",
        "Processing...",
        "Hmm?",
      ],

      // Idle - available/helpful
      idle: [
        "",
        "Hi!",
        "Hey!",
        "Ready!",
        "Waiting...",
      ],

      // Long operations - progress indication
      longRunning: [
        "Still on it!",
        "Working...",
        "Almost...",
        "Hang on...",
        "Continuing...",
        "Steady...",
      ],

      // Tool use - surprised/helpful
      toolUse: [
        "Oh!",
        "Tool time!",
        "Using...",
        "Accessing...",
        "Helpful!",
      ],

      // Emotional reactions
      laughing: [
        "Haha!",
        "Hehe!",
        "LOL!",
        "Funny!",
        "😂",
      ],

      surprised: [
        "Oh!",
        "Wow!",
        "Whoa!",
        "Amazing!",
        "Cool!",
      ],

      excited: [
        "Cool!",
        "Awesome!",
        "Nice!",
        "Sweet!",
        "Neat!",
      ],

      worried: [
        "Hmm...",
        "Uh oh...",
        "Careful...",
        "Warning...",
        "Oops...",
      ],

      curious: [
        "Hmm?",
        "What?",
        "How?",
        "Why?",
        "Interesting!",
      ],

      confused: [
        "Huh?",
        "What?",
        "Confused...",
        "Hmm?",
        "Lost...",
      ],

      // Special - Otacon personality
      animeReference: [
        "Like anime!",
        "So cool!",
        "Epic!",
        "Like MG!",
        "Otaku mode!",
      ],

      snakeReference: [
        "Snake?",
        "Snake?!",
        "SNAAAAKE!",
      ],
    };
  }

  /**
   * Get expression for current state and activity
   * @param {Object} options - Expression context
   * @param {string} options.state - Current state (thinking, processing, etc.)
   * @param {string} options.activity - Detected activity type
   * @param {string} options.progress - 'start' | 'active' | 'end'
   * @param {number} options.durationMs - How long in current state
   * @param {string} options.emotion - Override emotion
   * @returns {string} Short expression (max 20 chars)
   */
  getExpression(options = {}) {
    const { state, activity, progress, durationMs = 0, emotion } = options;

    // If emotion override provided, use emotional pool
    if (emotion && this._pools[emotion]) {
      return this._selectFromPool(emotion);
    }

    // Map activity to pool
    const poolName = this._mapActivityToPool(activity, state);

    // For long operations, switch to longRunning pool
    if (durationMs > 30000 && poolName !== 'success' && poolName !== 'error') {
      return this._selectFromPool('longRunning');
    }

    return this._selectFromPool(poolName);
  }

  /**
   * Detect activity type from text content
   * This is used to determine what expression to show
   * @param {string} text - Accumulated text or context
   * @returns {string} Activity type
   */
  detectActivity(text) {
    if (!text || typeof text !== 'string') return 'processing';

    const lower = text.toLowerCase();

    // File operations
    if (lower.match(/reading|viewing|checking.*file|opening|loading.*file/)) {
      return 'reading';
    }

    // Writing operations
    if (lower.match(/writing|editing|creating.*file|saving|modifying|updating/)) {
      return 'writing';
    }

    // Searching
    if (lower.match(/searching|finding|looking for|querying|fetching/)) {
      return 'searching';
    }

    // Debugging/fixing
    if (lower.match(/fixing|debugging|correcting|refactoring|repairing/)) {
      return 'debugging';
    }

    // Testing
    if (lower.match(/testing|running.*test|verifying|validating|checking/)) {
      return 'testing';
    }

    // Planning/Designing
    if (lower.match(/planning|designing|structuring|architecting|mapping/)) {
      return 'planning';
    }

    // Terminal execution
    if (lower.match(/executing|running.*command|terminal|shell|npm|pip|node/)) {
      return 'executing';
    }

    // Web/API operations
    if (lower.match(/browsing|fetching|scraping|http|api|downloading|uploading/)) {
      return 'browsing';
    }

    // Tool use
    if (lower.match(/using.*tool|calling|invoking|tool.*use/)) {
      return 'toolUse';
    }

    // Emotional detection for reactions — kept intentionally narrow so mundane
    // helpful-assistant phrasing ("oh! found it", "cool, that works", "why?")
    // doesn't mismatch the speech bubble caption against the actual pose
    // (same precision principle as core/emotion-patterns.js).
    if (lower.match(/haha|hehe|lol|😂|🤣/)) {
      return 'laughing';
    }
    if (lower.match(/wow|amazing|incredible|awesome/)) {
      return 'excited';
    }
    if (lower.match(/whoa|oops|uh oh/)) {
      return 'worried';
    }
    if (lower.match(/hmm\?|curious|wonder/)) {
      return 'curious';
    }
    if (lower.match(/huh\?|confused|unclear/)) {
      return 'confused';
    }

    // Default based on common operations
    if (lower.match(/generating|building|creating|making/)) {
      return 'writing';
    }
    if (lower.match(/calculating|computing|processing|analyzing/)) {
      return 'processing';
    }

    return 'processing';
  }

  /**
   * Map activity/state to expression pool
   */
  _mapActivityToPool(activity, state) {
    // State overrides activity for terminal states
    if (state === 'success') return 'success';
    if (state === 'error') return 'error';
    if (state === 'idle') return 'idle';
    if (state === 'thinking') return 'thinking';

    // Activity mapping
    const mapping = {
      reading: 'reading',
      writing: 'writing',
      searching: 'searching',
      debugging: 'debugging',
      planning: 'planning',
      executing: 'executing',
      browsing: 'browsing',
      testing: 'testing',
      processing: 'processing',
      waiting: 'waiting',
      toolUse: 'toolUse',
      laughing: 'laughing',
      surprised: 'surprised',
      excited: 'excited',
      worried: 'worried',
      curious: 'curious',
      confused: 'confused',
    };

    return mapping[activity] || 'processing';
  }

  /**
   * Select expression from pool with variety
   * Avoids repeating the same expression consecutively
   */
  _selectFromPool(poolName) {
    const pool = this._pools[poolName];
    if (!pool || pool.length === 0) return '...';

    // Filter out recently used expressions
    const available = pool.filter(e => !this._expressionHistory.includes(e));
    const candidates = available.length > 0 ? available : pool;

    // Select randomly from candidates
    const selection = candidates[Math.floor(Math.random() * candidates.length)];

    // Update history (keep last 3)
    this._expressionHistory.push(selection);
    if (this._expressionHistory.length > 3) {
      this._expressionHistory.shift();
    }

    return selection;
  }

  /**
   * Get expression for streaming/progress updates
   * Uses time-based cycling for long operations
   */
  getStreamingExpression(state, accumulatedText, durationMs) {
    // First detect what we're doing
    const activity = this.detectActivity(accumulatedText);

    // For very long operations, cycle through expressions
    if (durationMs > 20000) {
      const cycleIndex = Math.floor(durationMs / 10000) % 3;
      const cycles = {
        reading: ['Reading...', 'Still reading...', 'Almost done...'],
        writing: ['Coding...', 'Still coding...', 'Wrapping up...'],
        searching: ['Searching...', 'Digging deeper...', 'Found it!'],
        processing: ['Working...', 'Still working...', 'Almost there...'],
      };
      const cycle = cycles[activity] || cycles.processing;
      return cycle[cycleIndex];
    }

    return this.getExpression({ state, activity, durationMs });
  }

  /**
   * Get expression for specific tool being used
   * More specific than general activity detection
   */
  getToolExpression(toolName) {
    const toolMap = {
      'read_file': 'reading',
      'write_file': 'writing',
      'search_files': 'searching',
      'execute_command': 'executing',
      'web_search': 'browsing',
      'browser_navigate': 'browsing',
    };

    const activity = toolMap[toolName] || 'processing';
    return this.getExpression({ activity });
  }

  /**
   * Get completion expression based on what was done
   */
  getCompletionExpression(activity, success = true) {
    if (!success) {
      return this._selectFromPool('error');
    }

    const completions = {
      reading: ['Got it!', 'Read!', 'Done!'],
      writing: ['Saved!', 'Written!', 'Done!'],
      searching: ['Found!', 'Located!', 'There!'],
      debugging: ['Fixed!', 'Debugged!', 'Solved!'],
      testing: ['Tested!', 'Passed!', 'Good!'],
      planning: ['Planned!', 'Mapped!', 'Ready!'],
      executing: ['Ran!', 'Done!', 'Finished!'],
      browsing: ['Loaded!', 'Fetched!', 'Got it!'],
      processing: ['Done!', 'Complete!', 'Finished!'],
    };

    const pool = completions[activity] || completions.processing;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Reset expression history for fresh start
   */
  reset() {
    this._expressionHistory = [];
    this._lastActivity = null;
    this._varietyIndex = 0;
  }

  /**
   * i18n helper - gets translation from config
   * Falls back to Otacon personality defaults
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
      waving: 'Hey!',
      wink: ';)',
      sad: 'Aww...',
      scared: 'Yikes!',
      confident: 'Easy!',
    };

    const val = this.config?.i18n?.[key] ||
      this.config?.personalities?.[this.config?.personality]?.[key] ||
      fallbacks[key] ||
      key;

    return Array.isArray(val)
      ? val[Math.floor(Math.random() * val.length)]
      : val;
  }
}

/**
 * Singleton instance for convenience
 */
export const characterExpression = new CharacterExpressionEngine();

export default CharacterExpressionEngine;
