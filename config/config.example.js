/**
 * OtaClaw for OpenClaw - Configuration Template
 *
 * Copy this file to config.js and customize for your setup:
 *   cp config/config.example.js config/config.js
 *
 * ## Modes
 * - "public": Standard OpenClaw connection (for GitHub/fresh installs)
 * - "local": Local inference cluster (Mac Minis array)
 *
 * ## Quick Setup
 * 1. For fresh OpenClaw install: Use as-is
 * 2. For local cluster: Change mode to "local" and set local gateway host
 */

export const OTACLAW_CONFIG = {
  /**
   * Deployment mode
   * "public": Connects to standard OpenClaw gateway
   * "local": Connects to local/private OpenClaw instance
   */
  mode: 'public',

  /**
   * OpenClaw Gateway Connection Settings
   * These define how OtaClaw connects to your OpenClaw instance
   */
  openclaw: {
    // Host: 'auto' = same as page (works when served from OpenClaw canvas)
    // For local mode, set to your local gateway IP (e.g., '192.168.1.100')
    host: 'auto',

    // Port where OpenClaw gateway is running (default: 18789)
    port: 18789,

    // WebSocket endpoint path
    wsPath: '/ws',

    // Send screen taps (tickles) to Discord
    tickleToDiscord: true,

    // Target format: "channel:<channel_id>" or "user:<user_id>".
    // Leave null to let OpenClaw determine default session routing.
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
    // Array of Mac Mini IPs for the inference cluster
    // Used for display/debugging purposes
    nodes: [
      // '192.168.1.10', // mini-1
      // '192.168.1.11', // mini-2
      // '192.168.1.12', // mini-3
      // '192.168.1.13', // mini-4
      // '192.168.1.14', // mini-5
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
    'scared'      // Alarmed
  ],

  /**
   * State Mapping
   * Map OpenClaw events to OtaClaw states
   * Format: 'openclaw.event.name': 'otaclaw-state'
   */
  eventMap: {
    // Agent events
    'agent.message.start': 'thinking',
    'agent.message.delta': 'processing',
    'agent.message.complete': 'success',
    'agent.message.error': 'error',
    'agent.tool.call': 'surprised',
    'agent.tool.result': 'success',
    'agent.tool.error': 'error',

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

    // Fallback for unknown OpenClaw events (prevents Hal from getting stuck)
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
        'agent.tool.call': 'surprised',
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
    tagToSequences: {
      // Example: success sequence cycling through frames
      // success: [[0, 1], [1, 1], [2, 1], [1, 1]],
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
    idleSequence: [
      0, 0, 1, 7, 8, 9, 3, 0, 4, 1, 7, 8, 9, 0, 5, 0, 2, 6, 0, 1, 7, 8, 9, 0,
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
    configRequired: 'Configure OpenClaw connection in js/config.js',
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
};

/**
 * Mode-specific overrides
 * These are applied based on the 'mode' setting above
 */
export const MODE_OVERRIDES = {
  public: {
    // Standard OpenClaw defaults - no overrides needed
  },

  local: {
    // Local cluster settings
    openclaw: {
      // Auto-detect won't work if served from file://
      // Set to your local OpenClaw gateway IP
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
  },
};

export default OTACLAW_CONFIG;
