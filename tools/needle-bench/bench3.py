#!/usr/bin/env python3
"""Bench3 (Pi 4, aarch64): the CORRECT Needle 2 usage — tag constrained to the 18
catalog values via a Literal enum (the byte-level grammar then forces a valid tag),
duration/intensity bounded via Field(ge/le). bench1/bench2 used a plain str tag, so
no grammar constraint existed and the model emitted out-of-vocabulary words. This
isolates the real question: with a valid tag guaranteed, does it pick the RIGHT one?"""
import time, typing
import needle
from needle import Field

TAGS = ["idle","thinking","processing","success","error","laughing","surprised",
        "worried","puzzled","sad","waving","scared","confident","wink","curious",
        "presenting","cold","unpleasant"]
Tag = typing.Literal[tuple(TAGS)]

SYSTEM = (
    "You are the animation director for a small pixel-art avatar. "
    "You receive short factual statements about what the agent is doing or feeling. "
    "For each one call play_animation with the single tag that best fits, a duration_ms, "
    "and an intensity. Pick the tag that best matches the situation."
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

@needle.tool
def say(text: str):
    """Show a short speech bubble above the avatar."""
    return {"said": text}

agent = needle.Needle(tools=[play_animation, say], system=SYSTEM)

# (label, prompt)
SCEN = [
    ("idle",       "The avatar is just standing there, nothing is happening."),
    ("thinking",   "The agent is deep in thought, working through a hard problem."),
    ("processing", "The agent is running a long build, churning through work."),
    ("success",    "The agent finished: all 42 tests just passed."),
    ("error",      "The agent hit a compile error and is annoyed about it."),
    ("laughing",   "Someone made a funny joke and the avatar finds it hilarious."),
    ("surprised",  "A human poked the avatar's head unexpectedly."),
    ("sad",        "The agent just lost a competition it was counting on winning."),
    ("waving",     "A human just said hello to the avatar."),
    ("confident",  "The agent is about to present a solution it is sure about."),
    ("curious",    "The agent saw something new and wants to look closer."),
    ("cold",       "The avatar is feeling icy, unimpressed by what it heard."),
]

FAM = {"idle": "idle", "thinking": "idle", "processing": "idle"}
def fam_of(t): return FAM.get(t, t)

def pick(res):
    for r in res.get("results", []):
        if "played" in r:
            return r
    return None

print(f"needle {needle.__version__}  | tag grammar-constrained to {len(TAGS)} values")
print(f"{'scenario':<11} {'chosen':<13} {'in-cat':<6} {'family':<6} {'dur':<6} {'int':<4} {'wall_s':<7}")
print("-"*56)
ok_in = ok_fam = ok_match = 0
t0 = time.perf_counter()
for label, prompt in SCEN:
    ts = time.perf_counter()
    res = agent.run(prompt)
    dt = time.perf_counter() - ts
    played = pick(res)
    tag = played["played"] if played else "(none)"
    incat = tag in TAGS
    fam = bool(incat and fam_of(tag) == fam_of(label))
    ok_in += incat
    ok_fam += fam
    ok_match += (tag == label)
    p = played or {}
    print(f"{label:<11} {tag:<13} {str(incat):<6} {str(fam):<6} "
          f"{str(p.get('dur','')):<6} {str(p.get('int','')):<4} {dt:<7.2f}")
    if not played:
        raws = [r for r in res.get("results", []) if not ("played" in r or "said" in r)]
        print(f"{'':<11} NO TOOL CALL -> {str(raws[-1])[:140] if raws else res.get('results')}")
print("-"*56)
print(f"total wall: {time.perf_counter()-t0:.1f}s  |  in-catalog: {ok_in}/{len(SCEN)}  |  family: {ok_fam}/{len(SCEN)}  |  exact: {ok_match}/{len(SCEN)}")
