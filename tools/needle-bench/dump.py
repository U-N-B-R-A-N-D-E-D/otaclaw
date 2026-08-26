#!/usr/bin/env python3
import json, needle

TAGS = ["idle","thinking","processing","success","error","laughing","surprised",
        "worried","puzzled","sad","waving","scared","confident","wink","curious",
        "presenting","cold","unpleasant"]
SYSTEM = ("You are the animation director for a small pixel-art avatar. "
 "For each statement choose EXACTLY ONE tag from: " + ", ".join(TAGS) +
 ". Call play_animation(tag, duration_ms, intensity). Do not invent tags.")

@needle.tool
def play_animation(tag: str, duration_ms: int, intensity: int):
    return {"played": tag, "dur": duration_ms, "int": intensity}

ag = needle.Needle(tools=[play_animation], system=SYSTEM)

for label, p in [("idle","The avatar is standing there, nothing happening."),
                 ("success","All 42 tests just passed."),
                 ("error","The build just failed with a compile error.")]:
    res = ag.run(p)
    print(f"=== {label} ===")
    print("  function_calls:", res.get("function_calls"))
    print("  results       :", res.get("results"))
    print("  confidence    :", res.get("confidence"))
