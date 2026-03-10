# Customizing OtaClaw

Guide for customizing OtaClaw appearance, behavior, and adding new features.

## Table of Contents

- [Display Rotation](#display-rotation)
- [Theme Customization](#theme-customization)
- [Custom Sprites](#custom-sprites)
- [Tag-to-Frame Mapping](#tag-to-frame-mapping)
- [i18n / Speech Strings](#i18n--speech-strings)
- [Adding New States](#adding-new-states)
- [Custom Animations](#custom-animations)
- [Sound Effects](#sound-effects)
- [Event Mapping](#event-mapping)

## Display Rotation

OtaClaw supports rotating Hal (the face) to match any display orientation. This is **independent** of the kiosk or physical screen—you choose how Hal appears.

**Options:** 0°, 90° CW, 180°, 270° CW

### Via config (widget or index)

In `config/config.js` or inline `OTACLAW_CONFIG`:

```javascript
display: {
  rotationDeg: 270,  // portrait (270° clockwise)
}
```

### Via Display Tools (runtime)

1. **Long-press** anywhere for ~3s, or press **S** (desktop tab)
2. The Display Tools panel opens
3. Choose **Face rotation**: 0°, 90° CW, 180°, or 270° CW
4. The choice is saved in `localStorage` and persists

### Kiosk vs widget

- **Kiosk** = how Chromium launches (URL, fullscreen, etc.). Configured in `otaclaw-kiosk.sh`.
- **Widget rotation** = how Hal is oriented on screen. Configured in OtaClaw (`display.rotationDeg` or Display Tools).

They are separate. You can run the same widget on landscape or portrait displays and set rotation per deployment.

## Theme Customization

### CSS Variables

Edit `src/css/otaclaw.css` to change colors:

```css
:root {
  /* Main palette */
  --otaclaw-bg: #1a1a2e;
  --otaclaw-primary: #e94560;
  --otaclaw-text: #eaeaea;
  
  /* State colors */
  --state-idle: #4ade80;
  --state-thinking: #fbbf24;
  --state-success: #22c55e;
  --state-error: #ef4444;
}
```

### Creating a Theme

Create `src/css/themes/dark.css`:

```css
.theme-dark {
  --otaclaw-bg: #0f0f1a;
  --otaclaw-bg-dark: #0a0a12;
  --otaclaw-primary: #ff6b6b;
  --otaclaw-text: #f0f0f0;
}
```

Add theme switcher to config:

```javascript
behavior: {
  theme: 'dark',  // or 'light', 'retro'
}
```

### Light Theme Example

```css
@media (prefers-color-scheme: light) {
  :root {
    --otaclaw-bg: #f7fafc;
    --otaclaw-bg-dark: #edf2f7;
    --otaclaw-text: #1a202c;
    --otaclaw-text-muted: #718096;
  }
  
  .sprite-head {
    background: linear-gradient(180deg, #ffe4c4 0%, #deb887 100%);
  }
}
```

## Custom Sprites

### Using Image Sprites Instead of CSS

1. Disable CSS sprites in config:

```javascript
sprites: {
  useCSS: false,
  basePath: 'assets/sprites/',
  format: 'png',
}
```

2. Create sprite images:

```
assets/sprites/
├── idle/
│   ├── frame-1.png
│   └── frame-2.png
├── thinking/
│   ├── frame-1.png
│   └── frame-2.png
└── ...
```

3. Sprite specifications:
   - Size: 256x256px minimum
   - Format: PNG with transparency
   - Style: Pixel art, cartoon, or realistic
   - Consistent art style across all states

### Sprite Animation

Modify `src/js/otaclaw.js` to cycle frames:

```javascript
animateSprite(state) {
  const frames = this.config.sprites.frames[state] || 1;
  let currentFrame = 0;
  
  this.spriteInterval = setInterval(() => {
    currentFrame = (currentFrame + 1) % frames;
    this.updateSpriteFrame(state, currentFrame);
  }, 1000 / this.config.sprites.fps);
}
```

### Creating Pixel Art Sprites

**Tools:**
- [Aseprite](https://www.aseprite.org/) - Professional pixel art
- [Piskel](https://www.piskelapp.com/) - Free online editor
- [Pixilart](https://pixilart.com/) - Browser-based

**Guidelines:**
1. Start with idle pose as base
2. Keep consistent proportions
3. Use limited color palette (8-16 colors)
4. Make animations loop seamlessly
5. Test at actual display size

### Example: Creating "Confused" State

1. Draw base sprite (idle pose)
2. Add question marks or puzzled expression
3. Create 2-4 frame animation (head tilt, blink)
4. Export PNG sequence
5. Add to `assets/sprites/confused/`

## Tag-to-Frame and Tag-to-Sequence Mapping

For full emotional range, use `sprites.tagToFrames` to map emotion tags to grid cells. The agent or `otaclaw.frame` events use tags; the widget resolves them to frames.

When `sprites.tagToSequences` is set for a tag, the widget plays that [col,row] sequence instead of a single random frame. E.g. `laughing: [[2,3],[3,3],[2,3],[3,3]]`.

Use `sprites.frameTiming` for per-frame or per-state animation speed (number or number[]).

```javascript
sprites: {
  tagToSequences: { laughing: [[2,3],[3,3],[2,3],[3,3]], success: [[0,1],[1,1],[2,1]] },
  tagToFrames: {
    worried: [[0,2], [4,2]],
    waving: [[7,2]],
    scared: [[10,3]],
    confident: [[8,1], [9,1], [10,1], [8,3]],
    wink: [[4,3], [5,3]],
    curious: [[5,2]],
    cold: [[9,3]],
    presenting: [[6,3], [7,3]],
    // Add custom tags for your sprites
  },
}
```

See `config.example.js` for the full default map. Override to add new emotions or change frame choices.

## i18n / Speech Strings

All UI and speech bubble text is in `config.i18n`. Override for localization:

```javascript
i18n: {
  thinking: 'Hmmm....',
  processing: 'Processing',
  success: 'Got it!',
  error: 'Oops...',
  laughing: 'Haha!',
  surprised: 'Woah!',
  connecting: 'Connecting...',
  checkConfig: 'Check config',
  reconnecting: 'Reconnecting...',
  timeout: 'Timeout',
  // ... see config.example.js for full list
}
```

## Adding New States

### 1. Add State to Config

```javascript
// config/config.js
states: ['idle', 'thinking', 'confused', 'success', 'error'],

stateDurations: {
  confused: 3000,  // 3 seconds then back to idle
}
```

### 2. Create CSS Animation

```css
/* src/css/animations.css */

@keyframes confused-tilt {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-10deg); }
  75% { transform: rotate(10deg); }
}

@keyframes confused-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.state-confused .sprite {
  animation: confused-tilt 1s ease-in-out infinite;
}

.state-confused .sprite-head::before {
  animation: confused-blink 0.5s infinite;
}

/* Question marks */
.state-confused .sprite::after {
  content: '???';
  position: absolute;
  top: -30px;
  font-size: 20px;
  color: var(--state-thinking);
  animation: float-up 1s ease-in-out infinite;
}
```

### 3. Map to Events

```javascript
eventMap: {
  'agent.message.confused': 'confused',
  'agent.dont.understand': 'confused',
}
```

### 4. Test the State

```javascript
// In browser console
otaclaw.setState('confused');
```

## Custom Animations

### CSS Keyframe Animation

```css
@keyframes custom-wiggle {
  0%, 100% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(-5deg) scale(1.05); }
  50% { transform: rotate(0deg) scale(1); }
  75% { transform: rotate(5deg) scale(1.05); }
}

.state-wiggle .sprite {
  animation: custom-wiggle 0.5s ease-in-out;
}
```

### JavaScript Animation

```javascript
// In otaclaw.js custom animation handler
handleCustomAnimation(state) {
  if (state === 'wiggle') {
    const sprite = this.spriteElement;
    
    // Wiggle effect using Web Animations API
    sprite.animate([
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-10deg)' },
      { transform: 'rotate(10deg)' },
      { transform: 'rotate(0deg)' }
    ], {
      duration: 500,
      iterations: 2
    });
  }
}
```

### Particle Effects

```javascript
// Add celebration particles on success
createParticles() {
  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.cssText = `
      position: absolute;
      width: 10px;
      height: 10px;
      background: ${this.getRandomColor()};
      border-radius: 50%;
      left: 50%;
      top: 50%;
    `;
    
    this.containerElement.appendChild(particle);
    
    // Animate
    particle.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.random() * 200 - 100}px, ${Math.random() * 200 - 100}px) scale(0)`, opacity: 0 }
    ], {
      duration: 1000,
      easing: 'cubic-bezier(0, .9, .57, 1)'
    }).onfinish = () => particle.remove();
  }
}
```

## Sound Effects

### Enabling Sounds

```javascript
behavior: {
  sounds: true,
}
```

### Adding Sound Files

Place in `assets/sounds/`:

```
assets/sounds/
├── thinking.mp3
├── success.mp3
├── error.mp3
├── laughing.mp3
└── surprised.mp3
```

### Custom Sound Mapping

```javascript
sounds: {
  basePath: 'assets/sounds/',
  volume: 0.5,
  files: {
    thinking: 'thinking.mp3',
    success: 'success.mp3',
    error: 'error.mp3',
    laughing: 'laugh.mp3',
    surprised: 'pop.mp3',
    custom: 'custom.mp3',
  },
}
```

### Creating Sound Effects

**Tools:**
- [sfxr](https://sfxr.me/) - Retro game sounds
- [ChipTone](https://sfbgames.itch.io/chiptone) - 8-bit sounds
- [Bfxr](https://www.bfxr.net/) - Sound effect generator

**Tips:**
- Keep sounds short (< 1 second)
- Use consistent style (retro, modern, etc.)
- Test volume levels on actual hardware
- Consider muting during night hours

### Web Audio API Implementation

```javascript
// Advanced: Generate sounds procedurally
playProceduralSound(type) {
  if (!this.audioContext) return;
  
  const oscillator = this.audioContext.createOscillator();
  const gainNode = this.audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(this.audioContext.destination);
  
  switch (type) {
    case 'success':
      oscillator.frequency.setValueAtTime(523.25, 0); // C5
      oscillator.frequency.exponentialRampToValueAtTime(1046.5, 0.1); // C6
      break;
    case 'error':
      oscillator.frequency.setValueAtTime(200, 0);
      oscillator.frequency.exponentialRampToValueAtTime(100, 0.3);
      break;
  }
  
  gainNode.gain.setValueAtTime(0.3, 0);
  gainNode.gain.exponentialRampToValueAtTime(0.01, 0.5);
  
  oscillator.start();
  oscillator.stop(0.5);
}
```

## Personality Presets

OtaClaw supports personality presets that change speech bubble text. Set `personality: 'hal'` to use the Hal Emmerich (Otacon) preset — varied, nerdy, loyal reactions.

```javascript
personality: 'hal',  // Hal Emmerich from Metal Gear Solid
```

See [PERSONALITY-HAL.md](PERSONALITY-HAL.md) for details and customization.

## Event Mapping

### Custom Event Handlers

Create custom mapping for your use case:

```javascript
eventMap: {
  // OpenClaw events → OtaClaw states
  'agent.message.start': 'thinking',
  'agent.code.execute': 'processing',
  'agent.code.complete': 'success',
  'agent.code.error': 'error',
  
  // Your custom events
  'myapp.loading': 'thinking',
  'myapp.loaded': 'success',
  'myapp.failed': 'error',
  'myapp.joke.detected': 'laughing',
}
```

### Conditional State Logic

```javascript
// Advanced: Custom event handler in app.js
wsClient.on('agent.message.complete', (data) => {
  // Check sentiment or content type
  if (data.sentiment === 'positive') {
    otaclaw.setState('success');
  } else if (data.sentiment === 'negative') {
    otaclaw.setState('thinking');  // Consider response
  } else if (data.containsJoke) {
    otaclaw.setState('laughing');
  } else {
    otaclaw.setState('success');
  }
});
```

### Multi-Step Transitions

```javascript
// Chain state transitions
async function celebrate() {
  otaclaw.setState('surprised');
  await sleep(500);
  otaclaw.setState('laughing');
  await sleep(1000);
  otaclaw.setState('success');
}
```

### State Chaining (Config)

Use `stateChaining` to automatically transition through states before returning to idle:

```javascript
stateChaining: {
  success: { next: 'presenting', duration: 500 },  // success → presenting (500ms) → idle
},
```

After `stateDurations.success` (e.g. 3s), Hal shows `presenting` for 500ms, then returns to idle.

### State Transitions (CSS)

State changes use a brief opacity transition (0.2s) for smoother blending. The `.state-transition` class is applied automatically during state switches.

## Examples

### Retro 8-bit Theme

```css
:root {
  --otaclaw-bg: #000;
  --otaclaw-primary: #0f0;
  --otaclaw-text: #0f0;
  
  /* Scanline effect */
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15),
    rgba(0, 0, 0, 0.15) 1px,
    transparent 1px,
    transparent 2px
  );
}

.sprite {
  image-rendering: pixelated;
  filter: drop-shadow(0 0 10px #0f0);
}
```

### Minimalist Theme

```css
:root {
  --otaclaw-bg: #fff;
  --otaclaw-primary: #333;
  --otaclaw-text: #333;
}

.sprite {
  border-radius: 50%;
  background: currentColor;
}
```

### Glassmorphism Theme

```css
.otaclaw-container {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}

.sprite {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(5px);
  border-radius: 20px;
}
```

---

Create your own themes in `src/css/themes/` (e.g. `src/css/themes/dark.css`).
