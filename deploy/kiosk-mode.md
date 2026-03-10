# Kiosk Mode Configuration

Guide for running OtaClaw in full-screen kiosk mode on various platforms.

## Table of Contents

- [Local Testing](#local-testing)
- [Portrait Touch Screen](#portrait-touch-screen)
- [Raspberry Pi (Primary Target)](#raspberry-pi-primary-target)
- [Linux Desktop](#linux-desktop)
- [Windows](#windows)
- [macOS](#macos)
- [Android](#android)
- [Docker Container](#docker-container)

## Local Testing

Run a local server to preview the animation range and layout:

```bash
cd otaclaw && npm start
```

Open `http://localhost:8080`. Controls:

| Key | Action |
|-----|--------|
| **F** | Toggle full frame cycle demo (all 48 sprites) |
| **Esc** | Stop demo |
| **D** | Toggle debug panel |
| **Y** | Calibration studio |

To test portrait layout: resize the browser window to a tall narrow size, or use Chrome DevTools → Toggle device toolbar → select a portrait phone preset.

## Portrait Touch Screen

OtaClaw adapts to `orientation: portrait` automatically. For a vertical touch display:

1. Rotate the display to portrait (or set display rotation in OS)
2. Launch kiosk — the layout uses portrait-specific sizing
3. Speech bubble appears **below** the character (stays visible)

Chromium respects `orientation: portrait` when the physical display is vertical. No extra config needed.

## Raspberry Pi (Primary Target)

See [raspberry-pi-setup.md](raspberry-pi-setup.md) for complete touchscreen + kiosk setup.

### Quick Kiosk Launch

```bash
# Launch Chromium in kiosk mode
chromium-browser \
    --kiosk \
    --app=http://localhost:18789/__openclaw__/canvas/otaclaw/ \
    --noerrdialogs \
    --disable-infobars \
    --check-for-update-interval=31536000
```

### Systemd Service

```bash
# Create service
sudo tee /etc/systemd/system/otaclaw-kiosk.service << 'EOF'
[Unit]
Description=OtaClaw Kiosk
After=graphical.target network.target

[Service]
Type=simple
User=pi
Environment=DISPLAY=:0
ExecStart=/usr/bin/chromium-browser \
    --kiosk \
    --app=http://localhost:18789/__openclaw__/canvas/otaclaw/ \
    --no-first-run \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=Translate
Restart=on-failure

[Install]
WantedBy=graphical.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable otaclaw-kiosk.service
sudo systemctl start otaclaw-kiosk.service
```

## Linux Desktop

### X11 + Openbox

```bash
# Install window manager
sudo apt install openbox

# Create autostart
cat > ~/.config/openbox/autostart << 'EOF'
# Hide cursor (if unclutter fails, try X -nocursor in /etc/lightdm/lightdm.conf)
unclutter -display :0 -idle 0 -root -noevents &

# Launch OtaClaw kiosk
chromium --kiosk http://localhost:18789/__openclaw__/canvas/otaclaw/ &
EOF

# Start kiosk session
startx /usr/bin/openbox-session
```

### GNOME/KDE Fullscreen

```bash
# For GNOME
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.desktop.session idle-delay 0

# Launch fullscreen (not kiosk, but close)
chromium --start-fullscreen http://localhost:18789/__openclaw__/canvas/otaclaw/
```

## Windows

### Chrome Kiosk Mode

1. Create shortcut with target:
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
    --kiosk \
    --app=http://localhost:18789/__openclaw__/canvas/otaclaw/ \
    --no-first-run \
    --noerrdialogs
```

2. Place in Startup folder:
```
Win+R → shell:startup → paste shortcut
```

### Auto-Login + Kiosk Script

Create `C:\otaclaw-kiosk.bat`:

```batch
@echo off
start chrome --kiosk --app=http://localhost:18789/__openclaw__/canvas/otaclaw/
```

Add to Task Scheduler:
- Trigger: At log on
- Action: Start program `C:\otaclaw-kiosk.bat`
- Run with highest privileges

## macOS

### Chrome Kiosk

```bash
# Launch Chrome in kiosk mode
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --kiosk \
    --app=http://localhost:18789/__openclaw__/canvas/otaclaw/
```

### Automator App

1. Open Automator → New Application
2. Add "Run Shell Script" action:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --kiosk \
    --app=http://localhost:18789/__openclaw__/canvas/otaclaw/
```
3. Save as "OtaClaw Kiosk"
4. Add to Login Items: System Preferences → Users & Groups → Login Items

### Disable Sleep

```bash
# Prevent display sleep
caffeinate -d &

# Or use pmset (requires sudo)
sudo pmset -a sleep 0 displaysleep 0
```

## Android

### Fully Kiosk Browser

Best option for Android tablets:

1. Install [Fully Kiosk Browser](https://www.fully-kiosk.com/)
2. Settings → Start URL: `http://<your-openclaw-host>:18789/__openclaw__/canvas/otaclaw/`
3. Enable: Start on boot, keep screen on, show on top
4. Disable: All buttons, status bar, navigation bar

### Native WebView App

For custom Android app wrapping OtaClaw:

```kotlin
// MainActivity.kt
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Fullscreen
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        
        // Hide action bar
        supportActionBar?.hide()
        
        // Keep screen on
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        setContentView(R.layout.activity_main)
        
        val webView = findViewById<WebView>(R.id.webview)
        webView.settings.javaScriptEnabled = true
        webView.loadUrl("http://<your-openclaw-host>:18789/__openclaw__/canvas/otaclaw/")
    }
}
```

## Docker Container

For isolated kiosk environment:

```dockerfile
# Dockerfile.kiosk
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    x11vnc \
    matchbox-window-manager \
    unclutter \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Kiosk script
COPY kiosk-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5900

ENTRYPOINT ["/entrypoint.sh"]
```

```bash
# kiosk-entrypoint.sh
#!/bin/bash
Xvfb :0 -screen 0 1024x768x24 &
sleep 2
matchbox-window-manager &
unclutter -idle 0 -root &
chromium --kiosk --app=http://host.docker.internal:18789/__openclaw__/canvas/otaclaw/ --window-size=1024,768
```

Run:
```bash
docker build -f Dockerfile.kiosk -t otaclaw-kiosk .
docker run -p 5900:5900 otaclaw-kiosk
# Connect with VNC viewer to localhost:5900
```

## Exit Kiosk Mode

### Keyboard Shortcuts

| Platform | Exit Method |
|----------|-------------|
| Chromium | `Alt+F4` or `Ctrl+W` |
| Chrome OS | `Ctrl+Shift+Q` (twice) |
| Windows | `Alt+F4` |
| Linux | `Alt+F4` or `Ctrl+Alt+T` (terminal) |

### Emergency Exit Script (Raspberry Pi)

Create `~/exit-kiosk.sh` on the Pi:

```bash
#!/bin/bash
pkill chromium
pkill matchbox
```

Make executable: `chmod +x ~/exit-kiosk.sh`. Run via SSH:
```bash
ssh YOUR_USER@YOUR_PI_HOST 'bash ~/exit-kiosk.sh'
```

---

## Performance Tips

### Reduce Chromium Resource Usage

```bash
# Add these flags for low-power devices
chromium \
    --kiosk \
    --single-process \
    --disable-features=site-per-process \
    --process-per-site \
    --memory-model=low \
    --disable-dev-shm-usage \
    --disable-gpu \
    --disable-software-rasterizer \
    --disable-extensions \
    --disable-plugins
```

### Disable Unnecessary Chromium Features

```bash
chromium \
    --disable-features=Translate,InterestFeedContentSuggestions \
    --disable-component-extensions-with-background-pages \
    --disable-background-networking \
    --no-default-browser-check \
    --no-first-run
```

---

## Cursor Still Visible?

If `unclutter` doesn't hide the cursor on Raspberry Pi:

1. **X server -nocursor**: Edit `/etc/lightdm/lightdm.conf` and set:
   ```
   xserver-command=X -nocursor
   ```
   Reboot. This hides cursor at X level.

2. **Verify unclutter**: `unclutter -display :0 -idle 0 -root -noevents &` before Chromium.

---

## Security Considerations

When running in kiosk mode:

1. **Network isolation** - Run on isolated network if possible
2. **Regular updates** - Keep Chromium and OS updated
3. **Limited user** - Run as non-privileged user
4. **Firewall** - Only allow necessary ports
5. **Physical security** - Secure device in enclosure

---

For platform-specific issues, refer to the main [README.md](../README.md) or open an issue.
