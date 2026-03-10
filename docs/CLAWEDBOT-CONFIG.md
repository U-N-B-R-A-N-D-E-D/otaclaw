# OtaClaw Config – ClawedBot Language

Terms we use so anyone can configure their window to OtaClaw's face.

## Terms

| Term | Meaning |
|------|---------|
| **OtaClaw's face** | The sprite that shows emotional states (idle, thinking, success, etc.) |
| **Your window** | The viewport where OtaClaw appears – rotation, fullscreen, backdrop |
| **Face rotation** | How the face is oriented: 0°, 90° CW, 180°, 270° CW |
| **Full window** | Fullscreen mode – OtaClaw fills the whole display |
| **Backdrop** | The background color behind OtaClaw |
| **Canvas** | The OpenClaw area where OtaClaw and other apps live |
| **ClawedBot** | The OpenClaw ecosystem – gateway, agents, OtaClaw |

## Display Tools (Widget)

**Open settings:** Tap **⚙** (bottom-left in widget, bottom-right otherwise) **or long-press ~1s** anywhere.

**Close:** Tap **× Close** or tap the dark area outside the panel.

Inside the panel:
1. **Face rotation** – 0°, 90° CW, 180°, 270° CW  
2. **Full window** – Toggle fullscreen  
3. **Backdrop** – Preset colors (Dark #2C2C2C default, Black, Deep blue, …) or custom color picker  

Preferences are saved in your browser (localStorage). Default backdrop: `#2C2C2C`.

## Config File

In `config/config.js` (or inline in the widget):

```javascript
display: {
  fullscreen: true,
  rotationDeg: 90,   // 90° clockwise – good for portrait 3.5" displays
  // ...
}
```

## Quick Setup for Small Displays

1. Open the widget on your display.
2. Tap ⚙.
3. Pick **90° CW** if the display is portrait.
4. Pick a **backdrop** you like.
5. Tap **Toggle fullscreen** if needed.
