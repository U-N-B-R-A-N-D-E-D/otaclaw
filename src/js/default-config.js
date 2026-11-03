/**
 * Runtime base defaults for the static app.
 *
 * This is the widget/kiosk base layer (gateway URL params, behavior, sprites,
 * i18n). The user config (config/config.js) deep-merges on top in app.js, and
 * sprite-runtime reads window.OTACLAW_CONFIG during boot.
 *
 * Keep this file dependency-free and classic (it must run before the modules).
 */
window.OTACLAW_CONFIG = {
  openclaw: {
    // Allow URL params to override: ?host=YOUR_OPENCLAW_HOST&port=18789
    host: (function () {
      try {
        return new URLSearchParams(window.location.search).get("host") || "auto";
      } catch (_) {
        return "auto";
      }
    })(),
    port: (function () {
      try {
        var p = new URLSearchParams(window.location.search).get("port");
        return p ? parseInt(p, 10) : 18789;
      } catch (_) {
        return 18789;
      }
    })(),
    wsPath: "/ws",
    protocolVersion: 3,
    authToken: (function () {
      try {
        return (
          new URLSearchParams(window.location.search).get("oc_token") ||
          ""
        );
      } catch (_) {
        return "";
      }
    })(),
    reconnectInterval: 3000,
    reconnectBackoff: false,
    maxReconnectAttempts: 0,
    connectionTimeout: 20000,
    heartbeatInterval: 20000,
    staleThreshold: 60000,
    maxQueuedMessages: 120,
    // Set to "channel:<ID>" or "user:<ID>" to route tickle reactions to a chat channel.
    // Get the ID from Discord: Settings > Advanced > Developer Mode, then right-click channel > Copy Channel ID.
    // Leave null to only animate on screen (no chat delivery).
    tickleDiscordChannel: null,
  },
  personality: "hal",
  behavior: {
    profile: "expressive",
    idleTimeout: 30000,
    agentResponseTimeoutMs: 35000,
    sleepIdleMs: 180000,
    animations: true,
    lowPowerMode: true,
    sounds: true,
    touchEnabled: true,
    debug: false,
    showStatusBar: true,
    autoHideOverlay: true,
  },
  states: [
    "idle",
    "thinking",
    "processing",
    "success",
    "error",
    "laughing",
    "surprised",
    "curious",
    "confused",
    "excited",
    "presenting",
    "worried",
    "sad",
    "scared"
  ],
  stateChaining: {
    success: { next: "presenting", duration: 1500 },
    laughing: { next: "excited", duration: 1000 },
    error: { next: "sad", duration: 2000 },
  },
  eventMap: {
    "agent.message.start": "thinking",
    "agent.message.delta": "processing",
    "agent.message.complete": "success",
    "agent.message.error": "error",
    "agent.tool.call": "surprised",
    "agent.tool.result": "success",
    "agent.tool.error": "error",
    // Tool-specific states (synced from config/config.js — source of truth)
    "agent.tool.search": "curious",
    "agent.tool.creative": "excited",
    "agent.tool.risky": "worried",
    "agent.tool.analytical": "thinking",
    "agent.tool.communication": "processing",
    // Progress phases
    "agent.progress.planning": "thinking",
    "agent.progress.executing": "processing",
    "agent.progress.validating": "curious",
    "agent.progress.finalizing": "presenting",
    // StockAgent trade events (display in speech bubble)
    "stockagent.trade.opened": "excited",
    "stockagent.trade.closed": "success",
    "stockagent.analyzing": "thinking",
    "stockagent.alert.critical": "surprised",
    "stockagent.alert.warning": "worried",
    "stockagent.alert.info": "curious",
    agent: "thinking",
    chat: "thinking",
    "gateway.idle": "idle",
    "gateway.ready": "idle",
    "gateway.error": "error",
    "user.presence": "thinking",
    "user.typing": "thinking",
    "session.start": "thinking",
    "session.end": "idle",
    "channel.connected": "idle",
    "channel.disconnected": "idle",
    "*": "idle",
  },
  stateDurations: {
    thinking: 0,
    processing: 0,
    success: 3000,
    error: 5000,
    laughing: 4000,
    surprised: 2500,
    // synced from config/config.js — source of truth (2026-08-26: missing entries here
    // were the real cause of "excited" state reverting to idle almost instantly instead
    // of holding 15s, since the engine falls back to a short default for any state
    // without an explicit duration — see StockAgent trade notifications in eventMap above)
    curious: 3000,
    confused: 3000,
    excited: 15000,
  },
  sprites: {
    useCSS: true,
    basePath: "assets/sprites/",
    sheetFile: "otaclock-original",
    format: "png",
    sheetWidth: 567,
    sheetHeight: 278,
    cellWidth: 47,
    cellHeight: 70,
    /* Splash: 1 frame before boot. OtIcon on black. */
    splashFrame: "OtIcon.png",
    splashDurationMs: 1500,
    /* Boot: black -> 0,1,2,3,4 (0 rising, 4 last/full). Shutdown: 4,3,2,1,0,black */
    startupSequence: [
      "otacon_sprite_boot_00.png",
      "otacon_sprite_boot_01.png",
      "otacon_sprite_boot_02.png",
      "otacon_sprite_boot_03.png",
      "otacon_sprite_boot_04.png",
    ],
    startupFrameMs: 600,
    /* Idle: groups by purpose. Indices into idleSprites. */
    idleSpriteGroups: {
      neutral: [0, 1, 2],
      coat: [3, 4, 5, 6],
      blink: [7, 8, 9],
    },
    idleSprites: null,
    /* Sequence: indices into idleSprites. Blink (7,8,9) runs fast (~50ms/frame); coat (3–6) slower. */
    // Enriched calm idleSequence (base/resting from frame-catalog). Used only as last-resort fallback
    // before catalog; real first-frame behavior comes from _getOrganicFramePool in app.js (deployed logic).
    idleSequence: [
      [0, 0], [0, 0], [3, 0], [0, 0], [4, 0], [5, 1], [0, 0], [8, 0], [3, 0], [0, 0],
      [4, 0], [0, 0], [5, 1], [1, 0], [8, 0], [0, 0],
    ],
    idleBaseDelayMs: 5000,
    idleJitterMs: 3000,
    idlePhaseTiming: {
      neutral: { baseMs: 3000, jitterMs: 2000 },
      coat: { baseMs: 5000, jitterMs: 3000 },
      blink: { baseMs: 50, jitterMs: 0 },
    },
    idleCoatIndices: [3, 4, 5, 6],
    idleCoatMultiplier: 3,
    idleBlinkDelayMs: 50,
    /* Codec mode portraits (52x89): 4 five-frame sets, neutral + shock. */
    codecFace: [
      "codec/g1-1.png",
      "codec/g1-2.png",
      "codec/g1-3.png",
      "codec/g1-4.png",
      "codec/g1-5.png",
    ],
    codecFrameMs: 1200,
    codecStateFaces: {
      idle: ["codec/g1-1.png", "codec/g1-2.png", "codec/g1-3.png", "codec/g1-4.png", "codec/g1-5.png"],
      attention: ["codec/neutral.png"],
      greeting: ["codec/g1-1.png", "codec/g1-2.png", "codec/g1-3.png", "codec/g1-4.png", "codec/g1-5.png"],
      thinking: ["codec/g2-1.png", "codec/g2-2.png", "codec/g2-3.png", "codec/g2-4.png", "codec/g2-5.png"],
      curious: ["codec/g2-1.png", "codec/g2-2.png", "codec/g2-3.png", "codec/g2-4.png", "codec/g2-5.png"],
      confused: ["codec/g2-1.png", "codec/g2-2.png", "codec/g2-3.png", "codec/g2-4.png", "codec/g2-5.png"],
      processing: ["codec/g3-1.png", "codec/g3-2.png", "codec/g3-3.png", "codec/g3-4.png", "codec/g3-5.png"],
      tool: ["codec/g3-1.png", "codec/g3-2.png", "codec/g3-3.png", "codec/g3-4.png", "codec/g3-5.png"],
      worried: ["codec/g3-1.png", "codec/g3-2.png", "codec/g3-3.png", "codec/g3-4.png", "codec/g3-5.png"],
      sad: ["codec/g3-1.png", "codec/g3-2.png", "codec/g3-3.png", "codec/g3-4.png", "codec/g3-5.png"],
      success: ["codec/g4-1.png", "codec/g4-2.png", "codec/g4-3.png", "codec/g4-4.png", "codec/g4-5.png"],
      excited: ["codec/g4-1.png", "codec/g4-2.png", "codec/g4-3.png", "codec/g4-4.png", "codec/g4-5.png"],
      laughing: ["codec/g4-1.png", "codec/g4-2.png", "codec/g4-3.png", "codec/g4-4.png", "codec/g4-5.png"],
      presenting: ["codec/g4-1.png", "codec/g4-2.png", "codec/g4-3.png", "codec/g4-4.png", "codec/g4-5.png"],
      playful: ["codec/g4-1.png", "codec/g4-2.png", "codec/g4-3.png", "codec/g4-4.png", "codec/g4-5.png"],
      confident: ["codec/g4-1.png", "codec/g4-2.png", "codec/g4-3.png", "codec/g4-4.png", "codec/g4-5.png"],
      error: ["codec/shock-1.png", "codec/shock-2.png", "codec/shock-3.png"],
      surprised: ["codec/shock-1.png", "codec/shock-2.png", "codec/shock-3.png"],
      scared: ["codec/shock-1.png", "codec/shock-2.png", "codec/shock-3.png"],
      cold: ["codec/g1-1.png", "codec/g1-2.png", "codec/g1-3.png", "codec/g1-4.png", "codec/g1-5.png"],
    },
    blinkOverlay: true,
    blinkIntervalMinMs: 8000,
    blinkIntervalMaxMs: 16000,
    blinkDurationMs: 400,
    blinkDoubleChance: 0.15,
    blinkSuppressStates: ['sleeping', 'error', 'worried', 'scared'],
    greetingOnConnect: true,
    antiRepeatWindow: 5,
    idleSpiceChance: 0.05,
    toolCategoryWidening: true,
    eventReactionCoverage: true,
    timeOfDayMood: true,
    /* Thinking: contemplative wait (message received, not yet generating). */
    thinkingSprites: null,
    thinkingSequence: [0, 1, 0, 1, 2, 1, 0],
    /* Processing: active generation (tokens streaming). If absent, uses thinkingSprites. */
    processingSprites: null,
    processingSequence: [0, 1, 0, 1],
    /* Success: thumbs-up micro sequence */
    successSprites: null,
    /* Error: shrug / frustration */
    errorSprites: null,
    /* Laughing: tickle / laugh */
    laughingSprites: null,
    /* Surprised: blushing */
    surprisedSprites: null,
    frames: {
      idle: 2,
      thinking: 2,
      processing: 4,
      success: 2,
      error: 2,
      laughing: 3,
      surprised: 2,
    },
    fps: 8,
    frameTiming: {
      success: { frameMs: [200, 200, 200, 800, 200, 200, 200] },
      thinking: { frameMs: 300 },
      processing: { frameMs: 250 },
      error: { frameMs: [400, 600] },
      surprised: { frameMs: 350 },
      laughing: { frameMs: 350 },
    },
    holdFrames: { success: { index: 3, ms: 800 } },
    tagToSequences: {
      // PRODUCTION sequences (used by _tryPlayStateSequence for success/laugh/error/surprised etc).
      // These + catalog.sequences ensure we play the good sprites (thumbs, laugh, ta-da, coat micro etc)
      // instead of single static frame. After seq, code returns to catalog-driven idle.
      laughing: [[2, 3], [3, 3], [2, 3], [3, 3]],
      success: [[0, 1], [1, 1], [2, 1], [6, 3]],
      thinking: [[1,0],[2,0],[1,0],[5,0]],
      processing: [[6,0],[7,0],[6,1],[7,1]],
      surprised: [[9,0],[10,0]],
      curious: [[5,2],[1,2]],
      excited: [[2,1],[6,3],[7,3]],
      worried: [[0,2],[4,2]],
      presenting: [[6,3],[7,3],[2,1]],
      error: [[0,2],[2,2],[3,2]],
      waving: [[7, 2]],
    },
    tagSequenceFrameMs: 350,
    tagToFrames: {
      unpleasant: [
        [0, 2],
        [2, 2],
        [3, 2],
        [4, 2],
        [9, 3],
        [10, 3],
      ],
      success: [
        [0, 1],
        [1, 1],
        [2, 1],
        [6, 3],
        [7, 3],
      ],
      thinking: [
        [1, 0],
        [2, 0],
        [5, 0],
        [11, 0],
      ],
      excited: [
        [2, 1],
        [6, 3],
        [7, 3],
      ],
      curious: [[5, 2]],
      worried: [
        [0, 2],
        [4, 2],
      ],
      scared: [
        [9, 3],
        [10, 3],
      ],
      presenting: [
        [6, 3],
        [7, 3],
      ],
      sad: [
        [2, 2],
        [3, 2],
      ],
      laughing: [
        [2, 3],
        [3, 3],
      ],
      idle: [
        [0, 0],
        [1, 0],
        [3, 0],
        [4, 0],
        [6, 0],
        [7, 0],
        [8, 0],
      ],
      waving: [[7, 2]],
      confident: [
        [8, 1],
        [9, 1],
        [10, 1],
        [8, 3],
      ],
      wink: [
        [4, 3],
        [5, 3],
      ],
      surprised: [
        [9, 0],
        [10, 0],
      ],
      processing: [
        [3, 1],
        [4, 1],
        [6, 1],
        [7, 1],
      ],
      error: [
        [2, 2],
        [3, 2],
      ],
      puzzled: [[1, 2]],
      greeting: [[7, 2]],
      cold: [[9, 3]],
    },
  },
  sounds: {
    basePath: "assets/sounds/",
    volume: 0.5,
    files: { laughing: "sound_111.wav" },
  },
  touch: {
    tapEnabled: true,
    swipeEnabled: true,
    debounceTime: 300,
    longPressDuration: 800,
  },
  display: {
    fullscreen: true,
    orientation: null,
    preventSleep: false,
    brightness: 100,
    rotationDeg: 270, /* counter-clockwise for portrait kiosk */
    /* GPIO buzzer on Pi: run scripts/pi-buzzer-tickle.py, set to "http://127.0.0.1:18790/tickle" */
    buzzerTickleUrl: null,
  },
  logging: {
    level: "info",
    console: true,
    remote: false,
  },
  personalities: {
    hal: {
      thinking: ["Hmmm....", "Let me think...", "One sec...", "Right, right..."],
      processing: ["Processing...", "Working on it", "Crunchn' numbers", "Almost there"],
      success: ["Got it!", "There we go", "Done!", "Roger that"],
      error: ["Oops...", "That wasn't...", "Yikes", "My bad"],
      laughing: ["Haha!", "Heh", "Good one", "Hehe"],
      surprised: ["Woah!", "Whoa!", "Didn't see that", "Huh?!"],
      curious: ["Hmm?", "Interesting...", "Really?", "Oh?"],
      confused: ["Huh?", "Wait, what?", "I'm lost", "Say again?"],
      excited: ["Wow!", "No way!", "Awesome!", "Nice!"],
      contemplative: ["Hmmm....", "Let me see...", "Thinking..."],
      waving: ["Hey!", "Hi there", "Yo!", "Hello!"],
      worried: ["Hmm...", "Not sure...", "Hope it's ok", "Uh oh..."],
      presenting: ["Ta-da!", "There!", "Done!", "Check this!"],
      scared: ["Yikes!", "Oh no!", "Careful!", "Watch out!"],
      confident: ["Easy!", "Got this!", "No problem", "Sure thing"],
      wink: ["Between us...", "Psst...", "Hint hint", ";)"],
      sad: ["Aww...", "That's too bad", "Sigh...", "Hmm..."],
    },
  },
  i18n: {
    thinking: "Hmmm....",
    processing: "Processing",
    success: "Got it!",
    error: "Oops...",
    laughing: "Haha!",
    surprised: "Woah!",
    contemplative: "Hmmm....",
    curious: "Hmm?",
    confused: "Huh?",
    excited: "Nice!",
    waving: "Hey!",
    worried: "Hmm...",
    presenting: "Ta-da!",
    scared: "Yikes!",
    confident: "Easy!",
    wink: ";)",
    sad: "Aww...",
    timeout: "Timeout",
    listenerTimeout: "Listener timeout",
    connectionError: "Connection error",
    runTimeout: "Run timeout",
    networkError: "Network error",
    rejected: "Rejected",
    unknownError: "Unknown error",
    connecting: "Connecting...",
    checkConfig: "Check config",
    reconnecting: "Reconnecting...",
    connected: "Connected",
    disconnected: "Disconnected",
    offline: "Demo Mode",
    configRequired: "Edit config/config.js with your gateway host.",
    configError:
      "Configuration error: Copy config.example.js to config.js",
    runtimeError: "Runtime error: ",
    loading: "Loading…",
  },
};
