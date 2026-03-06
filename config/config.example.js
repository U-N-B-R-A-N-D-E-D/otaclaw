/**
 * OtaClaw for OpenClaw - Configuration Template
 * 
 * Copy this file to config.js and customize for your setup:
 *   cp config/config.example.js config/config.js
 */

export const OTACLAW_CONFIG = {
  /**
   * OpenClaw Gateway Connection Settings
   * These define how OtaClaw connects to your OpenClaw instance
   */
  openclaw: {
    // Host: 'auto' = same as page (works when served from OpenClaw canvas)
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
    laughing: { next: 'excited', duration: 1000 },
    error: { next: 'sad', duration: 2000 },
  },

  /**
   * Sprite Settings
   * Configure how sprites are loaded and displayed
   */
  sprites: {
    // Use CSS sprites (true) or image files (false)
    useCSS: true,
    
    // Preload sprite sheet on init (reduces first-frame delay)
    preload: true,

    // Base path for sprite images (if useCSS is false)
    basePath: 'assets/sprites/',

    // Base filename for the main sheet (without extension)
    sheetFile: 'otaclock-original',
    
    // File format for sprites (png, gif, webp)
    format: 'png',

    // Main sheet dimensions and grid cell size (used for direct frame rendering)
    sheetWidth: 567,
    sheetHeight: 278,
    cellWidth: 47,
    cellHeight: 70,
    displayTargetHeight: 320,

    // Idle sequence and pacing (for low-power natural movement)
    idleSequence: [
      [0, 0], [0, 0], [3, 0], [0, 0], 
      [4, 0], [0, 0], [5, 1], [0, 0], 
      [8, 0], [0, 0], [1, 0], [0, 0]
    ],
    idleBaseDelayMs: 2500,
    idleJitterMs: 2000,

    // Per-phase timing for more organic idle (overrides base/jitter when set)
    idlePhaseTiming: {
      neutral: { baseMs: 3000, jitterMs: 2000 },
      coat: { baseMs: 5000, jitterMs: 3000 },
      blink: { baseMs: 50, jitterMs: 0 },
    },

    // Blink overlay: single closed-eyes frame, ~80ms, runs during all states
    blinkOverlay: true,
    blinkFrame: 8,
    blinkDurationMs: 80,
    blinkIntervalMinMs: 1500,
    blinkIntervalMaxMs: 5000,
    
    // Individual sprite files per state (used when otaclock-original.png not available)
    laughingSprites: null,

    // Number of animation frames per state
    frames: {
      idle: 2,
      thinking: 2,
      processing: 4,
      success: 2,
      error: 2,
      laughing: 3,
      surprised: 2,
      curious: 1,
      confused: 2,
      excited: 2,
    },
    
    // Animation speed in frames per second
    fps: 8,

    /**
     * Per-frame timing for smoother, more organic animations.
     * frameMs: number = same delay for all frames; number[] = per-frame delay.
     * Keyframes (e.g. thumbs-up payoff) can hold longer via holdFrames.
     */
    frameTiming: {
      success: { frameMs: [200, 200, 200, 800, 200, 200, 200] },
      thinking: { frameMs: 300 },
      processing: { frameMs: 250 },
      error: { frameMs: [400, 600] },
      surprised: { frameMs: 350 },
      laughing: { frameMs: 350 },
    },

    /**
     * Keyframe hold: when sequence reaches this index, hold for ms before next frame.
     * E.g. success frame 3 (thumbs up) holds 800ms for payoff.
     */
    holdFrames: {
      success: { index: 3, ms: 800 },
    },

    /**
     * Optional explicit sequence config. When set, overrides successSprites + frameTiming.
     * Enables custom sprite order and per-frame timing in one place.
     */
    // successSequence: { sprites: ['thumbs_00.png', ...], frameMs: [200,200,200,800,200,200,200], loop: false },

    /**
     * Tag-to-sequence mapping: when agent sends tag, play this [col,row] sequence.
     * Falls back to tagToFrames (single random frame) if no sequence.
     */
    tagToSequences: {
      laughing: [[2, 3], [3, 3], [2, 3], [3, 3]],
      success: [[0, 1], [1, 1], [2, 1]],
      waving: [[7, 2]],
    },

    /**
     * Tag-to-frame mapping for semantic emotion selection (otaclaw.frame with tag).
     * Maps emotion/tag strings to [[col,row], ...]. Agent or widget picks random from list.
     * Override to customize; defaults match frame-catalog.json.
     */
    tagToFrames: {
      unpleasant: [[9, 0], [10, 0], [0, 2], [2, 2], [3, 2], [9, 3], [10, 3]],
      success: [[0, 1], [1, 1], [2, 1], [6, 3], [7, 3]],
      thinking: [[1, 0], [2, 0], [5, 0], [11, 0]],
      sad: [[2, 2], [3, 2]],
      laughing: [[2, 3], [3, 3]],
      idle: [[0, 0], [1, 0], [3, 0], [4, 0], [6, 0], [7, 0], [8, 0]],
      worried: [[0, 2], [4, 2]],
      waving: [[7, 2]],
      scared: [[9, 0], [10, 0], [10, 3]],
      confident: [[8, 1], [9, 1], [10, 1], [8, 3]],
      wink: [[4, 3], [5, 3]],
      surprised: [[9, 0], [10, 0]],
      processing: [[3, 1], [4, 1], [6, 1], [7, 1]],
      error: [[4, 2], [2, 2]],
      puzzled: [[1, 2]],
      curious: [[5, 2]],
      confused: [[1, 2], [5, 0]],
      excited: [[2, 1], [3, 3]],
      greeting: [[7, 2]],
      cold: [[9, 3]],
      presenting: [[6, 3], [7, 3]],
    },
  },

  /**
   * Sound Settings (if sounds enabled)
   */
  sounds: {
    // Base path for sound files
    basePath: 'assets/sounds/',
    
    // Volume level (0.0 to 1.0)
    volume: 0.5,
    
    // Sound files for each state
    files: {
      thinking: null,
      processing: null,
      success: 'success.mp3',
      error: 'error.mp3',
      laughing: 'laugh.mp3',
      surprised: 'surprise.mp3',
    },
  },

  /**
   * Touch/Gesture Settings
   */
  touch: {
    // Enable tap interactions
    tapEnabled: true,
    
    // Enable swipe gestures
    swipeEnabled: false,
    
    // Tap debounce time in milliseconds
    debounceTime: 300,
    
    // Long press duration in milliseconds
    longPressDuration: 800,
  },

  /**
   * Display Settings – your window to OtaClaw's face
   * Use the gear button (⚙) in the widget for live rotation, fullscreen, backdrop.
   */
  display: {
    // Kiosk mode: hide cursor, disable right-click, fullscreen
    kioskMode: false,

    // Full screen mode
    fullscreen: true,
    
    // Face rotation: 0, 90 (clockwise), 180, 270 – default 270 = portrait (counter-clockwise)
    rotationDeg: 270,
    
    // Screen orientation lock (portrait, landscape, or null for auto)
    orientation: null,
    
    // Prevent screen sleep (requires wake lock API support)
    preventSleep: false,
    
    // Brightness control (if supported by device)
    brightness: 100,

    // Pi GPIO buzzer: set to "http://127.0.0.1:18790/tickle" when running pi-buzzer-tickle.py
    // Or set to another local listener for custom actions (e.g. Discord bridges)
    buzzerTickleUrl: null,
  },

  /**
   * Personality preset: 'default' | 'hal'
   * 'hal' = Hal Emmerich (Otacon) from Metal Gear Solid – nerdy, loyal, varied reactions.
   * When set, overrides i18n state speech with personality-specific strings (arrays = random pick).
   */
  personality: 'default',

  /**
   * i18n / Speech Strings
   * All UI and speech bubble text. Override for localization.
   * Values can be string or string[] – arrays pick random for variety.
   */
  i18n: {
    // State speech bubbles
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
    // Error messages
    timeout: 'Timeout',
    listenerTimeout: 'Listener timeout',
    connectionError: 'Connection error',
    runTimeout: 'Run timeout',
    networkError: 'Network error',
    rejected: 'Rejected',
    unknownError: 'Unknown error',
    // Connection status
    connecting: 'Connecting...',
    checkConfig: 'Check config',
    reconnecting: 'Reconnecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
    offline: 'Demo Mode',
    // Config overlay
    configRequired: 'Edit js/config.js with your OpenClaw host.',
    configError: 'Configuration error: Copy config.example.js to config.js',
    runtimeError: 'Runtime error: ',
    loading: 'Loading…',
  },

  /**
   * Logging Settings
   */
  /**
   * Behavior profiles: presets for eventMap and stateDurations.
   * Applied when behavior.profile is set.
   */
  profiles: {
    default: {},  // Use main config as-is
    minimal: {
      eventMap: {
        'agent.message.start': 'thinking',
        'agent.message.complete': 'success',
        'agent.message.error': 'error',
        'gateway.idle': 'idle',
        '*': 'idle',
      },
      stateDurations: {
        success: 2000,
        error: 3000,
      },
    },
    expressive: {
      eventMap: {
        'agent.message.start': 'thinking',
        'agent.message.delta': 'processing',
        'agent.message.complete': 'success',
        'agent.message.error': 'error',
        'agent.tool.call': 'surprised',
        'agent.tool.result': 'success',
        'gateway.idle': 'idle',
        'user.presence': 'curious',
        'user.typing': 'thinking',
        '*': 'idle',
      },
      stateDurations: {
        success: 4000,
        error: 5000,
        surprised: 3000,
        curious: 2500,
      },
    },
  },

  /**
   * Personality presets: speech strings that embody Hal Emmerich (Otacon).
   * Nerdy, loyal, self-deprecating; science/tech references. Arrays = random pick per state.
   * @see https://metalgear.fandom.com/wiki/Hal_Emmerich
   */
  personalities: {
    hal: {
      thinking: ['Hmmm....', 'Let me think...', 'One sec...', 'Right, right...'],
      processing: ['Processing...', 'Working on it', "Crunchn' numbers", 'Almost there'],
      success: ['Got it!', 'There we go', 'Done!', 'Roger that'],
      error: ['Oops...', 'That wasn\'t...', 'Yikes', 'My bad'],
      laughing: ['Haha!', 'Heh', 'Good one', 'Hehe'],
      surprised: ['Woah!', 'Whoa!', 'Didn\'t see that', 'Huh?!'],
      curious: ['Hmm?', 'Interesting...', 'Really?', 'Oh?'],
      confused: ['Huh?', 'Wait, what?', 'I\'m lost', 'Say again?'],
      excited: ['Wow!', 'No way!', 'Awesome!', 'Nice!'],
      contemplative: ['Hmmm....', 'Let me see...', 'Thinking...'],
      waving: ['Hey!', 'Hi there', 'Yo!'],
      worried: ['Hmm...', 'Not sure...', 'Hope it\'s ok'],
      presenting: ['Ta-da!', 'There!', 'Done!'],
    },
  },

  logging: {
    // Log level: 'debug', 'info', 'warn', 'error', 'none'
    level: 'info',
    
    // Enable console logging
    console: true,
    
    // Enable remote logging (if configured)
    remote: false,
  },
};

/**
 * Export configuration for use in other modules
 */
export default OTACLAW_CONFIG;
