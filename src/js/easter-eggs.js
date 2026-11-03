/**
 * OtaClaw Easter Eggs
 * Hidden features for dedicated fans
 * 
 * Implements:
 * 1. Gray Fox Protocol (Touch/Swipe Morse pattern)
 * 2. Codec Mode (Konami Code with stats overlay)
 * 3. Otacon Panic (Error handler integration - see otaclaw.js)
 */

export class EasterEggs {
  constructor(otaclaw, memory, config = {}) {
    this.otaclaw = otaclaw;
    this.memory = memory;
    this.config = config;
    
    // Feature flags
    this.enabled = config.enabled !== false;
    this.debug = config.debug || false;
    
    // State tracking
    this.grayFoxActive = false;
    this.codecActive = false;
    
    // Input buffers
    this.konamiBuffer = [];
    this.morseBuffer = [];
    this.touchStartTime = 0;
    this.touchStartPos = { x: 0, y: 0 };
    
    // Konami sequence
    this.konamiSequence = [
      'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
      'b', 'a'
    ];
    
    // Morse "FOX" pattern: •• −• / −−− / −••−
    // Tap=short (S), Hold=long (L)
    this.foxMorsePattern = [
      'S', 'S',        // F: •• −•
      'L',
      'L', 'L', 'L',   // O: −−−
      'L', 'S', 'S', 'L' // X: −••−
    ];
    
    // DOM elements
    this.codecOverlay = null;
    this.codecStats = null;
    this.codecHalScreen = null;
    this.codecFreqContainer = null;
    this.codecBars = null;
    this.modeIndicator = null;
    this.statsInterval = null;
    
    // Bind methods
    this.init = this.init.bind(this);
    this.destroy = this.destroy.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);
    this._handleTouchMove = this._handleTouchMove.bind(this);
  }
  
  /**
   * Initialize Easter egg listeners
   */
  init() {
    if (!this.enabled) {
      this._log('Easter eggs disabled');
      return;
    }
    
    // Keyboard listeners (for desktop/Konami)
    document.addEventListener('keydown', this._handleKeyDown);
    
    // Touch listeners (for Gray Fox pattern AND Codec gesture)
    const touchZone = document.getElementById('otaclaw');
    if (touchZone) {
      touchZone.addEventListener('touchstart', this._handleTouchStart, { passive: false });
      touchZone.addEventListener('touchend', this._handleTouchEnd, { passive: false });
      touchZone.addEventListener('touchmove', this._handleTouchMove, { passive: false });
    }
    
    // Initialize Codec gesture detector (triple-hold or four-corner tap)
    this._initCodecGesture();
    
    // Always-visible mode indicator in kiosk (so users see MODE: NORMAL / MODE: CODEC)
    this._initModeIndicator();
    
    this._log('Easter eggs initialized');
  }
  
  /**
   * Create persistent mode indicator (MODE: NORMAL / MODE: CODEC) so Codec is discoverable in kiosk
   */
  _initModeIndicator() {
    if (this.modeIndicator) return;
    const style = document.createElement('style');
    style.id = 'codec-mode-indicator-style';
    style.textContent = `
      .codec-mode-indicator {
        position: fixed;
        bottom: 12px;
        right: 12px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        color: rgba(61, 127, 125, 0.9);
        text-shadow: 0 0 2px rgba(59, 203, 134, 0.3);
        z-index: 9990;
        pointer-events: none;
        user-select: none;
      }
      .codec-mode-indicator.codec-active {
        color: #3bcb86;
        text-shadow: 0 0 4px #3bcb86;
      }
    `;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.className = 'codec-mode-indicator';
    el.id = 'codec-mode-indicator';
    el.textContent = 'MODE: NORMAL';
    el.setAttribute('aria-label', 'Codec mode: tap 4 corners or type !codec in Discord');
    document.body.appendChild(el);
    this.modeIndicator = el;
  }
  
  /**
   * Clean up listeners
   */
  destroy() {
    document.removeEventListener('keydown', this._handleKeyDown);
    
    const touchZone = document.getElementById('otaclaw');
    if (touchZone) {
      touchZone.removeEventListener('touchstart', this._handleTouchStart);
      touchZone.removeEventListener('touchend', this._handleTouchEnd);
      touchZone.removeEventListener('touchmove', this._handleTouchMove);
    }
    
    this.disableGrayFox();
    this.disableCodecMode();
    
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
    if (this.modeIndicator?.parentNode) {
      this.modeIndicator.remove();
      this.modeIndicator = null;
    }
    const modeStyle = document.getElementById('codec-mode-indicator-style');
    if (modeStyle) modeStyle.remove();
  }
  
  /**
   * Handle keyboard input for Konami Code
   */
  _handleKeyDown(e) {
    // Build Konami buffer
    this.konamiBuffer.push(e.key);
    if (this.konamiBuffer.length > this.konamiSequence.length) {
      this.konamiBuffer.shift();
    }
    
    // Check if sequence matches
    if (this._arraysEqual(this.konamiBuffer, this.konamiSequence)) {
      this._log('Konami Code detected!');
      this.toggleCodecMode();
      this.konamiBuffer = []; // Reset
    }
  }
  
  /**
   * Initialize Codec gesture detector (four-corner tap)
   */
  _initCodecGesture() {
    this.codecCornerTaps = [];
    this.codecCornerResetTimer = null;
    
    // Listen for taps in corners: top-left, top-right, bottom-left, bottom-right
    document.addEventListener('touchend', (e) => {
      if (this.codecActive) return;
      
      const touch = e.changedTouches[0];
      const x = touch.clientX;
      const y = touch.clientY;
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      // Define corner zones (20% of width/height from edges)
      const cornerSize = 0.2;
      const isTopLeft = x < w * cornerSize && y < h * cornerSize;
      const isTopRight = x > w * (1 - cornerSize) && y < h * cornerSize;
      const isBottomLeft = x < w * cornerSize && y > h * (1 - cornerSize);
      const isBottomRight = x > w * (1 - cornerSize) && y > h * (1 - cornerSize);
      
      if (isTopLeft || isTopRight || isBottomLeft || isBottomRight) {
        const corner = isTopLeft ? 'TL' : isTopRight ? 'TR' : isBottomLeft ? 'BL' : 'BR';
        this.codecCornerTaps.push(corner);
        
        // Reset timer
        clearTimeout(this.codecCornerResetTimer);
        this.codecCornerResetTimer = setTimeout(() => {
          this.codecCornerTaps = [];
        }, 3000);
        
        // Check if all four corners tapped (in any order)
        if (this.codecCornerTaps.length >= 4) {
          const uniqueCorners = [...new Set(this.codecCornerTaps)];
          if (uniqueCorners.length === 4) {
            this._log('Four-corner pattern detected! Activating Codec Mode');
            this.toggleCodecMode();
            this.codecCornerTaps = [];
            clearTimeout(this.codecCornerResetTimer);
          }
        }
      }
    });
  }
  
  /**
   * Handle touch start for Morse pattern
   */
  _handleTouchStart(e) {
    if (this.codecActive || this.grayFoxActive) return; // Don't interfere
    
    const touch = e.touches[0];
    this.touchStartTime = Date.now();
    this.touchStartPos = { x: touch.clientX, y: touch.clientY };
  }
  
  /**
   * Handle touch move (detect swipes)
   */
  _handleTouchMove(_e) {
    // Allow natural movement
  }
  
  /**
   * Handle touch end for Morse pattern detection
   */
  _handleTouchEnd(_e) {
    if (this.codecActive || this.grayFoxActive) return;
    
    const duration = Date.now() - this.touchStartTime;
    
    // Classify as Short (tap < 200ms) or Long (hold > 200ms)
    const signal = duration < 200 ? 'S' : 'L';
    this.morseBuffer.push(signal);
    
    // Keep buffer reasonable
    if (this.morseBuffer.length > this.foxMorsePattern.length + 5) {
      this.morseBuffer.shift();
    }
    
    // Check if pattern matches FOX
    const recentPattern = this.morseBuffer.slice(-this.foxMorsePattern.length);
    if (this._arraysEqual(recentPattern, this.foxMorsePattern)) {
      this._log('Gray Fox pattern detected!');
      this.enableGrayFox();
      this.morseBuffer = []; // Reset
    }
  }
  
  /**
   * Enable Gray Fox Protocol (Stealth Mode)
   */
  enableGrayFox() {
    if (this.grayFoxActive) return;
    
    this.grayFoxActive = true;
    const container = document.getElementById('otaclaw');
    
    if (container) {
      container.classList.add('gray-fox-mode');
      
      // Add stealth styling
      const style = document.createElement('style');
      style.id = 'gray-fox-style';
      style.textContent = `
        .gray-fox-mode {
          opacity: 0.5 !important;
          filter: drop-shadow(0 0 8px rgba(100, 150, 100, 0.6));
          transition: opacity 0.8s ease, filter 0.8s ease;
        }
        .gray-fox-mode:hover {
          opacity: 0.7 !important;
        }
      `;
      document.head.appendChild(style);
    }
    
    console.log('> A cornered fox is more dangerous than a jackal.');
    
    // Auto-disable after 5 minutes
    setTimeout(() => this.disableGrayFox(), 5 * 60 * 1000);
  }
  
  /**
   * Disable Gray Fox Protocol
   */
  disableGrayFox() {
    if (!this.grayFoxActive) return;
    
    this.grayFoxActive = false;
    const container = document.getElementById('otaclaw');
    const style = document.getElementById('gray-fox-style');
    
    if (container) {
      container.classList.remove('gray-fox-mode');
    }
    if (style) {
      style.remove();
    }
    
    this._log('Gray Fox deactivated');
  }
  
  /**
   * Panic mode: disable any active easter egg and briefly flag the container.
   * Triggered by gateway-emitted easter.panic events.
   */
  triggerPanic() {
    this.disableGrayFox();
    this.disableCodecMode();
    const container = document.getElementById('otaclaw');
    if (!container) return;
    container.classList.add('otacon-panic');
    setTimeout(() => container.classList.remove('otacon-panic'), 1500);
    this._log('Otacon panic triggered');
  }

  /**
   * Toggle Codec Mode (Konami Code effect)
   */
  toggleCodecMode() {
    if (this._codecClosing) return;
    if (this.codecActive) {
      this.disableCodecMode();
    } else {
      this.enableCodecMode();
    }
  }
  
  /**
   * Enable Codec Mode - Authentic MGS Codec style with landscape/portrait layouts
   */
  enableCodecMode() {
    if (this.codecActive || this._codecClosing) return;
    if (this._codecCloseTimer) {
      clearTimeout(this._codecCloseTimer);
      this._codecCloseTimer = null;
      this._codecClosing = false;
    }
    this.codecActive = true;
    document.body.classList.add("codec-active");

    const cfg =
      (typeof window !== "undefined" && window.otaclawApp?.config) ||
      (typeof window !== "undefined" && window.OTACLAW_CONFIG) ||
      {};
    const resolveCodecAsset = (f) => {
      const base = (cfg?.sprites?.basePath || "assets/sprites/").replace(/\/$/, "");
      const raw = /^(https?:|data:|\/)/.test(f) ? f : `${base}/${f}`;
      return typeof window.otaclawAssetUrl === "function"
        ? window.otaclawAssetUrl(raw)
        : raw;
    };
    const codecFace = cfg?.sprites?.codecFace;
    const defaultFaces = Array.isArray(codecFace)
      ? codecFace.filter(Boolean)
      : codecFace
        ? [codecFace]
        : [];
    if (!defaultFaces.length) defaultFaces.push("codec/neutral.png");
    const stateFaces = cfg?.sprites?.codecStateFaces || {};
    this._codecCfg = cfg;
    this._codecResolve = resolveCodecAsset;
    this._codecDefaultFaces = defaultFaces;

    const style = document.createElement("style");
    style.id = "codec-style";
    style.textContent = `
      body.codec-active { background: #000 !important; overflow: hidden !important; }
      body.codec-active #otaclaw {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      body.codec-active .codec-mode-indicator { display: none !important; }

      .codec-root {
        --c-secondary: #274851;
        --c-highlight: #d3e9e6;
        --c-faded: #3d7f7d;
        --c-glow: #3bcb86;
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 12px;
        background: #000;
        color: #fff;
        font-family: "Inconsolata", "Courier New", monospace;
        pointer-events: none;
        overflow: hidden;
      }
      .codec-root::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 5;
        pointer-events: none;
        background: linear-gradient(
          rgba(18, 16, 16, 0) 50%,
          rgba(0, 0, 0, 0.22) 50%
        );
        background-size: 100% 2px;
        opacity: 0.6;
      }

      .codec-frame {
        display: flex;
        flex-direction: column;
        width: min(94vw, 440px);
        height: min(calc(100vh - 96px), 760px);
        min-height: 0;
        border: 4px solid var(--c-secondary);
        background: #000;
        box-shadow:
          0 0 10px var(--c-secondary),
          inset 0 0 10px var(--c-secondary),
          0 0 26px rgba(59, 203, 134, 0.25);
        overflow: hidden;
        transform-origin: center center;
        will-change: transform, filter;
      }
      .codec-frame.codec-pending {
        transform: scaleY(0.001);
        filter: brightness(0);
      }
      .codec-frame.codec-booting {
        animation: codec-crt-on 620ms linear both;
      }
      .codec-frame.codec-shutting-down {
        animation: codec-crt-off 340ms linear both;
      }
      @keyframes codec-crt-on {
        0% { transform: scaleY(0.001); filter: brightness(30); }
        15% { transform: scaleY(0.10); filter: brightness(70); }
        30% { transform: scaleY(0.001); filter: brightness(30); }
        50% { transform: scaleY(0.14); filter: brightness(90); }
        70% { transform: scaleY(0.001); filter: brightness(30); }
        100% {
          transform: scaleY(1);
          filter: contrast(1) brightness(1.1) saturate(1.1);
        }
      }
      @keyframes codec-crt-off {
        0% { transform: scaleY(1); filter: brightness(1.1); opacity: 1; }
        35% { transform: scaleY(0.03); filter: brightness(30); opacity: 1; }
        60% { transform: scaleY(0.001); filter: brightness(80); opacity: 1; }
        100% { transform: scaleY(0.001); filter: brightness(0); opacity: 0; }
      }

      .codec-frequency {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 14px 6px;
        background: #000;
      }
      .codec-ptt,
      .codec-memory {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        color: var(--c-faded);
        font-size: clamp(9px, 2vh, 16px);
        letter-spacing: 0.32em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .codec-ptt::before,
      .codec-ptt::after,
      .codec-memory::before,
      .codec-memory::after {
        content: "";
        flex: 1 1 auto;
        height: 3px;
        background: var(--c-secondary);
        box-shadow: 0 0 10px var(--c-secondary);
      }
      .codec-bars {
        flex: 0 0 auto;
        height: clamp(48px, 13vh, 110px);
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 3px 0;
        overflow: hidden;
      }
      .codec-bars span {
        display: block;
        flex: 1 1 0;
        min-height: 2px;
        background: var(--c-faded);
        animation: codec-signal 800ms ease forwards;
      }
      .codec-bars span:nth-child(1) { width: 100%; animation-delay: 200ms; }
      .codec-bars span:nth-child(2) { width: 50%; animation-delay: 300ms; }
      .codec-bars span:nth-child(3) { width: 33.3%; animation-delay: 400ms; }
      .codec-bars span:nth-child(4) { width: 25%; animation-delay: 500ms; }
      .codec-bars span:nth-child(5) { width: 20%; animation-delay: 600ms; }
      .codec-bars span:nth-child(6) { width: 16.6%; animation-delay: 700ms; }
      .codec-bars span:nth-child(7) { width: 14.2%; animation-delay: 800ms; }
      .codec-bars span:nth-child(8) { width: 12.5%; animation-delay: 900ms; }
      .codec-bars span:nth-child(9) { width: 11.1%; animation-delay: 1000ms; }

      .codec-lcd {
        align-self: flex-end;
        display: flex;
        align-items: flex-end;
        padding: 0 4px;
        color: var(--c-faded);
        font-size: clamp(20px, 5.5vh, 46px);
        line-height: 1;
        letter-spacing: 0.02em;
      }
      .codec-lcd .small { font-size: 0.75em; }
      .codec-lcd .large { position: relative; }
      .codec-lcd .large:nth-child(2)::after {
        content: "";
        position: absolute;
        right: -0.16em;
        bottom: 0.12em;
        width: 0.14em;
        height: 0.14em;
        border-radius: 50%;
        background: var(--c-highlight);
        box-shadow: 0 0 2px #fff, 0 0 8px var(--c-glow);
      }

      .codec-screen {
        flex: 1 1 auto;
        min-height: 0;
        position: relative;
        margin: 12px;
        overflow: hidden;
        background: #000;
        box-shadow:
          inset 0 0 10px 1px #fff,
          0 0 10px 1px #fff,
          0 0 26px 6px var(--c-glow);
      }
      .codec-screen::before,
      .codec-screen::after {
        content: "";
        position: absolute;
        left: 0;
        width: 100%;
        background: var(--c-highlight);
        box-shadow: 0 0 10px var(--c-glow);
        pointer-events: none;
      }
      .codec-screen::before {
        height: 50px;
        top: 0;
        opacity: 0.08;
        animation: codec-scan 7.5s linear 0.5s infinite;
      }
      .codec-screen::after {
        height: 3px;
        top: 0;
        opacity: 0.2;
        animation: codec-scan 4s linear 0.8s infinite;
      }
      .codec-face {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-position: center;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
        filter: contrast(1.05) brightness(1.05) saturate(1.05);
      }

      .codec-subtitle {
        flex: 0 0 auto;
        opacity: 0;
        width: min(92vw, 760px);
        min-height: 2.4em;
        max-height: 5.2em;
        overflow: hidden;
        text-align: center;
        color: #fff;
        font-family: "Inconsolata", "Courier New", monospace;
        font-size: clamp(12px, 2.4vh, 22px);
        line-height: 1.35;
        letter-spacing: 0.12em;
        text-shadow: 0 0 4px #fff, 0 0 10px var(--c-glow);
        white-space: pre-wrap;
      }
      .codec-subtitle:empty { visibility: hidden; }
      .codec-root.codec-ready .codec-subtitle { opacity: 1; }
      .codec-subtitle.copied {
        color: #3bcb86;
        text-shadow: 0 0 4px #fff, 0 0 12px #3bcb86;
      }

      @keyframes codec-signal {
        0% { background: var(--c-faded); }
        100% {
          background: var(--c-highlight);
          box-shadow: 0 0 2px #fff, 0 0 10px var(--c-glow);
        }
      }
      @keyframes codec-scan {
        0% { transform: translate3d(0, 0, 0); }
        100% { transform: translate3d(0, 400px, 0); }
      }

      @media (max-width: 640px) {
        .codec-root { gap: 6px; padding: 6px; }
        .codec-frame {
          width: calc(100vw - 12px);
          height: calc(100vh - 76px);
        }
        .codec-frequency { padding: 5px 10px 3px; }
        .codec-bars { height: clamp(34px, 11vh, 60px); }
        .codec-lcd { font-size: 20px; }
        .codec-screen { margin: 8px; }
        .codec-subtitle { font-size: 11px; min-height: 2.4em; }
      }
      @media (max-height: 380px) and (min-width: 641px) {
        .codec-frame { height: calc(100vh - 74px); }
        .codec-subtitle { font-size: 12px; }
      }
    `;
    document.head.appendChild(style);

    const bars = Array.from({ length: 9 }, () => "<span></span>").join("");
    const root = document.createElement("div");
    root.className = "codec-root";
    root.innerHTML = `
      <div class="codec-frame">
        <div class="codec-frequency">
          <div class="codec-ptt">PTT</div>
          <div class="codec-bars" aria-hidden="true">${bars}</div>
          <div class="codec-lcd">
            <span class="small">14</span><span class="large">0</span><span class="large">85</span>
          </div>
          <div class="codec-memory">MEMORY</div>
        </div>
        <div class="codec-screen">
          <img class="codec-face" alt="" aria-hidden="true" />
        </div>
      </div>
      <div class="codec-subtitle" id="codec-subtitle" aria-live="polite"></div>
    `;
    document.body.appendChild(root);
    // The compact float is 180x320 in normal mode; the vertical codec needs a
    // taller window to show the full avatar. This is a no-op outside the native
    // float (no bridge).
    try {
      window.webkit?.messageHandlers?.otaclawResize?.postMessage({
        width: 180,
        height: 480,
      });
    } catch {}
    const codecFrame = root.querySelector(".codec-frame");
    if (codecFrame) {
      codecFrame.classList.add("codec-pending");
      this._codecBootTimer = setTimeout(() => {
        this._codecBootTimer = null;
        if (!codecFrame.isConnected) return;
        codecFrame.classList.remove("codec-pending");
        codecFrame.classList.add("codec-booting");
        this._codecBootClearTimer = setTimeout(() => {
          this._codecBootClearTimer = null;
          codecFrame.classList.remove("codec-booting");
          this.codecRoot?.classList.add("codec-ready");
        }, 650);
      }, 230);
    }
    this.codecRoot = root;
    this.codecSubtitle = root.querySelector("#codec-subtitle");
    if (this.codecSubtitle) {
      this.codecSubtitle.style.pointerEvents = "auto";
      this.codecSubtitle.title = "Click to copy";
      this.codecSubtitle.addEventListener("click", async (event) => {
        event.stopPropagation();
        const text = (this.codecSubtitle?.textContent || "").trim();
        if (!text) return;
        const ok = await window.otaclawCopyText?.(text);
        if (!ok) return;
        this.codecSubtitle.classList.add("copied");
        clearTimeout(this._codecCopiedTimer);
        this._codecCopiedTimer = setTimeout(
          () => this.codecSubtitle?.classList.remove("copied"),
          900,
        );
      });
    }
    this._codecFaceImg = root.querySelector(".codec-face");

    if (stateFaces && Object.keys(stateFaces).length) this._codecStateFaces = stateFaces;
    this._startCodecFaces(defaultFaces, "default");
    this._syncCodecFace();

    // Subtitles mirror the speech bubble: the codec view never draws a bubble
    // over the portrait, the line sits below it like the original game.
    const src = document.getElementById("speech-text");
    this._codecSubSource = src;
    const sync = () => {
      if (!this.codecSubtitle) return;
      this.codecSubtitle.textContent = (src?.textContent || "").trim();
    };
    this._codecSubSync = sync;
    if (src && typeof window.MutationObserver !== "undefined") {
      this._codecSubObserver = new window.MutationObserver(sync);
      this._codecSubObserver.observe(src, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    sync();

    if (this.modeIndicator) {
      this.modeIndicator.textContent = "MODE: CODEC";
      this.modeIndicator.classList.add("codec-active");
    }
    console.log("> Codec frequency locked: 140.85");
    console.log("> Secure line established");

    this.statsInterval = setInterval(() => this._syncCodecFace(), 2000);
  }

  /**
   * Disable Codec Mode
   */
  disableCodecMode() {
    if (!this.codecActive || this._codecClosing) return;
    this.codecActive = false;
    this._codecClosing = true;

    if (this._codecFaceTimer) {
      clearTimeout(this._codecFaceTimer);
      this._codecFaceTimer = null;
    }
    if (this._codecBootTimer) {
      clearTimeout(this._codecBootTimer);
      this._codecBootTimer = null;
    }
    if (this._codecBootClearTimer) {
      clearTimeout(this._codecBootClearTimer);
      this._codecBootClearTimer = null;
    }
    this._codecFaceSig = null;
    this._codecFaceImg = null;
    if (this._codecSubObserver) {
      this._codecSubObserver.disconnect();
      this._codecSubObserver = null;
    }
    this._codecSubSync = null;
    this._codecSubSource = null;
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    const finish = () => {
      this._codecClosing = false;
      document.body.classList.remove("codec-active");
      try {
        window.webkit?.messageHandlers?.otaclawResize?.postMessage({
          width: 180,
          height: 320,
        });
      } catch {}
      if (this.codecRoot) {
        this.codecRoot.remove();
        this.codecRoot = null;
      }
      this.codecSubtitle = null;
      this.codecHalScreen = null;
      this.codecFreqContainer = null;
      this.codecStats = null;
      const style = document.getElementById("codec-style");
      if (style) style.remove();
      if (this.modeIndicator) {
        this.modeIndicator.textContent = "MODE: NORMAL";
        this.modeIndicator.classList.remove("codec-active");
      }
      console.log("> Codec transmission ended");
    };

    const frame = this.codecRoot?.querySelector(".codec-frame");
    if (frame) {
      frame.classList.remove("codec-pending", "codec-booting");
      frame.classList.add("codec-shutting-down");
      this._codecCloseTimer = setTimeout(() => {
        this._codecCloseTimer = null;
        finish();
      }, 360);
    } else {
      finish();
    }
  }

  /**
   * Swap the codec face (default sequence or a state-specific one, e.g. the
   * shock portraits for error/surprised).
   */
  _startCodecFaces(faces, key = 'default') {
    if (!this.codecActive || !this._codecFaceImg || !Array.isArray(faces) || !faces.length) return;
    const list = faces.filter(Boolean);
    if (!list.length) return;
    const sig = `${key}:${list.join(',')}`;
    if (this._codecFaceSig === sig) return;
    this._codecFaceSig = sig;
    if (this._codecFaceTimer) {
      clearTimeout(this._codecFaceTimer);
      this._codecFaceTimer = null;
    }
    const img = this._codecFaceImg;
    const resolve = this._codecResolve || ((f) => f);
    // "codec/g1-2.png@90" holds that portrait for 90 ms (blinks); plain
    // entries use codecFrameMs.
    const ms = Math.max(60, Number(this._codecCfg?.sprites?.codecFrameMs) || 1200);
    const frames = list.map((entry) => {
      const m = String(entry).match(/^(.*)@(\d+)$/);
      return m ? { file: m[1], ms: Math.max(60, Number(m[2])) } : { file: entry, ms };
    });
    img.src = resolve(frames[0].file);
    if (frames.length > 1) {
      let i = 0;
      const tick = () => {
        if (!this.codecActive) return;
        i = (i + 1) % frames.length;
        img.src = resolve(frames[i].file);
        this._codecFaceTimer = setTimeout(tick, frames[i].ms);
      };
      this._codecFaceTimer = setTimeout(tick, frames[0].ms);
    }
  }

  /**
   * Update codec stats display (minimal version)
   */
  _syncCodecFace() {
    if (!this.codecActive) return;
    const currentState = this.otaclaw ? this.otaclaw.getState() : "idle";
    const mapped = this._codecCfg?.sprites?.codecStateFaces?.[currentState];
    if (mapped) {
      this._startCodecFaces(Array.isArray(mapped) ? mapped : [mapped], currentState);
    } else if (this._codecDefaultFaces?.length) {
      this._startCodecFaces(this._codecDefaultFaces, "default");
    }
  }

  /**
   * Format uptime duration
   */
  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  /**
   * Get mood label from score
   */
  _getMoodLabel(score) {
    if (score >= 20) return 'Excellent';
    if (score >= 10) return 'Good';
    if (score >= 0) return 'Neutral';
    if (score >= -10) return 'Low';
    return 'Critical';
  }
  
  /**
   * Compare two arrays for equality
   */
  _arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  
  /**
   * Log helper
   */
  _log(...args) {
    if (this.debug) {
      console.log('[EasterEggs]', ...args);
    }
  }
}
