/**
 * OtaClaw Simple Demo Mode
 * Standalone version that works without WebSocket connection
 */

// Default configuration
const OTACLAW_CONFIG = {
  behavior: {
    idleTimeout: 30000,
    animations: true,
    sounds: false,
    touchEnabled: true,
    debug: false,
    showStatusBar: true,
  },
  states: [
    "idle",
    "thinking",
    "processing",
    "success",
    "error",
    "laughing",
    "surprised",
  ],
  stateDurations: {
    thinking: 0,
    processing: 0,
    success: 3000,
    error: 5000,
    laughing: 4000,
    surprised: 2500,
  },
};

const isDebug = () =>
  typeof window !== "undefined" &&
  (window.OTACLAW_CONFIG?.behavior?.debug ?? OTACLAW_CONFIG?.behavior?.debug);

// State management
let currentState = "idle";
let demoInterval = null;
/** Tracks demo mode for future conditional logic. */
// eslint-disable-next-line no-unused-vars
let isOfflineMode = false;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  if (isDebug()) console.log("[OtaClaw] Starting...");

  // Show connection overlay initially
  showConnectionOverlay();

  // Initialize state
  setState("idle");

  // Add demo mode option after 2 seconds
  setTimeout(() => {
    showDemoOption();
  }, 2000);

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  // Setup UI
  setupUI();
});

function showConnectionOverlay() {
  const overlay = document.getElementById("connection-overlay");
  if (overlay) {
    overlay.classList.remove("hidden");
  }
}

function hideConnectionOverlay() {
  const overlay = document.getElementById("connection-overlay");
  if (overlay) {
    overlay.classList.add("hidden");
  }
}

function showDemoOption() {
  const overlay = document.getElementById("connection-overlay");
  if (!overlay || overlay.classList.contains("hidden")) return;

  const content = overlay.querySelector(".connection-content");
  if (!content) return;

  // Check if button already exists
  if (content.querySelector(".demo-btn")) return;

  // Add demo button
  const demoBtn = document.createElement("button");
  demoBtn.className = "demo-btn";
  demoBtn.textContent = "✨ Try Demo Mode";
  demoBtn.style.cssText = `
    margin-top: 20px;
    padding: 15px 30px;
    background: linear-gradient(135deg, #4ade80, #22c55e);
    color: #000;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(74, 222, 128, 0.3);
  `;

  demoBtn.addEventListener("click", enableDemoMode);
  demoBtn.addEventListener("mouseover", () => {
    demoBtn.style.transform = "translateY(-2px) scale(1.05)";
    demoBtn.style.boxShadow = "0 6px 20px rgba(74, 222, 128, 0.5)";
  });
  demoBtn.addEventListener("mouseout", () => {
    demoBtn.style.transform = "translateY(0) scale(1)";
    demoBtn.style.boxShadow = "0 4px 15px rgba(74, 222, 128, 0.3)";
  });

  content.appendChild(demoBtn);

  // Add hint text
  const hint = document.createElement("p");
  hint.innerHTML =
    "<br>Or press <kbd>D</kbd> key for debug panel<br>Press <kbd>1-7</kbd> to test states";
  hint.style.cssText = `
    margin-top: 15px;
    font-size: 13px;
    color: #8b8b9a;
    line-height: 1.6;
  `;
  hint.querySelector("kbd").style.cssText = `
    background: #333;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
  `;

  content.appendChild(hint);

  if (isDebug()) console.log("[OtaClaw] Demo button added");
}

function enableDemoMode() {
  if (isDebug()) console.log("[OtaClaw] Demo mode enabled!");
  isOfflineMode = true;

  // Hide overlay
  hideConnectionOverlay();

  // Update status
  updateStatusBadge("DEMO", "#fbbf24");

  // Start cycling through states
  const states = [
    "thinking",
    "processing",
    "success",
    "laughing",
    "surprised",
    "idle",
  ];
  let index = 0;

  // Show first state immediately
  setState(states[0]);
  index++;

  // Auto-cycle every 2 seconds
  demoInterval = setInterval(() => {
    setState(states[index]);
    index = (index + 1) % states.length;
  }, 2000);

  // Stop cycling on manual interaction
  document.addEventListener("click", stopDemoCycle, { once: true });
  document.addEventListener("keydown", stopDemoCycle, { once: true });
}

function stopDemoCycle() {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
    if (isDebug()) console.log("[OtaClaw] Auto-cycle stopped");
  }
}

// Sprite frame mapping for debug
// Sheet: 563x339, frames ~90x100
const FRAME_MAP = {
  idle: "animating row 1: -5,-95,-185,-275,-365 @ y=-15",
  thinking: "-5px -115px (row 2, frame 1 - hand on chin)",
  processing: "animating row 1 idle frames",
  success: "-185px -115px (row 2, frame 3 - thumbs up!)",
  error: "-95px -115px (row 2, frame 2 - worried)",
  laughing: "-325px -115px (MGS2 section, running pose)",
  surprised: "-275px -15px (row 1, frame 4 - wide eyes)",
};

function setState(state) {
  const spriteContainer = document.getElementById("sprite");
  const stateBadge = document.getElementById("current-state");
  const frameElement = spriteContainer?.querySelector(".otacon-frame");

  if (!spriteContainer) {
    console.error("[OtaClaw] Sprite container not found!");
    return;
  }

  // Remove all state classes
  spriteContainer.classList.remove(
    "state-idle",
    "state-thinking",
    "state-processing",
    "state-success",
    "state-error",
    "state-laughing",
    "state-surprised",
  );

  // Add new state class
  spriteContainer.classList.add(`state-${state}`);

  // Update badge
  if (stateBadge) {
    stateBadge.textContent = state;
    stateBadge.setAttribute("data-state", state);
  }

  // Debug: log frame info
  const frameInfo = FRAME_MAP[state] || "unknown";
  if (isDebug()) console.log(`[OtaClaw] State: ${state} | Frame: ${frameInfo}`);

  // Debug: check computed background-position
  if (frameElement) {
    const computedStyle = window.getComputedStyle(frameElement);
    const bgPos = computedStyle.backgroundPosition;
    const bgImage = computedStyle.backgroundImage;
    if (isDebug()) console.log(`[OtaClaw] Computed background-position: ${bgPos}`);
    if (isDebug()) console.log(
      `[OtaClaw] Background image loaded: ${bgImage !== "none" ? "YES" : "NO"}`,
    );
  }

  currentState = state;

  // Auto-return to idle after duration
  const duration = OTACLAW_CONFIG.stateDurations[state];
  if (duration && duration > 0 && !demoInterval) {
    setTimeout(() => {
      if (currentState === state && !demoInterval) {
        setState("idle");
      }
    }, duration);
  }
}

function updateStatusBadge(text, color) {
  const statusIndicator = document.getElementById("connection-status");
  if (statusIndicator) {
    const dot = statusIndicator.querySelector(".status-dot");
    const textSpan = statusIndicator.querySelector(".status-text");

    if (dot) dot.style.background = color;
    if (textSpan) {
      textSpan.textContent = text;
      textSpan.style.color = color;
    }
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // D key toggles debug panel
    if (e.key === "d" || e.key === "D") {
      toggleDebugPanel();
    }

    // Number keys 1-7 for states
    const stateMap = {
      1: "idle",
      2: "thinking",
      3: "processing",
      4: "success",
      5: "error",
      6: "laughing",
      7: "surprised",
    };

    if (stateMap[e.key]) {
      stopDemoCycle();
      setState(stateMap[e.key]);
    }
  });
}

function toggleDebugPanel() {
  const debugPanel = document.getElementById("debug-panel");
  if (debugPanel) {
    debugPanel.classList.toggle("hidden");
  }
}

function setupUI() {
  // Close debug panel
  const closeDebug = document.getElementById("close-debug");
  if (closeDebug) {
    closeDebug.addEventListener("click", () => {
      const debugPanel = document.getElementById("debug-panel");
      if (debugPanel) debugPanel.classList.add("hidden");
    });
  }

  // Test buttons
  const testButtons = document.querySelectorAll(".test-btn");
  testButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const state = btn.dataset.state;
      if (state) {
        stopDemoCycle();
        setState(state);
      }
    });
  });

  // Touch overlay
  const touchOverlay = document.getElementById("touch-overlay");
  if (touchOverlay) {
    touchOverlay.addEventListener("click", () => {
      // Brief thinking state on touch
      if (!demoInterval && currentState === "idle") {
        setState("thinking");
        setTimeout(() => {
          if (currentState === "thinking") {
            setState("idle");
          }
        }, 1000);
      }
    });
  }
}

// Expose to global for console debugging
window.otaclaw = {
  setState,
  getState: () => currentState,
  enableDemoMode,
  stopDemoCycle,
  toggleDebugPanel,
};

if (isDebug()) console.log("[OtaClaw] Simple mode loaded. Press D for debug panel.");
