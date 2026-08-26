#!/usr/bin/env python3
"""Bench2 (Pi 4, aarch64): does Needle 2 pick the RIGHT one of 18 avatar tags
when given a proper system prompt? bench1 (empty system) degenerated to the same
non-catalog tag for every scenario — this isolates whether a grounding prompt fixes it.
Measures per-scenario: chosen tag, whether it's in-catalog, duration, intensity."""
import json, time
import needle

TAGS = ["idle","thinking","processing","success","error","laughing","surprised",
        "worried","puzzled","sad","waving","scared","confident","wink","curious",
        "presenting","cold","unpleasant"]

SYSTEM = (
    "You are the animation director for a small pixel-art avatar. "
    "You receive short factual statements about what the agent is doing or feeling. "
    "For each one, choose EXACTLY ONE animation tag from this fixed list and call play_animation with it: "
    + ", ".join(TAGS) + ". "
    "Also set duration_ms (500-3000) and intensity (1=subtle, 2=normal, 3=big). "
    "Only call say() when the avatar should speak a short bubble of 8 words or fewer. "
    "Pick the tag that best matches the situation. Do not invent tags."
)

@needle.tool
def play_animation(tag: str, duration_ms: int, intensity: int):
    """Play one avatar animation."""
    return {"played": tag, "dur": duration_ms, "int": intensity}

@needle.tool
def say(text: str):
    """Show a short speech bubble above the avatar."""
    return {"said": text}

agent = needle.Needle(tools=[play_animation, say], system=SYSTEM)

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

def pick(res):
    for r in res.get("results", []):
        if "played" in r:
            return r
    return None

print(f"needle {needle.__version__}  | system prompt: {len(SYSTEM)} chars")
print(f"{'scenario':<11} {'expected':<11} {'chosen':<13} {'in-cat':<6} {'dur':<6} {'int':<4} {'wall_s':<7}")
print("-"*60)
FAM = {"idle": "idle", "thinking": "idle", "processing": "idle"}
def fam_of(t):
    return FAM.get(t, t)

ok_in = ok_fam = ok_match = 0
t0 = time.perf_counter()
for label, prompt in SCEN:
    ts = time.perf_counter()
    res = agent.run(prompt)
    dt = time.perf_counter() - ts
    played = pick(res)
    tag = played["played"] if played else "(none)"
    incat = tag in TAGS
    fam = incat and fam_of(tag) == fam_of(label)
    ok_in += incat
    ok_fam += fam
    ok_match += (tag == label)
    p = played or {}
    print(f"{label:<11} {tag:<13} {str(incat):<6} "
          f"{str(p.get('dur','')):<6} {str(p.get('int','')):<4} {dt:<7.2f}")
    if not played:
        raws = [r for r in res.get("results", []) if not ("played" in r or "said" in r)]
        if raws:
            print(f"{'':<11} NO TOOL CALL -> raw: {str(raws[-1])[:160]!r}")
    said = [r for r in res.get("results",[]) if "said" in r]
    if said:
        print(f"{'':<11} say(): {said[0]['said']!r}  conf={res.get('confidence')}")
print("-"*60)
print(f"total wall: {time.perf_counter()-t0:.1f}s  |  in-catalog: {ok_in}/{len(SCEN)}  |  family match: {ok_fam}/{len(SCEN)}  |  exact match: {ok_match}/{len(SCEN)}")
