#!/usr/bin/env python3
"""Root-cause probe for the bench3 hang. Dumps a real Python stack if any phase
exceeds 30s, so we can tell grammar-compile (build_schema/grammar) from generation
(agent.run). Bounded externally by `timeout` on the caller side."""
import faulthandler, signal, sys, time, typing
import needle
from needle import Field

def on_alarm(sig, frame):
    faulthandler.dump_traceback()
    print("\n=== 30s ALARM: stuck, dumping stack above ===", flush=True)
    sys.exit(3)

signal.signal(signal.SIGALRM, on_alarm)
signal.alarm(30)

print("phase 0: import ok, needle", needle.__version__, flush=True)
TAGS = ["idle","thinking","processing","success","error","laughing","surprised",
        "worried","puzzled","sad","waving","scared","confident","wink","curious",
        "presenting","cold","unpleasant"]
Tag = typing.Literal[tuple(TAGS)]

def t0(label):
    print(f"phase: {label} ...", flush=True)

# Phase 1: does BUILDING the schema (grammar compile) hang?
t0("build_schema (grammar compile)")
@needle.tool
def play_animation(tag: Tag,
                   duration_ms: typing.Annotated[int, Field(ge=500, le=3000)],
                   intensity: typing.Annotated[int, Field(ge=1, le=3)]):
    """Play one avatar animation.
    Args:
        tag: which animation.
        duration_ms: how long.
        intensity: 1-3.
    """
    return {"played": tag, "dur": duration_ms, "int": intensity}
print("  schema built OK:", play_animation._needle_tool["name"],
      "tag enum len:", len(play_animation._needle_tool["parameters"]["properties"]["tag"].get("enum", [])), flush=True)

# Phase 2: does CONSTRUCTING the agent (grammar object) hang?
t0("Needle() agent construct")
agent = needle.Needle(tools=[play_animation], system="Pick a tag.")
print("  agent constructed OK", flush=True)

# Phase 3: does a single RUN hang?
t0("agent.run (generation)")
res = agent.run("The agent is thinking hard.")
print("  run OK:", res, flush=True)
print("ALL PHASES PASSED (no hang)", flush=True)
