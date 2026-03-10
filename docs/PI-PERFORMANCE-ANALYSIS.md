# Raspberry Pi Performance Analysis

**Date:** 2026-02-27  
**Target:** Raspberry Pi 4 Model B with TFT35A display  
**Last verified:** 2026-02-27 16:40 (post-upgrade, post-reboot)

---

## Executive Summary

| Area | Status | Notes |
|------|--------|-------|
| Hardware | ✅ Good | Pi 4 8GB, plenty of RAM |
| GPU / Chromium | ⚠️ **Critical** | Using SwiftShader (software) – no hardware GPU |
| OpenClaw Gateway | ⚠️ High load | ~110% CPU constant |
| Updates | ⚠️ Behind | 149 packages, Chromium 142→145 |
| Temperature | ⚠️ Warm | 72.5°C |
| Memory | ✅ OK | 5.8 Gi available |
| OOM | ✅ None | No out-of-memory kills |

**Most likely cause of freezes:** Chromium falling back to software GPU (SwiftShader) instead of hardware acceleration. This increases CPU load and can lead to stalls, especially with animations and long uptime.

---

## 1. Hardware

| Component | Value |
|-----------|-------|
| Model | Raspberry Pi 4 Model B Rev 1.4 |
| Revision | d03114 |
| RAM | 7.6 Gi total, 5.8 Gi available |
| Swap | 2.0 Gi (0 used) |
| Disk | 469 Gi, 2% used |
| Display | TFT35A 480×320 via HDMI |

**Verdict:** Hardware is sufficient. 8GB RAM and disk space are not limiting factors.

---

## 2. Display (TFT35A)

```
Screen 0: minimum 480 x 320, current 480 x 320, maximum 480 x 320
dtoverlay=tft35a:rotate=90
hdmi_cvt 480 320 60 6 0 0 0
hdmi_drive=2
```

- 480×320 @ 60 Hz
- HDMI output, rotated 90°
- `/dev/fb0`, `/dev/fb1` present

---

## 3. Chromium GPU – Critical Issue

**Observed:** Chromium is using **SwiftShader** (software WebGL):

```
--use-angle=swiftshader-webgl
```

**Journal logs show GPU init failure:**

```
ERROR: CollectGraphicsInfo failed
Exiting GPU process due to errors during initialization
ERROR: No suitable EGL configs found
Failed to get config for surface (nil)
gl::GLContext::CreateOffscreenGLSurface failed
```

**Impact:**

- No hardware GPU acceleration
- All rendering done on CPU
- Higher CPU usage and risk of freezes
- Animations and CSS effects are more expensive

**Possible causes:**

- TFT35A / HDMI config not compatible with Chromium’s EGL/GPU stack
- Missing or incompatible GPU drivers
- `disable_fw_kms_setup=1` or other firmware options affecting GPU init

---

## 4. Process Load

| Process | CPU | RAM | Notes |
|---------|-----|-----|-------|
| openclaw-gateway | **~110%** | 16.9% | Constant high CPU |
| chromium (main) | ~4% | 2.4% | |
| chromium (gpu) | ~15% | 1.5% | SwiftShader process |
| chromium (renderer) | ~5% | 1.4% | Widget tab |
| Xorg | ~2% | 0.7% | |

**OpenClaw Gateway** is using more than one full CPU core. Combined with Chromium on software GPU, total CPU load can be high and contribute to freezes.

---

## 5. Temperature

```
temp=72.5°C
```

- Within normal range for Pi 4
- Under sustained load, may reach 80°C+ and trigger throttling
- Consider cooling if freezes occur during long sessions

---

## 6. Memory Split (vcgencmd)

```
gpu=76M
arm=948M
```

- 76 MiB to GPU
- 948 MiB to ARM
- With SwiftShader, GPU memory is less relevant; CPU does the work

---

## 7. Software Versions

| Package | Installed | Available |
|---------|-----------|-----------|
| Chromium | 142.0.7444.175 | **145.0.7632.109** |
| Kernel | 6.12.47+rpt-rpi-v8 | (check `uname -r`) |
| OS | Debian 13 (trixie) | |
| Node | v22.22.0 | |

**149 packages** are upgradable, including Chromium (3 major versions behind).

---

## 8. Recommendations

### High priority

1. **Try hardware GPU for Chromium**
   - Test with `--use-gl=egl` or `--use-gl=desktop` instead of SwiftShader
   - Or remove GPU-related flags and let Chromium auto-detect
   - If GPU init still fails, consider `--disable-gpu` explicitly to reduce surprises

2. **Update Chromium**
   ```bash
   sudo apt update && sudo apt upgrade chromium chromium-common chromium-sandbox chromium-l10n
   ```
   Newer versions may have better GPU/EGL handling and stability.

3. **Profile OpenClaw Gateway**
   - Identify why it uses ~110% CPU
   - Check for busy loops, excessive polling, or heavy inference

### Medium priority

4. **Apply system updates**
   ```bash
   sudo apt update && sudo apt upgrade
   ```
   Reboot after kernel or Chromium updates.

5. **Improve cooling**
   - Heatsink or small fan if temperature often exceeds 75°C

6. **Chromium flags for kiosk**
   - Add `--disable-background-timer-throttling` only if needed
   - Consider `--disable-features=Translate` to reduce background work
   - Test `--enable-features=VaapiVideoDecoder` if using video (Pi 4 supports VA-API)

### Low priority

7. **Locale warning**
   ```bash
   sudo locale-gen en_US.UTF-8
   sudo update-locale
   ```
   Fixes `setlocale: LC_ALL: cannot change locale` in SSH.

8. **Reduce background services**
   - Disable or stop unused user services (gvfs, mpris-proxy, etc.) if not needed for kiosk.

---

## 9. Quick Test: Chromium GPU

To test if hardware GPU can be used:

```bash
# Edit kiosk script
nano ~/otaclaw-kiosk.sh

# Add before --kiosk:
--ignore-gpu-blocklist \
--enable-features=Vulkan \
# Or try:
--use-gl=egl \
```

Then restart the kiosk. If Chromium starts without EGL errors, hardware acceleration may be active. If it still falls back to SwiftShader, the TFT35A/HDMI setup may not be compatible with Chromium’s GPU stack.

---

## 10. Summary

| Issue | Severity | Action |
|-------|----------|--------|
| Chromium on SwiftShader (no GPU) | High | Try GPU flags, update Chromium |
| OpenClaw Gateway ~110% CPU | High | Profile and optimize |
| 149 pending updates | Medium | Run `apt upgrade` |
| Temperature 72.5°C | Medium | Monitor, add cooling if needed |
| Locale warning | Low | Fix locale config |

The combination of software-rendered Chromium and a busy OpenClaw Gateway is the most plausible cause of freezes and sluggishness. Addressing GPU usage and gateway CPU load should have the largest impact.

---

## 11. Post-Upgrade Verification (2026-02-27)

### Status: ✅ Pristine

| Check | Result |
|-------|--------|
| Kernel | 6.12.62+rpt-rpi-v8 ✅ |
| Chromium | 145.0.7632.109 ✅ |
| Memory | 983 Mi used, 6.7 Gi available ✅ |
| Temperature | 65.7°C ✅ |
| Services | otaclaw-kiosk, openclaw-gateway, otaclaw-static all active ✅ |
| Screensaver | DPMS enabled, 300s timeout ✅ |
| Linger | yes (user services without login) ✅ |

### Chromium GPU (post-upgrade)

- **Before:** SwiftShader (software)
- **After:** `--use-gl=disabled` – GPU still not used (TFT35A/EGL limitation)
- Chromium 145 may have different fallback; no EGL errors in recent logs

### Remaining Optimizations (optional)

| Item | Effort | Impact |
|------|--------|--------|
| **Locale** – `sudo locale-gen en_US.UTF-8` | Low | Removes bash/setlocale warnings in SSH |
| **OpenClaw security** – `openclaw security audit` | Low | Addresses HostHeaderOriginFallback warning |
| **18 packages kept back** (pipewire, libcamera) | N/A | Held for dependencies; safe to leave |
| **OpenClaw Gateway ~64% CPU** | Medium | Profile if freezes persist; may be LLM inference |

### Logs Summary

- **OpenClaw:** Canvas mounted, gateway listening, Discord logged in, health monitor started
- **dmesg:** Staging driver warnings (fbtft, snd_bcm2835) – normal for Pi
- **syslog:** console-setup failed, bluetooth mode, wpa_supplicant – minor, non-blocking
