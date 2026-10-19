/**
 * OtaClaw Configuration Template
 *
 * Copy this file to config.js and customize for your setup:
 *   cp config/config.example.js config/config.js
 *
 * ## Modes
 * - "public": Standard gateway connection (OpenClaw or any compatible WS bridge)
 * - "local": Local inference cluster (several small machines, llama.cpp, vLLM, etc.)
 *
 * ## Quick Setup
 * 1. Point `gateway` at any event gateway that emits agent.* / gateway.* events
 * 2. For OpenClaw: defaults below work OOTB
 * 3. For local cluster: set mode to "local" and gateway.host to your WS host
 *
 * `gateway` is preferred. `openclaw` remains a backward-compatible alias
 * (both keys are synced at runtime).
 */

export const OTACLAW_CONFIG = {
  /**
   * Deployment mode
   * "public": Connects to a standard event gateway
   * "local": Connects to a local/private inference + gateway stack
   */
  mode: 'public',

  /**
   * Event Gateway Connection Settings
   * Any WebSocket gateway that speaks the OtaClaw event protocol works:
   * OpenClaw or a custom bridge in front of any LLM.
   */
  gateway: {
    // Host: 'auto' = same as page (works when served from the gateway)
    // For local mode, set to your local gateway IP (e.g., '192.0.2.100')
    host: 'auto',

    // Port where the event gateway is running (OpenClaw default: 18789)
    port: 18789,

    // WebSocket endpoint path
    wsPath: '/ws',

    // Send screen taps (tickles) to Discord (when gateway supports it)
    tickleToDiscord: true,

    // Target format: "channel:<channel_id>" or "user:<user_id>".
    // Leave null to let the gateway determine default session routing.
    tickleDiscordChannel: null,

    // Reconnection interval in milliseconds (default: 5000ms = 5s)
    reconnectInterval: 5000,

    // Use exponential backoff between reconnect attempts (5s, 10s, 20s, ...)
    reconnectBackoff: true,

    // Maximum delay between reconnect attempts when using backoff (ms)
    maxBackoffMs: 60000,

    // Switch to demo mode after N failed reconnects (0 = never)
    offlineAfterReconnects: 5,

    // Maximum reconnection attempts (0 = unlimited)
    maxReconnectAttempts: 0,

    // Connection timeout in milliseconds (default: 10000ms = 10s)
    connectionTimeout: 10000,

    // Batch agent.message.delta for N ms to reduce DOM thrash (0 = no batching)
    deltaBatchMs: 100,

    // Heartbeat ping interval (higher = lower CPU/network usage)
    heartbeatInterval: 45000,

    // Consider connection stale after this many milliseconds without inbound messages
    staleThreshold: 120000,

    // Cap offline queue size to avoid memory growth during long disconnects
    maxQueuedMessages: 120,

    // Show connection metrics in debug panel (lastEvent, reconnectAttempts, etc.)
    debugPanel: true,
  },

  /**
   * Local Cluster Settings (mode: 'local')
   * Configure when running against local inference array
   */
  localCluster: {
    // Array of node IPs for the inference cluster
    // Used for display/debugging purposes
    nodes: [
      // '192.0.2.10', // node-1
      // '192.0.2.11', // node-2
      // '192.0.2.12', // node-3
      // '192.0.2.13', // node-4
      // '192.0.2.14', // node-5
    ],

    // Model being served (for display purposes)
    modelName: 'Qwen3.5-4B',

    // Show cluster status in UI
    showClusterStatus: false,
  },

  /**
   * Behavior Settings
   * Control how OtaClaw behaves and responds
   */
  behavior: {
    // Profile: 'default' | 'minimal' | 'expressive'
    // minimal = fewer state changes, expressive = more reactions
    profile: 'expressive',

    // Time in milliseconds before returning to idle state (default: 30000ms = 30s)
    idleTimeout: 30000,

    // Time in milliseconds before sleeping (0 = infinite idle). Recommended 180000 for kiosks to save screen.
    sleepIdleMs: 180000,

    // Enable CSS animations (set to false for better performance on low-end devices)
    animations: true,

    // Apply lower-cost visual effects in kiosk mode
    lowPowerMode: true,

    // Enable sound effects (requires user interaction first due to browser policies)
    sounds: false,

    // Enable touch interactions (optimized for touchscreen displays)
    touchEnabled: true,

    // Enable debug panel (press 'd' key to toggle)
    debug: false,

    // Show connection status bar
    showStatusBar: true,

    // Auto-hide connection overlay after successful connection
    autoHideOverlay: true,

    // Agent response timeout before showing error state (ms)
    agentResponseTimeoutMs: 35000,

    // StockAgent trade/movement speech bubble display (10–20s recommended)
    stockagentBubbleMs: 15000,
  },

  /**
   * Display Settings
   * Configure visual presentation
   */
  display: {
    // Run in fullscreen mode
    fullscreen: false,

    // Kiosk mode (hides cursor, prevents context menu)
    kioskMode: false,

    // Screen rotation for kiosk displays (0, 90, 180, 270)
    rotation: 0,

    // URL to trigger external buzzer on tickle (optional)
    // buzzerTickleUrl: 'http://raspberrypi.local:5000/buzzer',
  },

  /**
   * Available Emotional States
   * These are the states OtaClaw can display
   * You can customize or extend these in custom states
   */
  states: [
    'idle',       // Default state, gentle breathing
    'thinking',   // Processing started, hands on head
    'processing', // Generating response, eyes active
    'success',    // Response complete, thumbs up
    'error',      // Error occurred, crying
    'laughing',   // Humor detected, laughing
    'surprised',  // Tool call or unexpected result
    'curious',    // Interested, exploring
    'confused',   // Puzzled, questioning
    'excited',    // Enthusiastic, animated
    'presenting', // Ta-da, brief transition before idle
    'worried',    // Concerned, making a mistake
    'sad',        // Disappointed
    'scared',     // Alarmed
    'tool',       // Using a tool (one stable pose for every tool call)
    'attention'   // Waiting for the user (needs input / approval)
  ],

  /**
   * State Mapping
   * Map gateway events to OtaClaw states
   * Format: 'event.name': 'otaclaw-state'
   */
  eventMap: {
    // Agent events
    'agent.message.start': 'thinking',
    'agent.message.delta': 'processing',
    'agent.message.complete': 'success',
    'agent.message.error': 'error',
    'agent.tool.call': 'tool',
    'agent.tool.result': 'thinking', // run is not finished: no success flash per tool
    'agent.tool.error': 'error',

    // Tool categories
    // (with stateSprites enabled these all collapse into the single 'tool' state)
    'agent.tool.search':   'tool',
    'agent.tool.creative': 'tool',
    'agent.tool.risky':    'tool',
    'agent.tool.analytical': 'tool',
    'agent.tool.communication': 'tool',
    'agent.tool.neutral':  'tool',

    // Progress phases
    'agent.progress.planning':    'thinking',
    'agent.progress.executing':   'processing',
    'agent.progress.validating':  'curious',
    'agent.progress.finalizing':  'presenting',

    // Gateway events
    'gateway.idle': 'idle',
    'gateway.ready': 'idle',
    'gateway.error': 'error',

    // User events
    'user.presence': 'thinking',
    'user.typing': 'thinking',

    // Session/channel events
    'session.start': 'thinking',
    'session.end': 'idle',
    'channel.connected': 'idle',
    'channel.disconnected': 'idle',

    // Free-form signal (name or emoji) -> state via stateSprites.signalMap
    // 'agent.signal' is handled by the client and does not need an entry here.

    // Fallback for unknown gateway events (prevents Hal from getting stuck)
    '*': 'idle',
  },

  /**
   * Event priority: higher wins when events overlap (e.g. gateway.idle during thinking).
   * agent.tool.call can briefly interrupt thinking/processing (surprised) then return.
   */
  eventPriority: {
    'agent.message.error': 10,
    'agent.tool.error': 10,
    'agent.message.complete': 5,
    'agent.tool.result': 5,
    'agent.tool.call': 4,
    'agent.tool.creative': 7,
    'agent.tool.risky': 8,
    'agent.progress.planning': 4,
    'agent.progress.executing': 5,
    'agent.progress.validating': 5,
    'agent.progress.finalizing': 6,
    'agent.message.start': 3,
    'agent.message.delta': 3,
    'gateway.error': 10,
    'gateway.idle': 1,
    'gateway.ready': 1,
    'session.start': 3,
    'session.end': 2,
    'channel.connected': 2,
    'channel.disconnected': 2,
  },

  /**
   * State Durations
   * How long to stay in each state before returning to idle (in milliseconds)
   * Set to 0 to require explicit state change
   */
  stateDurations: {
    thinking: 0,      // Until event changes it
    processing: 0,    // Until event changes it
    success: 3000,    // 3 seconds
    error: 5000,      // 5 seconds
    laughing: 4000,   // 4 seconds
    surprised: 2500,  // 2.5 seconds
    curious: 3000,
    confused: 3000,
    excited: 2500,
  },

  /**
   * State chaining: after state A, briefly show state B before idle.
   * Example: success → presenting (500ms) → idle
   */
  stateChaining: {
    success: { next: 'presenting', duration: 1500 },
  },

  /**
   * Behavior Profiles
   * Override eventMap and stateDurations for different personalities
   */
  profiles: {
    default: {},

    minimal: {
      // Fewer state changes, simpler reactions
      eventMap: {
        'agent.message.start': 'thinking',
        'agent.message.delta': 'thinking', // Stay in thinking, don't flicker
        'agent.message.complete': 'success',
        'agent.message.error': 'error',
        'agent.tool.call': 'thinking',
        'gateway.idle': 'idle',
        'gateway.error': 'error',
        '*': 'idle',
      },
      stateDurations: {
        success: 2000,
        error: 3000,
      },
    },

    expressive: {
      // More animated reactions
      eventMap: {
        'agent.message.start': 'thinking',
        'agent.message.delta': 'processing',
        'agent.message.complete': 'success',
        'agent.message.error': 'error',
        'agent.tool.call': 'tool',
        'gateway.idle': 'idle',
        'gateway.error': 'error',
        '*': 'idle',
      },
      stateDurations: {
        success: 4000,
        error: 6000,
        laughing: 5000,
        surprised: 3000,
      },
    },
  },

  /**
   * Coherent state -> sprite mapping (see docs/STATE-SPRITES.md).
   * Each state plays one fixed, deterministic frame sequence; state changes are
   * debounced by priority + minimum hold time. Set enabled:false for the legacy
   * random-pool behaviour.
   */
  stateSprites: {
    enabled: true,
    // Let tool categories (search/creative/risky...) pick different poses
    // instead of the single 'tool' pose.
    toolCategoryReactions: false,
    // Override or add states, e.g.:
    // states: { tool: { sequence: [[8, 2], [6, 1]], frameMs: 2000, minHoldMs: 1200 } },
    // Extra signal -> state entries for 'agent.signal' events (names or emoji):
    // signalMap: { '🧪': 'tool', 'blocked': 'attention' },
    states: {},
    signalMap: {},
  },

  /**
   * Sprite Configuration
   * Controls how frames are loaded and displayed
   */
  sprites: {
    // Base path for sprite assets
    basePath: 'assets/sprites/',

    // Sprite sheet filename (without extension)
    sheetFile: 'otaclock-original',

    // Image format: 'png' | 'webp' | 'jpg'
    format: 'png',

    // Sheet dimensions (pixels)
    sheetWidth: 567,
    sheetHeight: 278,

    // Cell dimensions (pixels)
    cellWidth: 47,
    cellHeight: 70,

    // Target display height for scaling calculations
    displayTargetHeight: 320,

    // Blink overlay animation
    blinkOverlay: true,
    blinkIntervalMinMs: 2000,
    blinkIntervalMaxMs: 4000,

    // Tag-based frame selection (for semantic animations)
    // Maps emotion tags to arrays of [col, row] coordinates
    tagToFrames: {
      idle: [[0, 0], [1, 0]],
      thinking: [[2, 0], [3, 0], [4, 0], [5, 0]],
      processing: [[6, 0], [7, 0], [8, 0], [9, 0]],
      success: [[0, 1], [1, 1], [2, 1]],
      error: [[0, 2], [1, 2], [2, 2]],
      laughing: [[2, 3], [3, 3]],
      surprised: [[0, 3], [1, 3]],
    },

    // Sequential animations (play frames in order)
    // Populated with catalog sequences so more sprites + full animation sequences are used.
    // Success/laughing/etc will prefer playing these for emotional, task-matched animation.
    tagToSequences: {
      success: [[0,1],[1,1],[2,1]],
      laughing: [[2,3],[3,3]],
      thinking: [[1,0],[2,0],[1,0]],
      processing: [[6,0],[7,0],[6,1],[7,1]],
      surprised: [[9,0],[10,0]],
      curious: [[5,2],[1,2]],
      confused: [[1,2],[5,0]],
      excited: [[2,1],[6,3],[7,3]],
      worried: [[0,2],[4,2]],
      presenting: [[6,3],[7,3]],
      error: [[0,2],[2,2],[3,2]],
      sad: [[2,2],[3,2]],
      scared: [[9,0],[10,0],[10,3]],
    },

    // Frame timing overrides (ms per frame for specific states)
    frameTiming: {
      // Example: slower thinking animation
      // thinking: { frameMs: [800, 600, 800, 600] },
    },

    // Hold specific frames longer
    holdFrames: {
      // Example: hold first idle frame longer
      // idle: { index: 0, ms: 2000 },
    },

    // Frame duration for tag sequences
    tagSequenceFrameMs: 350,

    // Idle animation sprite filenames (if using individual files instead of sheet)
    idleSprites: [],

    // Idle animation sequence (indices into idleSprites or sheet positions)
    // Calm idle sequence for the early "waiting" phase (before full organic idle).
    // Prefer explicit [col, row] of resting/calm frames.
    idleSequence: [
      [0, 0], [0, 0], [3, 0], [0, 0], [4, 0], [5, 1], [0, 0], [8, 0], [3, 0], [0, 0],
      [4, 0], [0, 0], [5, 1],
    ],
  },

  /**
   * Sound Effects
   * Optional audio feedback for states
   */
  sounds: {
    // Enable sounds (requires user interaction first due to browser policies)
    enabled: false,

    // Base path for sound files
    basePath: 'assets/sounds/',

    // Volume (0.0 - 1.0)
    volume: 0.5,

    // Sound files for each state (optional)
    files: {
      // success: 'success.wav',
      // error: 'error.wav',
      // tickle: 'laugh.wav',
    },
  },

  /**
   * Touch/Gesture Configuration
   */
  touch: {
    // Enable swipe gesture for tickle
    swipeEnabled: true,

    // Minimum swipe distance (pixels)
    swipeMinPx: 20,

    // Maximum swipe time (ms)
    swipeMaxMs: 1800,

    // Margin around sprite for swipe detection (0-1, as percentage of sprite size)
    spriteMargin: 0.25,

    // Long press duration for debug panel (ms)
    longPressDuration: 800,
  },

  /**
   * Internationalization
   * Speech bubble text for different states
   */
  i18n: {
    thinking: 'Hmmm....',
    processing: 'Processing',
    tool: 'Working...',
    attention: 'Hey!',
    success: 'Got it!',
    error: 'Oops...',
    laughing: 'Haha!',
    surprised: 'Woah!',
    curious: 'Hmm?',
    confused: 'Huh?',
    excited: 'Wow!',
    contemplative: 'Hmmm....',
    waving: 'Hey!',
    worried: 'Hmm...',
    presenting: 'Ta-da!',
    timeout: 'Timeout',
    listenerTimeout: 'Listener timeout',
    connectionError: 'Connection error',
    networkError: 'Network error',
    rejected: 'Rejected',
    unknownError: 'Unknown error',
    connecting: 'Connecting...',
    checkConfig: 'Check config',
    reconnecting: 'Reconnecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
    offline: 'Demo Mode',
    configRequired: 'Configure gateway connection in js/config.js',
    configError: 'Configuration error: Copy config.example.js to config.js',
    runtimeError: 'Runtime error: ',
    loading: 'Loading…',
  },

  /**
   * Personality Presets
   * Override i18n strings for different characters
   */
  personalities: {
    default: {},

    hal: {
      // Hal Emmerich (Metal Gear Solid inspired)
      thinking: ['Hmmm....', 'Let me think...', 'Processing...'],
      processing: 'Processing',
      success: ['Got it!', 'Done!', 'There we go!'],
      error: ['Oops...', 'That did not work...', 'Error!'],
      laughing: ['Haha!', 'Hehe!', 'LOL!'],
      surprised: ['Woah!', 'Oh!', 'Unexpected!'],
      curious: 'Hmm?',
      confused: 'Huh?',
      excited: ['Wow!', 'Amazing!', 'Cool!'],
      worried: 'Hmm...',
      presenting: 'Ta-da!',
    },
  },

  /**
   * Personality selection
   * Set to key in personalities object above
   */
  personality: 'default',

  /**
   * Logging
   */
  logging: {
    // Level: 'debug' | 'info' | 'warn' | 'error'
    level: 'info',

    // Log to console
    console: true,
  },

  /**
   * Monitoring (OtaclawMonitor)
   * Optional, low-overhead logging/metrics/remote-export system.
   * See: src/js/core/monitor.js and docs/MONITORING.md
   */
  monitoring: {
    // Level-0: console output (mirrors `logging.console` for back-compat)
    console: true,

    // Level-1: collect in-memory metrics (connection, emotions, performance)
    // Off by default to keep production overhead at zero.
    metrics: false,

    // Level-3: remote endpoint for batched event export (debug only)
    remote: false,
    remoteEndpoint: null,
    batchInterval: 5000,

    // Threshold used by monitor: 'debug' | 'info' | 'warn' | 'error'
    logLevel: 'info',
  },
};

/**
 * Mode-specific overrides
 * These are applied based on the 'mode' setting above
 */
export const MODE_OVERRIDES = {
  public: {
    // Standard gateway defaults - no overrides needed
  },

  local: {
    // Local cluster settings
    gateway: {
      // Auto-detect won't work if served from file://
      // Set to your local event gateway IP
      host: 'localhost',
      // Longer timeouts for local development
      connectionTimeout: 15000,
      heartbeatInterval: 30000,
    },
    localCluster: {
      showClusterStatus: true,
    },
    behavior: {
      debug: true,
      agentResponseTimeoutMs: 60000, // Longer for local inference
    },
    logging: {
      level: 'debug',
    },
    monitoring: {
      metrics: true,
      logLevel: 'debug',
    },
  },
};

export default OTACLAW_CONFIG;
