#!/usr/bin/env python3
"""
Pi Tickle Sound - Play a short "laugh" beep when tickle is triggered.

Modes (auto-detected):
  1. GPIO buzzer: piezo on GPIO pin (default 18) + GND. Requires gpiozero.
  2. System audio: HDMI or 3.5mm jack. Uses speaker-test (no extra hardware).

Usage:
  python3 pi-buzzer-tickle.py [--port 18790] [--gpio 18] [--audio]
  --audio = force system audio (HDMI/3.5mm), skip GPIO

The OtaClaw widget calls http://127.0.0.1:18790/tickle when user swipes over Hal.
"""
import argparse
import http.server
import subprocess
import threading
import time

try:
    from gpiozero import Buzzer
    HAS_GPIO = True
except ImportError:
    HAS_GPIO = False


def play_system_beep() -> None:
    """Triple beep via HDMI/3.5mm (speaker-test). No extra hardware needed."""
    try:
        for _ in range(3):
            subprocess.run(
                ["speaker-test", "-t", "sine", "-f", "880", "-l", "1"],
                capture_output=True,
                timeout=2,
            )
            time.sleep(0.05)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass


def play_gpio_beep(gpio_pin: int) -> None:
    """Play triple beep on GPIO buzzer (active buzzer on pin + GND)."""
    if not HAS_GPIO:
        return
    try:
        b = Buzzer(gpio_pin)
        for _ in range(3):
            b.on()
            time.sleep(0.06)
            b.off()
            time.sleep(0.05)
    except Exception:
        pass


def play_laugh_beep(gpio_pin: int, use_audio: bool) -> None:
    """Play laugh sound: GPIO buzzer if available, else system audio (HDMI/3.5mm)."""
    if use_audio:
        play_system_beep()
        return
    if HAS_GPIO:
        try:
            play_gpio_beep(gpio_pin)
            return
        except Exception:
            pass
    play_system_beep()


class TickleHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/tickle" or self.path == "/tickle/":
            gpio = int(self.server.gpio_pin)
            use_audio = getattr(self.server, "use_audio", False)
            threading.Thread(
                target=play_laugh_beep, args=(gpio, use_audio), daemon=True
            ).start()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b"OK")
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def log_message(self, format, *args):
        pass


def main():
    p = argparse.ArgumentParser(description="Pi tickle sound server")
    p.add_argument("--port", type=int, default=18790)
    p.add_argument("--gpio", type=int, default=18)
    p.add_argument("--audio", action="store_true", help="Use HDMI/3.5mm audio (no GPIO buzzer)")
    args = p.parse_args()

    server = http.server.HTTPServer(("127.0.0.1", args.port), TickleHandler)
    server.gpio_pin = args.gpio
    server.use_audio = args.audio
    mode = "HDMI/3.5mm" if args.audio else ("GPIO " + str(args.gpio) if HAS_GPIO else "HDMI/3.5mm (no gpiozero)")
    print(f"Tickle server on http://127.0.0.1:{args.port}/tickle ({mode})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    exit(main())
