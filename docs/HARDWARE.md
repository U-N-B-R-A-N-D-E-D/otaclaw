# Hardware Guide

Comprehensive guide for running OtaClaw on various hardware configurations.

## Table of Contents

- [Recommended Setups](#recommended-setups)
- [Raspberry Pi](#raspberry-pi)
- [Alternative Single Board Computers](#alternative-single-board-computers)
- [Desktop/Laptop](#desktoplaptop)
- [Android Tablets](#android-tablets)
- [Old Hardware Repurposing](#old-hardware-repurposing)
- [Performance Optimization](#performance-optimization)

## Recommended Setups

### Tier 1: Best Experience (Recommended)

**Raspberry Pi 4 (4GB) + Official 7" Touchscreen**
- Smooth 60fps animations
- Instant touch response
- Reliable for 24/7 operation
- Cost: ~$120

### Tier 2: Good Performance

**Raspberry Pi 3B+ + HDMI Display**
- Good animation performance
- Works with existing monitors
- Ethernet recommended
- Cost: ~$60 + display

### Tier 3: Budget/Compact

**Raspberry Pi Zero 2 W + Waveshare 2.8" LCD**
- Ultra-compact
- Lower power consumption
- Simpler animations recommended
- Cost: ~$40

### Tier 4: Desktop/Existing Hardware

**Any PC/Mac + Browser**
- Use what you have
- Best performance
- No touch (unless using touchscreen monitor)
- Cost: $0

## Raspberry Pi

### Detailed Comparison

| Model | RAM | Performance | Power | Cost | Recommendation |
|-------|-----|-------------|-------|------|----------------|
| Pi 5 (8GB) | 8GB | Excellent | 15W | $80 | Overkill, but future-proof |
| Pi 4 (4GB) | 4GB | Excellent | 7.5W | $55 | **Best choice** |
| Pi 4 (2GB) | 2GB | Very Good | 7.5W | $45 | Good budget option |
| Pi 3B+ | 1GB | Good | 5W | $35 | Works well |
| Pi Zero 2 W | 512MB | Adequate | 2.5W | $15 | Compact setups only |
| Pi 5 (8GB) | 8GB | Excellent | 15W | $80 | Overkill, but future-proof |

### Power Supply Requirements

| Model | Official PSU | Minimum | Recommended |
|-------|--------------|---------|-------------|
| Pi 4 | 5V/3A USB-C | 5V/2.5A | 5V/3A |
| Pi 3B+ | 5V/2.5A microUSB | 5V/2A | 5V/2.5A |
| Pi Zero 2 W | 5V/2.5A microUSB | 5V/1A | 5V/2A |

**⚠️ Warning:** Underpowered Pi will show yellow lightning bolt and throttle performance.

### microSD Card Selection

| Grade | Speed | Use Case | Examples |
|-------|-------|----------|----------|
| A1 | 10MB/s | Budget, slow boot | Generic Class 10 |
| A2 | 40MB/s | Good performance | Samsung EVO Select |
| A2 + V30 | 100MB/s | Best performance | SanDisk Extreme Pro |

**Recommended:** SanDisk Extreme Pro 32GB A2

### Thermal Management

**Temperature Thresholds:**
- Under 70°C: Good
- 70-80°C: Throttling begins
- Over 80°C: Significant throttling

**Cooling Options:**

1. **Passive (heatsink case)**
   - Good for Pi 3B+, Pi Zero 2 W
   - Silent operation
   - Examples: Flirc case, Argon NEO

2. **Active (fan case)**
   - Recommended for Pi 4
   - Maintains <70°C under load
   - Examples: Argon ONE, Pimoroni Fan Shim

3. **DIY cooling**
   ```bash
   # Monitor temperature
   watch -n 1 vcgencmd measure_temp
   
   # Force fan on (if controllable)
   echo 255 | sudo tee /sys/class/hwmon/hwmon0/pwm1
   ```

## Alternative Single Board Computers

### Orange Pi 5

- **CPU:** Rockchip RK3588 (quad A76 + quad A55)
- **RAM:** 4-16GB
- **Performance:** Better than Pi 4
- **OS:** Orange Pi OS, Armbian
- **Notes:** Good alternative, less community support

### ASUS Tinker Board 2

- **CPU:** Rockchip RK3399
- **RAM:** 2GB
- **Performance:** Similar to Pi 4
- **OS:** TinkerOS (Debian-based)
- **Notes:** Good build quality

### Odroid N2+

- **CPU:** Amlogic S922X
- **RAM:** 2-4GB
- **Performance:** Excellent
- **OS:** Ubuntu, Android
- **Notes:** More powerful than Pi 4, larger form factor

## Desktop/Laptop

### Minimum Requirements

- **CPU:** Any dual-core from 2010+
- **RAM:** 2GB
- **GPU:** Any (integrated fine)
- **Browser:** Chrome/Edge/Firefox (latest)

### Recommended

- **CPU:** Modern dual-core+
- **RAM:** 4GB+
- **GPU:** Hardware acceleration enabled
- **Display:** Any, touchscreen optional

### Touchscreen Monitors

USB touch overlays for existing monitors:
- **10-point touch frames:** $50-100
- **Infrared touch overlays:** $80-150
- **USB-C portable monitors with touch:** $150-250

## Android Tablets

### Using Old Android Tablets

Repurpose old tablets as dedicated OtaClaw displays:

**Requirements:**
- Android 5.0+ (Lollipop)
- Chrome or WebView support
- Wi-Fi connectivity

**Setup:**
1. Install [Fully Kiosk Browser](https://www.fully-kiosk.com/)
2. Configure URL: `http://<your-openclaw-host>:18789/__openclaw__/canvas/otaclaw/`
3. Enable: Keep screen on, Start on boot
4. Disable: Sleep, lock screen

**Battery Considerations:**
- Remove battery if always plugged in (fire risk)
- Or use smart plug to cycle power nightly

### Recommended Tablets

| Model | Screen | Notes | Price |
|-------|--------|-------|-------|
| Fire HD 8 | 8" | Cheap, may need Google Play sideload | $60 |
| Samsung Tab A7 | 10.4" | Good quality, reliable | $150 |
| Lenovo Tab M10 | 10.1" | Budget option | $120 |
| iPad Mini (old) | 7.9" | iOS limits, but works | $200+ used |

## Old Hardware Repurposing

### Old Laptop as Display

**Remove motherboard, keep screen:**

1. Get LCD controller board ($15-30 on eBay)
2. Connect laptop panel to controller
3. Add Raspberry Pi behind panel
4. Wall-mounted AI display!

**Keep laptop intact:**
- Install lightweight Linux (Lubuntu, Xubuntu)
- Run Chromium in kiosk mode
- Use as-is

### Old Smartphone

Similar to Android tablets:
- Remove battery for safety
- Use [UserLAnd](https://github.com/CypherpunkArmory/UserLAnd) or [Termux](https://termux.dev/)
- Run Firefox in fullscreen

### E-ink Displays (Experimental)

For always-on, low-power displays:

**Compatible:**
- Waveshare e-Paper displays
- Pimoroni Inky displays

**Limitations:**
- No animations (static images only)
- Slow refresh rate
- Black and white or limited colors

## Performance Optimization

### Raspberry Pi Optimization

```bash
# 1. Disable unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable avahi-daemon
sudo systemctl disable triggerhappy

# 2. GPU memory split
# Edit /boot/firmware/config.txt
gpu_mem=128  # For Pi 4
gpu_mem=64   # For Pi 3

# 3. Disable Wi-Fi/Bluetooth if using Ethernet
dtoverlay=disable-wifi
dtoverlay=disable-bt

# 4. Enable performance CPU governor
echo 'performance' | sudo tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor

# 5. Make permanent
sudo apt install cpufrequtils
sudo systemctl enable cpufrequtils
```

### Browser Optimization

```bash
# Chromium flags for low-end devices
chromium-browser \
    --kiosk \
    --single-process \
    --disable-features=site-per-process \
    --process-per-site \
    --memory-model=low \
    --disable-dev-shm-usage \
    --disable-gpu \
    --disable-software-rasterizer \
    --max_old_space_size=512 \
    --js-flags='--max-old-space-size=512'
```

### Network Optimization

For Wi-Fi connected displays:

```bash
# Improve Wi-Fi reliability
# Edit /etc/wpa_supplicant/wpa_supplicant.conf

network={
    ssid="your-network"
    psk="YOUR_WIFI_PASSWORD"
    scan_ssid=1
    key_mgmt=WPA-PSK
    # Disable power saving
    power_save=0
}

# Or disable power saving globally
sudo iw dev wlan0 set power_save off
```

### Storage Optimization

```bash
# 1. Use RAM disk for temporary files
# Edit /etc/fstab
tmpfs /tmp tmpfs defaults,noatime,nosuid,size=100m 0 0
tmpfs /var/tmp tmpfs defaults,noatime,nosuid,size=50m 0 0

# 2. Reduce logging
# Edit /etc/rsyslog.conf
# Comment out *.info;mail.none;authpriv.none;cron.none /var/log/messages

# 3. Use log2ram (optional)
git clone https://github.com/azlux/log2ram.git
cd log2ram
sudo ./install.sh
```

## Enclosure Ideas

### 3D Printed Cases

**Resources:**
- [Thingiverse](https://www.thingiverse.com/) - Search "Raspberry Pi case"
- [Printables](https://www.printables.com/) - Quality designs
- [MyMiniFactory](https://www.myminifactory.com/) - Premium models

**Recommended Designs:**
- "Pi 4 Touchscreen Stand" - Integrated display mount
- "Retro Computer Case" - Vintage aesthetic
- "Minimalist Pi Case" - Clean modern look

### DIY Enclosures

**Cardboard (prototype):**
- Quick, free, customizable
- Spray paint for finished look

**Wood (permanent):**
- Pi + display in picture frame
- Desk stand with cable management
- Wall mount enclosure

**Acrylic (premium):**
- Laser-cut custom designs
- LED accent lighting
- Professional appearance

### Commercial Cases

**For Official Touchscreen:**
- SmartiPi cases ($25-40)
- Pimoroni stands ($20-30)
- Custom touchscreen frames ($15-25)

## Power Budget Calculation

### Component Power Draw

| Component | Idle | Active | Peak |
|-----------|------|--------|------|
| Pi 4 | 2.1W | 4.5W | 7.6W |
| Pi 3B+ | 1.9W | 3.8W | 5.9W |
| Pi Zero 2 W | 0.8W | 1.5W | 2.5W |
| 7" Touchscreen | 1.5W | 1.5W | 2W |
| Waveshare 3.5" | 0.5W | 0.5W | 0.8W |
| HDMI Display | Varies | Varies | Varies |
| Cooling Fan | 0.5W | 1W | 1W |

### Example Configurations

| Setup | Idle | Active | 24h Cost* |
|-------|------|--------|-----------|
| Pi 4 + 7" Touch | 3.6W | 6W | ~$0.15 |
| Pi 3B+ + HDMI | 3W | 5W | ~$0.12 |
| Pi Zero 2 + 2.8" | 1.3W | 2W | ~$0.05 |

*At $0.15/kWh

## Troubleshooting Hardware Issues

### Intermittent Touch Response

```bash
# Check touch device
cat /proc/bus/input/devices | grep -A 5 Touch

# Test raw input
cat /dev/input/event0 | xxd  # (Press Ctrl+C to stop)

# Recalibrate touch
sudo apt install xinput-calibrator
xinput_calibrator
```

### Screen Flickering

```bash
# Check HDMI connection (if applicable)
# Try different cable

# For DSI displays, check config:
dtoverlay=vc4-kms-v3d

# Disable VC4 if issues persist:
# Comment out dtoverlay=vc4-kms-v3d
```

### Overheating

```bash
# Monitor temperature
while true; do
    vcgencmd measure_temp
    sleep 1
done

# Check throttling
vcgencmd get_throttled
# 0x0 = Normal
# 0x80000 = Soft temperature limit occurred
# 0x20000 = Arm frequency capped
# 0x40000 = Throttling occurred
```

### Wi-Fi Connection Drops

```bash
# Check signal strength
iwconfig
iw dev wlan0 link

# Disable power management
sudo iwconfig wlan0 power off

# Or in /etc/network/interfaces:
wireless-power off
```

---

For hardware-specific setup instructions, see [raspberry-pi-setup.md](../deploy/raspberry-pi-setup.md).
