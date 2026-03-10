#!/usr/bin/env python3
"""
Wake screen when OpenClaw has activity (WebSocket messages).
Run as: python3 screen-wake-on-openclaw.py
Requires: pip install websockets
"""
import asyncio
import subprocess
import os
import sys

try:
    import websockets
except ImportError:
    print("Install: pip install websockets", file=sys.stderr)
    sys.exit(1)

WS_URL = os.environ.get("OTACLAW_WS_URL", "ws://127.0.0.1:18789/ws")
DISPLAY = os.environ.get("DISPLAY", ":0")
ENV = {**os.environ, "DISPLAY": DISPLAY}


async def wake_screen():
    subprocess.run(["xset", "dpms", "force", "on"], env=ENV, capture_output=True)
    subprocess.run(["xset", "s", "reset"], env=ENV, capture_output=True)


async def main():
    while True:
        try:
            async with websockets.connect(WS_URL, ping_interval=20, close_timeout=5) as ws:
                async for _ in ws:
                    await wake_screen()
        except Exception as e:
            print(f"Reconnect in 30s: {e}", file=sys.stderr)
            await asyncio.sleep(30)


if __name__ == "__main__":
    asyncio.run(main())
