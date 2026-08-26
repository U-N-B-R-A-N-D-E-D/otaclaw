#!/usr/bin/env python3
"""Probe: cuando bench4 devuelve (none), qué dice el modelo? Si el razonamiento es
bueno pero no emite la tool -> fijable en harness (forzar llamada / parsear texto).
Si el razonamiento también es incoherente -> modelo demasiado chico para el trabajo."""
import json, time, needle
from typing import Literal

TAGS = ["idle","thinking","processing","success","error","laughing","surprised","sad",
        "waving","confident","curious","cold"]

@needle.tool
def play_animation(played: Literal[tuple(TAGS)] = "idle",
                   dur: int = 3000,
                   intensity: int = 3) -> str:
    return f"played:{played}"

SYSTEM = "You are the gesture brain of a robot avatar. Read the coordinator's work " \
         "context below and pick the ONE gesture that fits. You MUST call the " \
         "play_animation tool. Do not just talk."

SCEN = [
  ("idle", "## Coordinator state\n"
           "- last activity: 94s ago\n"
           "- queue: empty\n"
           "- tool_calls in window: 0\n"
           "- errors: none\n"
           "The coordinator is parked between tasks, nothing in flight."),
  ("thinking", "## Coordinator state\n"
               "- tool_calls in window: 0\n"
               "- reasoning trace: 'I need to compare the two approaches; the cache "
               "invalidation path is the risky one, let me think about TTL semantics...'\n"
               "- no tool invoked yet, evaluating before acting"),
  ("error", "## Coordinator state\n"
            "- tool_calls: [read_file, terminal]\n"
            "- last stderr: `ModuleNotFoundError: No module named 'dotenv'`\n"
            "- terminal exit_code: 1\n"
            "- the coordinator is reporting the failure back to the user"),
]

for label, ctx in SCEN:
    ag = needle.Needle(tools=[play_animation], system=SYSTEM)
    t0 = time.perf_counter()
    res = ag.run(ctx)
    dt = time.perf_counter() - t0
    fc = res.get("function_calls") or []
    results = res.get("results") or []
    print(f"=== {label}  ({dt:.2f}s) ===")
    print(f"  function_calls: {fc}")
    print(f"  results:        {results}")
    print(f"  reasoning:      {res.get('reasoning')!r}")
    print(f"  confidence:     {res.get('confidence')}")
    print()
