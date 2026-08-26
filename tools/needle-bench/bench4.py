#!/usr/bin/env python3
"""Bench4 (Pi 4): la arquitectura REAL que propone el user — el input NO es un
one-liner, es el contexto rico que el coordinator de HAL genera (tool traces,
stderr, reasoning), como lo registraria numbat en records.ndjson. Needle (45M)
lee ese contexto y elige tag (grammar-restricted a 18) + dur + int.

Diferencias vs bench3 (la que degrada de 1.76s a 43s):
- AGENTE FRESCO por escenario (sin historial acumulado)
- CONTEXTOS RICOS realistas (multi-línea), no one-liners
Mide: costo de construir agente fresco, wall por llamada, family/exact match.
"""
import time, typing
import needle
from needle import Field

TAGS = ["idle","thinking","processing","success","error","laughing","surprised",
        "worried","puzzled","sad","waving","scared","confident","wink","curious",
        "presenting","cold","unpleasant"]
Tag = typing.Literal[tuple(TAGS)]

SYSTEM = (
    "You are the animation director for a small pixel-art avatar that mirrors a "
    "software agent (the coordinator) working on a task. You receive the coordinator's "
    "recent activity: tool calls, command output, reasoning, and user messages. "
    "For each one call play_animation with the single tag that best fits what the "
    "coordinator is doing or feeling right now, a duration_ms, and an intensity. "
    "Choose the tag that matches the situation most specifically — do not default to "
    "one tag for everything."
)

@needle.tool
def play_animation(tag: Tag,
                   duration_ms: typing.Annotated[int, Field(ge=500, le=3000)],
                   intensity: typing.Annotated[int, Field(ge=1, le=3)]):
    """Play one avatar animation for the situation.

    Args:
        tag: which animation to play.
        duration_ms: how long, in milliseconds.
        intensity: 1=subtle, 2=normal, 3=big.
    """
    return {"played": tag, "dur": duration_ms, "int": intensity}

# (label, realistic rich coordinator context)
SCEN = [
    ("idle",
     "No tool calls in the last 40 seconds. The model is waiting. The user is "
     "typing a new message that has not been sent yet."),
    ("thinking",
     "The model is generating a long response (900+ tokens) with no tool calls so "
     "far. It is weighing two architectural options and listing trade-offs."),
    ("processing",
     "Tool call: terminal(command='npm run build', timeout=300). The command is "
     "still running after 30 seconds. stdout shows webpack emitting assets."),
    ("success",
     "Tool result: terminal exited with code 0. Output: 'Tests: 42 passed, 0 "
     "failed, 0 skipped.' The model then says: 'All tests pass — the fix is in.'"),
    ("error",
     "Tool result: terminal exited with code 1. stderr: 'SyntaxError: invalid "
     "syntax (main.py, line 42)'. The model says: 'That syntax error needs "
     "fixing — let me look at line 42.'"),
    ("laughing",
     "The user sent a meme and wrote 'this is hilarious, you will die.' The "
     "model replied with a one-line joke about the meme."),
    ("surprised",
     "The user interrupted mid-tool-call with an out-of-band message: 'actually, "
     "stop and do the other branch instead.' This was unexpected — the tool call "
     "was already in flight."),
    ("sad",
     "The competition results just came in. The model's submission placed last. "
     "The user writes: 'oh no, we lost. tough round.'"),
    ("waving",
     "A new user joined the session. Their first message: 'hi! who are you?' "
     "The model introduces itself."),
    ("confident",
     "The model is about to commit a fix: 'I am confident this resolves the race "
     "condition — the lock now covers the whole read-modify-write. Writing the "
     "patch now.'"),
    ("curious",
     "The model opened an unfamiliar file legacy_module.py it has never touched "
     "before and is reading it to understand what it does. No user request "
     "mentioned this file."),
    ("cold",
     "The user asked a third time for something the model has already declined "
     "twice for policy reasons. The model replies in a short, flat sentence and "
     "changes the subject."),
]

FAM = {"idle": "idle", "thinking": "idle", "processing": "idle"}
def fam_of(t): return FAM.get(t, t)

def pick(res):
    for r in res.get("results", []):
        if "played" in r:
            return r
    return None

print(f"needle {needle.__version__} | fresh agent per call | rich coordinator context")
print(f"{'scenario':<11} {'expected':<11} {'chosen':<11} {'family':<6} {'dur':<6} {'int':<4} {'wall_s':<7}")
print("-"*60)
ok_in = ok_fam = ok_match = 0
t0 = time.perf_counter()
construct_times = []
for label, ctx in SCEN:
    ts = time.perf_counter()
    ag = needle.Needle(tools=[play_animation], system=SYSTEM)
    ct = time.perf_counter() - ts
    construct_times.append(ct)
    ts = time.perf_counter()
    res = ag.run(ctx)
    dt = time.perf_counter() - ts
    played = pick(res)
    tag = played["played"] if played else "(none)"
    incat = tag in TAGS
    fam = bool(incat and fam_of(tag) == fam_of(label))
    ok_in += incat
    ok_fam += fam
    ok_match += (tag == label)
    p = played or {}
    print(f"{label:<11} {label:<11} {tag:<11} {str(fam):<6} "
          f"{str(p.get('dur','')):<6} {str(p.get('int','')):<4} {dt:<7.2f}")
print("-"*60)
import statistics
print(f"total wall: {time.perf_counter()-t0:.1f}s  |  family: {ok_fam}/{len(SCEN)}  |  exact: {ok_match}/{len(SCEN)}")
print(f"agent construct: min {min(construct_times):.2f}s / med {statistics.median(construct_times):.2f}s / max {max(construct_times):.2f}s")
