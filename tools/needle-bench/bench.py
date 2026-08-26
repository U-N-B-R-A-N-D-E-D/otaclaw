#!/usr/bin/env python3
"""Bench Needle 2 (Pi 4, aarch64, 4-core) for avatar-animation-shaped tool calls.
Goal: ground the latency of a 'living session' director — short prompts in,
1-2 tool calls out, one persistent session (256-token window)."""
import json, time
import needle

print(f"needle version: {getattr(needle, '__version__', 'unknown')}")

@needle.tool
def play_animation(tag: str, duration_ms: int, intensity: int):
    """Play an avatar animation. tag: one of idle, thinking, processing, success, error,
    laughing, surprised, worried, puzzled, sad, waving, scared, confident, wink, curious,
    presenting, cold, unpleasant. duration_ms: how long to hold it. intensity: 1 (subtle) to 3 (big)."""
    return {"played": tag}

@needle.tool
def say(text: str):
    """Show a short speech bubble (max 8 words) above the avatar."""
    return {"said": text}

agent = needle.Needle(tools=[play_animation, say])

def measure(label, prompt):
    t0 = time.perf_counter()
    r = agent.run(prompt)
    dt = time.perf_counter() - t0
    print(f"\n=== {label} === wall: {dt:.2f}s")
    print("prompt:", prompt)
    print("response:", json.dumps(r, indent=2, default=str)[:1500])
    return r

# Run 1 includes model load + engine init; the rest are steady-state session turns.
t_load = time.perf_counter()
measure("warmup (incl. model load + engine init)", "The agent is idle. Nothing is happening right now.")
print(f"\n[load+first-turn total: {time.perf_counter() - t_load:.1f}s]")

measure("thinking", "The agent has been thinking hard for 30 seconds about a tricky bug in the websocket client.")
measure("success", "The agent finished the task: the test suite just passed on all 42 cases.")
measure("error", "The agent hit a compile error while building and is going to retry with a fix.")
measure("tickle", "A human just poked the avatar's head with a finger.")
measure("boredom", "Nothing has happened for five minutes now. The agent is waiting for new work.")

print("\nDONE")
