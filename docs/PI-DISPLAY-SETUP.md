# Raspberry Pi - Small Display Setup (3" / 3.5" Always White)

## Responsive Layout

OtaClaw scales to the viewport (`max-width: 100vw`, `max-height: 100vh`). Use Display Tools (long-press) to set face rotation (0°, 90°, 180°, 270°) for portrait or landscape. Touch targets are at least 44px for small screens.

## Kiosk Mode

Add `?kiosk=1` to the widget URL or set `display.kioskMode: true` in config to hide the cursor and disable right-click.

---

## GPIO Buzzer (Laugh Sound) – Optional

The Pi has no built-in speaker. For a simple laugh beep on tickle, use a piezo buzzer on GPIO or system audio (HDMI/3.5mm). **Not required** for OtaClaw to work.

**When deploying with `--restart-kiosk --setup-buzzer`**, the deploy script sets up the tickle sound server (system audio mode) if the Pi buzzer script is present. Use `--setup-buzzer` only when you want to enable it; it will not overwrite an existing `buzzerTickleUrl` value. For manual setup:

1. **Wiring** (GPIO buzzer only): Active buzzer (+) → GPIO 18, (-) → GND (or use a passive buzzer with PWM).
2. **Run the tickle server** (from the deployed canvas or repo):
   ```bash
   python3 scripts/pi-buzzer-tickle.py [--port 18790] [--gpio 18]
   # Or --audio for HDMI/3.5mm (no buzzer hardware)
   ```
3. **Config**: In `config/config.js`, set `display.buzzerTickleUrl: "http://127.0.0.1:18790/tickle"`.
4. **Auto-start** (optional): Add a systemd user service or run in a screen/tmux session.

When the user swipes over Hal (tickle), the widget fetches that URL and the server plays a triple beep.

---

If your small display has **never** shown anything (always white/blank, no flicker on reboot), the Pi is not outputting video to it. This is a display hardware/config issue, not OtaClaw.

## Resolved: 3.5" LCD Wiki SPI Display (ILI9486)

Display [3.5inch RPi Display from LCD Wiki](https://www.lcdwiki.com/3.5inch_RPi_Display) – GPIO/SPI, 320×480, ILI9486. Fix:

```bash
ssh YOUR_PI_HOST 'cd /tmp && sudo rm -rf LCD-show && git clone https://github.com/goodtft/LCD-show.git && cd LCD-show && chmod +x LCD35-show && sudo ./LCD35-show'
```

Wait for reboot (~90s). Display will show Raspberry Pi OS.

### Touch not working (resistive XPT2046)

The LCD Wiki 3.5" uses **resistive touch** (XPT2046). Chromium on Linux often ignores touch without `--touch-devices`. The deploy script patches the kiosk to auto-detect the touch device. If touch still fails:

1. **Calibrate** (per [LCD Wiki](https://www.lcdwiki.com/3.5inch_RPi_Display)):
   ```bash
   ssh YOUR_PI_HOST 'cd /tmp && git clone https://github.com/goodtft/LCD-show.git 2>/dev/null; cd LCD-show && sudo dpkg -i -B xinput-calibrator_0.7.5-1_armhf.deb 2>/dev/null || sudo apt install -y xinput-calibrator'
   ```
   Then on the Pi (with display): Menu → Preferences → Calibrate Touchscreen. Save output to `/etc/X11/xorg.conf.d/99-calibration.conf` or `/usr/share/X11/xorg.conf.d/99-calibration.conf`.

2. **Verify touch device**:
   ```bash
   ssh YOUR_PI_HOST 'DISPLAY=:0 xinput list'
   ```
   Look for "ADS7846 Touchscreen" or similar. The deploy patch adds `--touch-devices=ID` automatically when detected.

3. **Re-deploy** to apply the touch patch and restart kiosk:
   ```bash
   cd otaclock-openclaw && ./deploy/deploy-to-openclaw.sh --host=YOUR_PI --restart-kiosk
   ```

## CRITICAL: Identify the connection FIRST

**Look at the 3" display. What connects it to the Pi?**

| What you see | Connection type | Next step |
|--------------|-----------------|-----------|
| **Cable HDMI** (micro-HDMI plug into Pi) | HDMI | Try both micro-HDMI ports on Pi 4 |
| **Ribbon cable into 40-pin GPIO** (the double row of pins) | SPI/GPIO | Enable SPI + correct dtoverlay |
| **Ribbon into 15-pin slot** (between USB and HDMI) | DSI | Usually auto-detected |

**Pi 4 ports (top view):**
- **HDMI-A-1** = micro-HDMI near USB-C power port
- **HDMI-A-2** = micro-HDMI near 3.5mm jack
- **GPIO** = 40 pins in 2 rows
- **DSI** = small ribbon slot

If it's white + **no flicker ever** = likely SPI (power/backlight on, no video init) or HDMI cable in wrong port / loose.

---

## Step 1: Identify Your Display

**How does the 3" connect?**

| Connection | Typical models | Config needed |
|------------|----------------|---------------|
| **HDMI** | Small LCD with HDMI cable | `/boot/firmware/config.txt` (or `/boot/config.txt`) |
| **GPIO / SPI** | Waveshare, generic TFT | dtoverlay (fbtft, piscreen, etc.) + SPI |
| **DSI** | Official Pi touchscreen | dtoverlay=vc4-kms-v3d (usually auto) |

**Check the physical connection:**
- HDMI cable → HDMI port
- Ribbon cable to GPIO header → SPI/GPIO display
- Ribbon to DSI port (between USB and HDMI) → DSI display

---

## Step 2: HDMI Displays

If it connects via **HDMI**:

### A. Force HDMI, try both ports

Edit on the Pi:
```bash
sudo nano /boot/firmware/config.txt
# Or on older Pi: /boot/config.txt
```

Add or adjust:
```
# Force HDMI output (try both ports)
hdmi_force_hotplug=1

# If still nothing, try safe mode for compatibility
hdmi_safe=1
```

Reboot: `sudo reboot`

### B. Small HDMI displays often need specific resolution

Find your display's native resolution (e.g. 480×320, 800×480). Then add:
```
hdmi_group=2
hdmi_mode=87
hdmi_cvt=480 320 60 6 0 0 0
```

(Replace 480 320 with your display's resolution. See [hdmi_mode list](https://www.raspberrypi.org/documentation/configuration/config-txt/video.md).)

### C. Swap HDMI ports

On Pi 4, there are two micro-HDMI ports. Try the **other** port. One might be HDMI0, one HDMI1.

---

## Step 3: GPIO/SPI Displays (Waveshare, generic TFT)

If it connects via **GPIO pins**:

1. **Enable SPI**: `sudo raspi-config` → Interface Options → SPI → Enable
2. **Find your display** at [lcdwiki.com](http://www.lcdwiki.com) or seller docs
3. Add the correct overlay in `/boot/firmware/config.txt`:
   ```
   dtoverlay=waveshare35a   # Example for 3.5" Waveshare
   # Or: dtoverlay=piscreen,drm
   ```
4. Reboot

White screen on SPI often means: wrong overlay, SPI disabled, or kernel/driver mismatch.

---

## Step 4: Run Diagnostics (from your Mac)

```bash
ssh YOUR_PI_HOST '
echo "=== Current displays ==="
DISPLAY=:0 xrandr 2>/dev/null | grep -E "connected|disconnected"
echo ""
echo "=== Boot config (HDMI/display) ==="
grep -E "hdmi|dtoverlay|display|spi" /boot/firmware/config.txt /boot/config.txt 2>/dev/null | head -20
echo ""
echo "=== SPI enabled? ==="
ls /dev/spi* 2>/dev/null || echo "No SPI devices"
'
```

---

## Step 5: If Both HDMI Ports Report "disconnected"

If diagnostics show both HDMI-A-1 and HDMI-A-2 as disconnected (EDID 0 bytes):

1. **Check the cable** – 3" must be in a Pi micro-HDMI port. Try **both** ports (Pi 4 has two).
2. **Force output without EDID** – Add to `config.txt`:
   ```
   hdmi_ignore_edid=1
   hdmi_group=2
   hdmi_mode=4
   ```
   (640×480; if your display needs 480×320, use `hdmi_mode=87` and `hdmi_cvt=480 320 60 6 0 0 0`.)

## Step 6: Where Do You See the 4K Output?

If xrandr showed **HDMI-A-2 connected 3840×2160**, where does that display connect?
- If the 4K is your main monitor and the 3" is on the **other** HDMI port, try swapping cables.

---

## Quick Commands (run from Mac via SSH)

```bash
# Force HDMI + reboot (try this first for HDMI displays)
ssh YOUR_PI_HOST 'echo -e "\n# Force HDMI\nhdmi_force_hotplug=1" | sudo tee -a /boot/firmware/config.txt && sudo reboot'
```

After reboot, wait ~60s then check:
```bash
ssh YOUR_PI_HOST 'DISPLAY=:0 xrandr'
```

---

## Next Step

**Reply with:**
1. How the 3" connects (HDMI / GPIO / DSI)
2. Brand/model if you know it (e.g. Waveshare 3.5", generic "3 inch HDMI LCD")
3. Output of the diagnostics in Step 4
