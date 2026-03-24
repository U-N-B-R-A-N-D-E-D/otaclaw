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
   * Toggle Codec Mode (Konami Code effect)
   */
  toggleCodecMode() {
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
    if (this.codecActive) return;
    
    this.codecActive = true;
    
    // Get OtaClaw container for cloning
    const otaclawEl = document.getElementById('otaclaw');
    
    // Responsive sizing for small screen (Pi: 800x480)
    const isPortrait = window.innerHeight > window.innerWidth;
    
    // Use viewport units for true responsiveness
    const thumbSize = isPortrait ? '35vw' : '25vh'; // 35% viewport width (portrait) or 25% viewport height (landscape)
    const freqWidth = isPortrait ? '90vw' : '60vw'; // 90% width (portrait) or 60% width (landscape)
    const freqHeight = isPortrait ? '30vh' : '40vh'; // 30% height (portrait) or 40% height (landscape)
    const spacing = '8px';
    const lcdFontSize = isPortrait ? '10vw' : '6vh';
    const barHeight = isPortrait ? '2.5vh' : '3vh';
    
    // Add Codec styling (authentic MGS with responsive layouts)
    const style = document.createElement('style');
    style.id = 'codec-style';
    style.textContent = `
      /* MGS Codec Mode Variables */
      :root {
        --color-secondary: #274851;
        --color-highlight: #d3e9e6;
        --color-faded: #3d7f7d;
        --color-glow: #3bcb86;
        --screen-background: #121010;
      }
      
      /* Full-screen CRT effects */
      body.codec-active {
        background: #000 !important;
      }
      
      /* Hide original OtaClaw completely when Codec is active */
      body.codec-active #otaclaw {
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
      
      /* Scanlines (authentic MGS) */
      body.codec-active::before {
        content: "";
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        background: 
          linear-gradient(
            rgba(18, 16, 16, 0) 50%, 
            rgba(0, 0, 0, 0.25) 50%
          ), 
          linear-gradient(
            90deg, 
            rgba(255, 0, 0, 0.06), 
            rgba(0, 255, 0, 0.02), 
            rgba(0, 0, 255, 0.06)
          );
        z-index: 9998;
        background-size: 100% 2px, 3px 100%;
        pointer-events: none;
      }
      
      /* CRT flicker */
      body.codec-active::after {
        content: "";
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        background: rgba(18, 16, 16, 0.1);
        opacity: 0;
        z-index: 9997;
        pointer-events: none;
        animation: codec-flicker 0.15s infinite;
      }
      
      @keyframes codec-flicker {
        0%, 100% { opacity: 0.05; }
        20% { opacity: 0.08; }
        40% { opacity: 0.03; }
        60% { opacity: 0.12; }
        80% { opacity: 0.05; }
      }
      
      /* HAL Thumbnail Screen (close-up, centered) */
      .codec-hal-screen {
        position: fixed;
        background-color: var(--color-secondary);
        box-shadow: 
          0 0 10px 1px #fff inset, 
          0 0 10px 1px #fff, 
          0 0 30px 10px var(--color-glow);
        z-index: 9999;
        overflow: hidden;
        border: 3px solid var(--color-secondary);
        animation: codec-turn-on 250ms linear forwards;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        width: ${thumbSize};
        height: ${thumbSize};
      }
      
      /* Landscape: HAL on left */
      @media (orientation: landscape) {
        .codec-hal-screen {
          left: ${spacing};
          top: 50%;
          transform: translateY(-50%);
        }
      }
      
      /* Portrait: HAL on top */
      @media (orientation: portrait) {
        .codec-hal-screen {
          left: 50%;
          top: ${spacing};
          transform: translateX(-50%);
        }
      }
      
      .codec-hal-screen::before {
        background-color: var(--color-highlight);
        box-shadow: 0 0 10px var(--color-glow);
        content: "";
        height: 50px;
        left: 0;
        opacity: 0.1;
        position: absolute;
        top: 0;
        width: 100%;
        animation: codec-scan-bar 7500ms linear 500ms forwards infinite;
        z-index: 2;
      }
      
      .codec-hal-screen::after {
        background-color: var(--color-highlight);
        box-shadow: 0 0 10px var(--color-glow);
        content: "";
        height: 3px;
        left: 0;
        opacity: 0.2;
        position: absolute;
        top: 0;
        width: 100%;
        animation: codec-scan-bar 4000ms linear 800ms forwards infinite;
        z-index: 2;
      }
      
      .codec-hal-screen img {
        width: 100%;
        height: 200%;
        object-fit: cover;
        object-position: center 25%;
        filter: 
          contrast(1.1) 
          brightness(1.15) 
          saturate(1.2)
          hue-rotate(-5deg);
        position: absolute;
        top: 0;
        left: 0;
      }
      
      @keyframes codec-scan-bar {
        0% { transform: translate3d(0, 0, 0); }
        100% { transform: translate3d(0, 100%, 0); }
      }
      
      @keyframes codec-turn-on {
        0% {
          transform: translateY(-50%) scaleY(0);
          filter: brightness(30);
          opacity: 1;
        }
        20% {
          transform: translateY(-50%) scaleY(0.2);
          filter: brightness(60);
        }
        40% {
          transform: translateY(-50%) scaleY(0);
          filter: brightness(30);
        }
        60% {
          transform: translateY(-50%) scaleY(0.1);
          filter: brightness(60);
        }
        80% {
          transform: translateY(-50%) scaleY(0);
          filter: brightness(30);
        }
        100% {
          transform: translateY(-50%) scaleY(1);
          filter: contrast(1) brightness(1.1) saturate(1.1);
          opacity: 1;
        }
      }
      
      /* Frequency Container (EXACT CodePen structure) */
      .codec-frequency-container {
        position: fixed;
        background-color: var(--color-secondary);
        box-shadow: 
          0 0 10px 0px var(--color-secondary), 
          0 0 10px 0px var(--color-secondary) inset;
        z-index: 10001; /* Higher than otaclaw (10000) */
        padding: 8px;
        width: ${freqWidth};
        height: ${freqHeight};
      }
      
      /* Landscape: Frequency on right */
      @media (orientation: landscape) {
        .codec-frequency-container {
          right: ${spacing};
          top: 50%;
          transform: translateY(-50%);
        }
      }
      
      /* Portrait: Frequency on bottom */
      @media (orientation: portrait) {
        .codec-frequency-container {
          left: 50%;
          bottom: ${spacing};
          transform: translateX(-50%);
        }
      }
      
      /* Signal Bars (EXACT CodePen style) */
      .codec-bars {
        width: 100%;
        height: auto;
        padding: 8px;
      }
      
      .codec-bars > div {
        position: relative;
        height: ${barHeight};
        background-color: var(--color-faded);
        margin-bottom: 4px;
        animation: codec-signal-on 800ms ease forwards;
      }
      
      .codec-bars > div:nth-child(1) { 
        width: 100%; 
        animation-delay: 200ms; 
      }
      .codec-bars > div:nth-child(2) { 
        width: calc(100% * 380 / 422); 
        animation-delay: 300ms; 
      }
      .codec-bars > div:nth-child(3) { 
        width: calc(100% * 380 / 633); 
        animation-delay: 400ms; 
      }
      .codec-bars > div:nth-child(4) { 
        width: calc(100% * 380 / 950); 
        animation-delay: 500ms; 
      }
      .codec-bars > div:nth-child(5) { 
        width: calc(100% * 380 / 1267); 
        animation-delay: 600ms; 
      }
      .codec-bars > div:nth-child(6) { 
        width: calc(100% * 380 / 1900); 
        animation-delay: 700ms; 
      }
      .codec-bars > div:nth-child(7) { 
        width: calc(100% * 380 / 2533); 
        animation-delay: 800ms; 
      }
      .codec-bars > div:nth-child(8) { 
        width: calc(100% * 380 / 3167); 
        animation-delay: 900ms; 
      }
      .codec-bars > div:nth-child(9) { 
        width: calc(100% * 380 / 3800); 
        animation-delay: 1000ms; 
      }
      
      @keyframes codec-signal-on {
        0% { 
          background-color: var(--color-faded); 
        }
        100% { 
          background-color: var(--color-highlight);
          box-shadow: 0 0 2px #fff, 0 0 10px var(--color-glow);
        }
      }
      
      /* LCD Frequency Display (Responsive with em units) */
      .codec-lcd {
        position: absolute;
        bottom: 0;
        right: 0;
        color: var(--color-faded);
        font-family: 'Courier New', monospace;
        font-size: ${lcdFontSize};
        line-height: 1.1;
        padding: 0.2em;
        width: auto;
        transform: scale(0.9, 1);
      }
      
      .codec-lcd > span {
        position: absolute;
      }
      
      .codec-lcd > span::before {
        height: 100%;
        left: 0;
        position: absolute;
        top: 0;
        width: 100%;
        color: var(--color-highlight);
        text-shadow: 0 0 2px #fff, 0 0 0.3em var(--color-glow);
      }
      
      .codec-lcd .small {
        font-size: 0.75em;
        right: 3.5em;
        bottom: 0;
      }
      
      .codec-lcd .small::before {
        content: "14";
      }
      
      .codec-lcd .large {
        font-size: 1em;
        bottom: 0;
      }
      
      .codec-lcd .large:nth-of-type(1) {
        right: 2.2em;
      }
      
      .codec-lcd .large:nth-of-type(1)::before {
        content: "1";
      }
      
      .codec-lcd .large:nth-of-type(1)::after {
        position: absolute;
        right: -0.15em;
        bottom: 0.05em;
        width: 0.12em;
        height: 0.12em;
        border-radius: 50%;
        background-color: var(--color-highlight);
        box-shadow: 0 0 2px #fff, 0 0 0.3em var(--color-glow);
        content: "";
      }
      
      .codec-lcd .large:nth-of-type(2) {
        right: 0.1em;
      }
      
      .codec-lcd .large:nth-of-type(2)::before {
        content: "12";
      }
      
      /* Stats overlay (bottom-left) */
      .codec-stats-mini {
        position: fixed;
        bottom: ${spacing}px;
        left: ${spacing}px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        color: var(--color-faded);
        text-shadow: 0 0 2px var(--color-glow);
        z-index: 10001; /* Higher than otaclaw */
        line-height: 1.6;
        opacity: 0.85;
      }
    `;
    document.head.appendChild(style);
    
    // Apply codec class to body
    document.body.classList.add('codec-active');
    
    // Update mode indicator
    if (this.modeIndicator) {
      this.modeIndicator.textContent = 'MODE: CODEC';
      this.modeIndicator.classList.add('codec-active');
    }
    
    // Clone HAL sprite into codec screen (with close-up crop)
    const halScreen = document.createElement('div');
    halScreen.className = 'codec-hal-screen';
    
    // #region agent log
    fetch('http://127.0.0.1:7700/ingest/24f79727-534b-403d-8eca-d5303286554b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca17cc'},body:JSON.stringify({sessionId:'ca17cc',location:'easter-eggs.js:HAL_CLONE_START',message:'Starting HAL sprite clone',data:{otaclawExists:!!otaclawEl,halScreenCreated:!!halScreen},timestamp:Date.now(),runId:'sprite-debug',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion
    
    if (otaclawEl) {
      const spriteImg = otaclawEl.querySelector('img');
      
      // #region agent log
      fetch('http://127.0.0.1:7700/ingest/24f79727-534b-403d-8eca-d5303286554b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca17cc'},body:JSON.stringify({sessionId:'ca17cc',location:'easter-eggs.js:SPRITE_FOUND',message:'Sprite element query result',data:{spriteImgExists:!!spriteImg,spriteSrc:spriteImg?.src||'null',spriteComplete:spriteImg?.complete,spriteNaturalWidth:spriteImg?.naturalWidth,spriteNaturalHeight:spriteImg?.naturalHeight},timestamp:Date.now(),runId:'sprite-debug',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion
      
      if (spriteImg && spriteImg.src) {
        const img = document.createElement('img');
        img.src = spriteImg.src;
        img.className = 'hal-face-clone';
        
        // #region agent log
        fetch('http://127.0.0.1:7700/ingest/24f79727-534b-403d-8eca-d5303286554b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca17cc'},body:JSON.stringify({sessionId:'ca17cc',location:'easter-eggs.js:CLONE_CREATED',message:'Clone img element created',data:{cloneSrc:img.src,cloneClassName:img.className,thumbSize:thumbSize,halScreenWidth:halScreen.style.width||'css-defined',halScreenHeight:halScreen.style.height||'css-defined'},timestamp:Date.now(),runId:'sprite-debug',hypothesisId:'B,C,D'})}).catch(()=>{});
        // #endregion
        
        halScreen.appendChild(img);
        
        // #region agent log
        fetch('http://127.0.0.1:7700/ingest/24f79727-534b-403d-8eca-d5303286554b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca17cc'},body:JSON.stringify({sessionId:'ca17cc',location:'easter-eggs.js:CLONE_APPENDED',message:'Clone appended to halScreen',data:{halScreenChildCount:halScreen.children.length,firstChildTagName:halScreen.children[0]?.tagName,firstChildSrc:halScreen.children[0]?.src},timestamp:Date.now(),runId:'sprite-debug',hypothesisId:'B,E'})}).catch(()=>{});
        // #endregion
        
        console.log('> HAL face cloned for codec screen');
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7700/ingest/24f79727-534b-403d-8eca-d5303286554b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca17cc'},body:JSON.stringify({sessionId:'ca17cc',location:'easter-eggs.js:CLONE_FAILED',message:'Failed to clone sprite',data:{reason:'spriteImg not found or no src',spriteImgExists:!!spriteImg,spriteSrc:spriteImg?.src||'null'},timestamp:Date.now(),runId:'sprite-debug',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      }
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7700/ingest/24f79727-534b-403d-8eca-d5303286554b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca17cc'},body:JSON.stringify({sessionId:'ca17cc',location:'easter-eggs.js:OTACLAW_NOT_FOUND',message:'otaclawEl not found',data:{},timestamp:Date.now(),runId:'sprite-debug',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }
    
    document.body.appendChild(halScreen);
    
    // #region agent log
    fetch('http://127.0.0.1:7700/ingest/24f79727-534b-403d-8eca-d5303286554b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca17cc'},body:JSON.stringify({sessionId:'ca17cc',location:'easter-eggs.js:HALSCREEN_APPENDED',message:'halScreen appended to body',data:{halScreenInDOM:document.body.contains(halScreen),halScreenComputedStyle:{width:window.getComputedStyle(halScreen).width,height:window.getComputedStyle(halScreen).height,position:window.getComputedStyle(halScreen).position,zIndex:window.getComputedStyle(halScreen).zIndex}},timestamp:Date.now(),runId:'sprite-debug',hypothesisId:'C,D,E'})}).catch(()=>{});
    // #endregion
    
    this.codecHalScreen = halScreen;
    
    // Add frequency container (EXACT CodePen structure)
    const freqContainer = document.createElement('div');
    freqContainer.className = 'codec-frequency-container';
    
    // Add signal bars (9 bars like CodePen)
    const bars = document.createElement('div');
    bars.className = 'codec-bars';
    for (let i = 0; i < 9; i++) {
      bars.appendChild(document.createElement('div'));
    }
    freqContainer.appendChild(bars);
    this.codecBars = bars;
    
    // Add LCD display (EXACT CodePen structure)
    const lcd = document.createElement('div');
    lcd.className = 'codec-lcd';
    lcd.innerHTML = `
      <span class="small">88</span>
      <span class="large">8</span>
      <span class="large">88</span>
    `;
    freqContainer.appendChild(lcd);
    
    document.body.appendChild(freqContainer);
    this.codecFreqContainer = freqContainer;
    
    // Add minimal stats
    const stats = document.createElement('div');
    stats.className = 'codec-stats-mini';
    stats.id = 'codec-stats-content';
    stats.innerHTML = 'CODEC ACTIVE';
    document.body.appendChild(stats);
    this.codecStats = stats;
    
    console.log('> Codec frequency locked: 141.12');
    console.log('> Secure line established');
    
    // Start stats update loop
    this._updateCodecStats();
    this.statsInterval = setInterval(() => this._updateCodecStats(), 2000);
  }
  
  /**
   * Disable Codec Mode
   */
  disableCodecMode() {
    if (!this.codecActive) return;
    
    this.codecActive = false;
    
    // Remove body class
    document.body.classList.remove('codec-active');
    
    // Remove all Codec UI elements
    if (this.codecHalScreen) {
      this.codecHalScreen.remove();
      this.codecHalScreen = null;
    }
    
    if (this.codecFreqContainer) {
      this.codecFreqContainer.remove();
      this.codecFreqContainer = null;
    }
    
    if (this.codecStats) {
      this.codecStats.remove();
      this.codecStats = null;
    }
    
    // Remove style
    const style = document.getElementById('codec-style');
    if (style) {
      style.remove();
    }
    
    // Reset mode indicator to NORMAL
    if (this.modeIndicator) {
      this.modeIndicator.textContent = 'MODE: NORMAL';
      this.modeIndicator.classList.remove('codec-active');
    }
    
    // Stop stats interval
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    
    console.log('> Codec transmission ended');
  }
  
  /**
   * Update codec stats display (minimal version)
   */
  _updateCodecStats() {
    if (!this.codecActive || !this.codecStats) return;
    
    // Gather minimal stats
    const memory = this.memory || {};
    const memoryData = memory.memory || {};
    
    const mood = memoryData.moodScore || 0;
    const interactions = memoryData.interactionCount || 0;
    const currentState = this.otaclaw ? this.otaclaw.getState() : 'unknown';
    
    // Minimal stats display
    this.codecStats.innerHTML = `
CODEC: 140.85
STATE: ${currentState.toUpperCase()}
MOOD: ${mood > 0 ? '+' : ''}${mood}
INT: ${interactions}
    `.trim();
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
