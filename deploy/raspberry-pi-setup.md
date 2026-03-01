# Raspberry Pi + Touchscreen Setup Guide

Complete guide for setting up OtaClaw on a Raspberry Pi with a touchscreen display for a dedicated AI companion interface.

## Table of Contents

- [Hardware Requirements](#hardware-requirements)
- [Supported Touchscreens](#supported-touchscreens)
- [Raspberry Pi OS Installation](#raspberry-pi-os-installation)
- [Touchscreen Configuration](#touchscreen-configuration)
- [Kiosk Mode Setup](#kiosk-mode-setup)
- [Auto-Start Configuration](#auto-start-configuration)
- [Power Management](#power-management)
- [Troubleshooting](#troubleshooting)

## Hardware Requirements

### Minimum Requirements

- **Raspberry Pi**: Pi 3B+, Pi 4 (recommended), or Pi Zero 2 W
- **RAM**: 1GB minimum, 2GB+ recommended
- **Storage**: 8GB microSD card minimum
- **Power Supply**: Official Pi power supply (3A for Pi 4)
- **Network**: Wi-Fi or Ethernet connection

### Recommended Setup

- **Raspberry Pi 4 (4GB RAM)** - Best performance
- **Official Raspberry Pi 7" Touchscreen** - Perfect fit, no cables needed
- **High-quality microSD card (32GB+)** - Samsung EVO Select or SanDisk Extreme
- **Cooling**: Passive heatsink case or small fan
- **UPS HAT (optional)**: For uninterrupted operation

## Supported Touchscreens

### Official Raspberry Pi 7" Touchscreen

**Best option for OtaClaw**

| Spec | Value |
|------|-------|
| Resolution | 800x480 |
| Touch | 10-point capacitive |
| Connection | DSI ribbon cable + GPIO for power |
| Power | Powered from Pi GPIO pins |
| Price | ~$60-70 |

**Setup**: Plug and play with Raspberry Pi OS

### Waveshare 3.5" LCD (GPIO)

| Spec | Value |
|------|-------|
| Resolution | 480x320 |
| Touch | Resistive or capacitive |
| Connection | GPIO pins |
| Driver | Requires installation |
| Price | ~$20-30 |

**Setup**: See [Waveshare setup section](#waveshare-35-lcd)

### HDMI + USB Touch Displays

Any HDMI display with USB touch overlay works:
- Generic 7"-10" HDMI displays
- Old monitors with USB touch frame
- Portable USB-C monitors

**Setup**: Usually plug and play

### Raspberry Pi Zero 2 W + Waveshare Mini

Ultra-compact setup:
- Pi Zero 2 W
- Waveshare 2.8" or 3.5" mini display
- Low power consumption

## Raspberry Pi OS Installation

### Option 1: Raspberry Pi Imager (Recommended)

1. Download [Raspberry Pi Imager](https://www.raspberrypi.org/software/)
2. Insert microSD card
3. Select OS: **Raspberry Pi OS Lite (64-bit)** or **Raspberry Pi OS with Desktop**
4. Click gear icon for advanced options:
   - Enable SSH
   - Set username/password
   - Configure Wi-Fi
   - Set locale settings
5. Write to SD card

### Option 2: Manual Flashing

```bash
# Download Raspberry Pi OS Lite (64-bit)
wget https://downloads.raspberrypi.org/raspios_lite_arm64/images/raspios_lite_arm64-2024-03-15/2024-03-15-raspios-bookworm-arm64-lite.img.xz

# Extract
unxz 2024-03-15-raspios-bookworm-arm64-lite.img.xz

# Flash to SD card (replace /dev/sdX with your device)
sudo dd if=2024-03-15-raspios-bookworm-arm64-lite.img of=/dev/sdX bs=4M status=progress
```

### Initial Boot Configuration

```bash
# SSH into your Pi
ssh pi@raspberrypi.local

# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y \
    chromium-browser \
    unclutter \
    xserver-xorg \
    x11-xserver-utils \
    xinit \
    git \
    curl \
    vim
```

## Touchscreen Configuration

### Official Raspberry Pi 7" Touchscreen

**Automatic Setup**

```bash
# The official touchscreen should work out of the box
# Verify it's detected:
dmesg | grep -i touch
ls /dev/input/touchscreen*

# Test touch input
sudo apt install -y evtest
evdev /dev/input/event0  # Replace with your event number
```

**Screen Rotation**

```bash
# Edit /boot/firmware/config.txt (Bookworm)
# or /boot/config.txt (Bullseye and earlier)
sudo nano /boot/firmware/config.txt

# Add for landscape (default):
# No changes needed

# Add for portrait:
display_lcd_rotate=1  # 90 degrees
display_lcd_rotate=2  # 180 degrees
display_lcd_rotate=3  # 270 degrees

# For touch rotation, create/edit:
sudo nano /usr/share/X11/xorg.conf.d/40-libinput.conf

# Add inside Section "InputClass":
Option "TransformationMatrix" "0 1 0 -1 0 1 0 0 1"  # 90 degrees
```

### Waveshare 3.5" LCD Setup

**Driver Installation**

```bash
# Download Waveshare drivers
cd ~
git clone https://github.com/waveshare/LCD-show.git
cd LCD-show

# For 3.5" GPIO LCD
sudo ./LCD35-show

# For capacitive touch version
sudo ./LCD35C-show

# System will reboot automatically
```

**Screen Calibration**

```bash
# Install calibration tool
sudo apt install -y xinput-calibrator

# Run calibration
xinput_calibrator

# Save output to:
sudo nano /usr/share/X11/xorg.conf.d/99-calibration.conf
```

### HDMI + USB Touch Display

```bash
# Usually plug and play
# If touch is inverted, calibrate:

# Find your touch device
xinput list

# Calibrate (replace ID with your device ID)
xinput set-prop <ID> 'Coordinate Transformation Matrix' 1 0 0 0 1 0 0 0 1

# For inverted X: -1 0 1 0 1 0 0 0 1
# For inverted Y: 1 0 0 0 -1 1 0 0 1
# For inverted both: -1 0 1 0 -1 1 0 0 1
```

## Kiosk Mode Setup

### Install Required Packages

```bash
sudo apt update
sudo apt install -y \
    chromium-browser \
    unclutter \
    matchbox-window-manager \
    xdotool \
    x11-utils
```

### Create Kiosk Script

```bash
# Create kiosk script
nano ~/kiosk.sh
```

Add:

```bash
#!/bin/bash

# OtaClaw Kiosk Mode Launcher

# Disable screen blanking
xset s noblank
xset s off
xset -dpms

# Hide mouse cursor
unclutter -idle 0.5 -root &

# Start window manager
matchbox-window-manager -use_titlebar no &

# Wait for window manager
sleep 2

# Launch Chromium in kiosk mode
chromium-browser \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --check-for-update-interval=31536000 \
    --app=http://localhost:18789/__openclaw__/canvas/otaclaw/ \
    --enable-features=OverlayScrollbar \
    --disable-features=Translate \
    --disable-component-extensions-with-background-pages \
    --disable-background-networking \
    --disable-default-apps \
    --no-first-run \
    --password-store=basic \
    --use-mock-keychain
```

Make executable:

```bash
chmod +x ~/kiosk.sh
```

### Configure X11 for Auto-Start

```bash
# Create .bash_profile for auto-start X
cat >> ~/.bash_profile << 'EOF'

# Auto-start X if on tty1
if [ "$(tty)" = "/dev/tty1" ]; then
    exec startx
fi
EOF
```

Create X11 startup:

```bash
# Create .xinitrc
nano ~/.xinitrc
```

Add:

```bash
#!/bin/bash
exec ~/kiosk.sh
```

## Auto-Start Configuration

### Option 1: systemd Service (Recommended)

```bash
# Create systemd service
sudo nano /etc/systemd/system/otaclaw-kiosk.service
```

Add (replace `pi` with your username if different on Raspberry Pi OS):

```ini
[Unit]
Description=OtaClaw Kiosk Mode
After=network.target openclaw-gateway.service

[Service]
Type=simple
User=pi
Environment=DISPLAY=:0
Environment=XAUTHORITY=%h/.Xauthority
ExecStartPre=/bin/sleep 10
ExecStart=%h/kiosk.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable otaclaw-kiosk.service
sudo systemctl start otaclaw-kiosk.service

# Check status
sudo systemctl status otaclaw-kiosk.service
```

### Option 2: crontab

```bash
# Add to crontab
crontab -e

# Add line:
@reboot sleep 15 && ~/kiosk.sh
```

### Option 3: rc.local

```bash
# Edit rc.local
sudo nano /etc/rc.local

# Add before "exit 0":
su - pi -c '~/kiosk.sh &' &
```

## Power Management

### Screensaver (blank after idle, wake on touch)

**By default the kiosk keeps the screen on.** To let the display rest after inactivity (saves power, reduces burn-in):

```bash
# From your Mac – enable 5‑min timeout (from otaclock-openclaw repo):
./scripts/enable-kiosk-screensaver.sh YOUR_HOST YOUR_USER 300

# Or with 10 min: ... 600
# Touch or move mouse to wake.
```

To disable screensaver (always-on):

```bash
./scripts/disable-kiosk-screensaver.sh YOUR_HOST YOUR_USER
```

### Wake on OpenClaw activity (optional)

When screensaver is enabled, the screen wakes on touch. To also wake when the AI sends a message:

```bash
# On the Pi
pip install websockets
# Run in background (or add as systemd user service):
DISPLAY=:0 OTACLAW_WS_URL=ws://127.0.0.1:18789/ws python3 scripts/screen-wake-on-openclaw.py &
```

### Screen brightness control

```bash
# For official touchscreen (via GPIO):
echo 255 | sudo tee /sys/class/backlight/rpi_backlight/brightness  # Full
echo 128 | sudo tee /sys/class/backlight/rpi_backlight/brightness  # Half
echo 0 | sudo tee /sys/class/backlight/rpi_backlight/brightness    # Off

# For HDMI displays (if supported):
xrandr --output HDMI-1 --brightness 0.5
```

**Wake on touch** (official touchscreen):

```bash
# Screen should wake automatically on touch
# If not, check power management:
sudo nano /etc/lightdm/lightdm.conf

# Add in [Seat:*] section:
xserver-command=X -s 0 -dpms
```

### Power Button (optional)

Add a physical power button for graceful shutdown:

```bash
# Connect button to GPIO 3 (pin 5) and GND (pin 6)
# Add to /boot/firmware/config.txt:
dtoverlay=gpio-shutdown,gpio_pin=3

# Button press = shutdown
# Button press when off = boot
```

## Troubleshooting

### Touch Not Working

```bash
# Check if touch device is detected
lsusb
ls /dev/input/event*
cat /proc/bus/input/devices

# Test with evtest
sudo evtest /dev/input/event0

# Check X11 input
xinput list
xinput list-props <device-id>

# Restart input stack
sudo systemctl restart systemd-logind
```

### Screen Rotation Issues

```bash
# Check current rotation
xrandr -q

# Rotate screen
xrandr --output DSI-1 --rotate left   # 90 degrees
xrandr --output DSI-1 --rotate right  # 270 degrees
xrandr --output DSI-1 --rotate normal # 0 degrees
xrandr --output DSI-1 --rotate inverted # 180 degrees

# Touch calibration after rotation
xinput set-prop <device> 'Coordinate Transformation Matrix' 0 -1 1 1 0 0 0 0 1  # 90 degrees
```

### Chromium Kiosk Issues

```bash
# Clear Chromium data if corrupted
rm -rf ~/.config/chromium/Default

# Check for errors
chromium-browser --enable-logging --v=1

# Run without kiosk to debug
chromium-browser http://localhost:18789/__openclaw__/canvas/otaclaw/
```

### Connection to OpenClaw Fails

```bash
# Check if OpenClaw is running
curl http://localhost:18789/__openclaw__/canvas/

# Check OpenClaw logs
journalctl -u openclaw-gateway -f

# Verify WebSocket endpoint
curl -i -N \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Key: test" \
    -H "Sec-WebSocket-Version: 13" \
    http://localhost:18789/ws
```

### Performance Issues on Pi Zero 2 W

```bash
# Reduce Chromium memory usage
# Edit ~/kiosk.sh flags:
chromium-browser \
    --kiosk \
    --single-process \
    --disable-features=site-per-process \
    --process-per-site \
    --memory-model=low \
    --disable-dev-shm-usage \
    --app=http://localhost:18789/__openclaw__/canvas/otaclaw/

# Disable GPU acceleration for CSS animations
chromium-browser \
    --disable-gpu \
    --disable-software-rasterizer
```

### Screen Flickering

```bash
# For official touchscreen, increase refresh:
sudo nano /boot/firmware/config.txt

# Add:
dtoverlay=vc4-kms-v3d
max_framebuffers=2
```

## Optimizing for OtaClaw

### Disable Unnecessary Services

```bash
# Save resources by disabling unused services
sudo systemctl disable bluetooth
sudo systemctl disable avahi-daemon
sudo systemctl disable triggerhappy

# Optional: Disable Wi-Fi if using Ethernet
sudo systemctl disable wpa_supplicant
```

### GPU Memory Split

```bash
# For Pi 4 with 2GB+ RAM, increase GPU memory for smoother animations
sudo nano /boot/firmware/config.txt

# Add:
gpu_mem=128  # or 256 for smoother performance
```

### Boot Time Optimization

```bash
# Disable boot splash for faster boot
sudo nano /boot/firmware/cmdline.txt

# Remove: quiet splash
# Add: logo.nologo
```

---

## Next Steps

After hardware setup:

1. [Configure OpenClaw integration](../config/openclaw-integration.md)
2. [Customize OtaClaw appearance](../docs/CUSTOMIZATION.md)
3. [Deploy OtaClaw to your Pi](../README.md#installation)

---

**Troubleshooting still needed?** 

Open an issue at https://github.com/U-N-B-R-A-N-D-E-D/otaclaw/issues
