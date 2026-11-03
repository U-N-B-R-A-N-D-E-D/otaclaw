# Sprite functions — 1:1 Hal assets

Every bundled Hal asset has a stable **function id**, an **emoji**, its sheet cell
and the state sequence it belongs to. A gateway can select the exact asset with
`agent.sprite` (Vibeconferencing-style), instead of relying on the state heuristics.

Manifest: `src/data/sprite-functions.json` (43 frames). Resolver: `src/js/core/sprite-functions.js`.

## Assets

Ids describe what the pixels show (v3 visual pass, see [SPRITE-ANATOMY.md](SPRITE-ANATOMY.md)).
Pre-v3 ids still resolve to the same cell through `aliases`, so existing gateways keep working.

| id | emoji | cell | state | description | pre-v3 aliases |
|---|---|---|---|---|---|
| `idle` | 🙂 | `[0,0]` | `idle` | standing, one hand on hip, other arm down, neutral face — true rest | — |
| `point_ready` | 👉 | `[1,0]` | `processing` | fist forward, neutral — about to make a point | `think_left` |
| `point_stern` | 😤 | `[2,0]` | `processing` | fist forward, frowning — objecting, stern | `think_right` |
| `waiting` | ⏳ | `[3,0]` | `idle` | arms folded over belly, head turned aside — calm waiting | — |
| `contemplate` | 🧐 | `[4,0]` | `thinking` | arm across, hand to chin — thinking | — |
| `think_squint` | 🤔 | `[5,0]` | `thinking` | hand to chin, eyes narrowed — concentrating (also the blink frame of 4,0) | `puzzled` |
| `think_glance` | 👀 | `[6,0]` | `thinking` | hand to chin, glancing aside — pondering, reading | `explain_left` |
| `contemplate_alt` | 🧐 | `[7,0]` | `thinking` | hand to chin, alternate drawing — thinking | `explain_right` |
| `hands_clasped` | 🙂 | `[8,0]` | `idle` | hands clasped in front, neutral — polite waiting | `arms_closed` |
| `arms_crossed` | 🤔 | `[9,0]` | `thinking` | arms crossed, hand at chin, neutral — weighing it up | `shocked_left` |
| `arms_crossed_squint` | 😑 | `[10,0]` | `thinking` | arms crossed, eyes narrowed — skeptical focus (also the blink frame of 9,0) | `shocked_right` |
| `chin_rest` | 🤔 | `[11,0]` | `thinking` | hand to chin, alternate drawing — thinking | `look_aside` |
| `thumbs_up` | 👍 | `[0,1]` | `success` | thumbs up, neutral face — approval | `thumbs_up_left` |
| `thumbs_up_raise` | 👍 | `[1,1]` | `success` | thumb raised high — anticipation before the thumbs up | `thumbs_up_right` |
| `thumbs_up_wink` | 🎉 | `[2,1]` | `excited` | thumbs up with grin and wink — strong success | `thumbs_up_both` |
| `thumbs_up_grin` | 💪 | `[3,1]` | `success` | thumbs up follow-through, grin and wink — success settle | `thumbs_up_hip` |
| `shrug` | 🤷 | `[4,1]` | `confused` | open-arm shrug, palms up, neutral — unsure | — |
| `shrug_big` | 🤷 | `[5,1]` | `confused` | big shrug, eyebrow up, looking away — "no idea" | `doubt` |
| `hands_on_hips` | 😊 | `[6,1]` | `confident` | both hands on hips, small smile — proud, ready | `point_left` |
| `point_wink` | 😏 | `[7,1]` | `confident` | fist forward with a knowing half-wink — "got it" | `point_right` |
| `talk_closed` | 💬 | `[8,1]` | `processing` | fist forward, mouth closed with right corner up — making a point (lip-sync rest) | `hand_on_hip` |
| `talk_open` | 🗣️ | `[9,1]` | `processing` | fist forward, mouth open — speaking (lip-sync open) | `hand_on_hip_mirror` |
| `talk_grin` | 😁 | `[10,1]` | `presenting` | fist forward, open grin with narrowed eyes — emphatic, amused while talking | — |
| `skeptical` | 🤨 | `[11,1]` | `curious` | fist forward, eyebrow raised, looking up — skeptical "hmm?" | `dynamic_confident` |
| `startled` | 😬 | `[0,2]` | `surprised` | leans back, teeth gritted, glasses flash — startled recoil | — |
| `wince` | 😣 | `[1,2]` | `error` | leans back, eyes squeezed, teeth gritted — wince, "ouch" | `puzzled_back` |
| `sad` | 😔 | `[2,2]` | `sad` | slumped, fists down, frown, glasses glare hide the eyes — dejected | — |
| `sad_intense` | 😢 | `[3,2]` | `error` | slumped, lip quivering — about to cry, hard error | — |
| `worried` | 😟 | `[4,2]` | `worried` | arms crossed, brow furrowed — concerned (subtle) | `worried_chin` |
| `attentive` | 👂 | `[5,2]` | `attention` | hands held at belly, one brow pixel raised — attentive listening | `curious` |
| `point_wink_alt` | 😉 | `[6,2]` | `playful` | fist forward, winking — playful "you got it" | `phone` |
| `wave` | 👋 | `[7,2]` | `greeting` | hand raised by the head — wave / hello | — |
| `collar_tug` | 😅 | `[0,3]` | `worried` | tugging the collar, nervous toothy grin — nervous, sheepish | `talk_left` |
| `talk_ajar` | 💬 | `[1,3]` | `processing` | fist forward, mouth slightly open — speaking (lip-sync mid) | `talk_right` |
| `laugh` | 😂 | `[2,3]` | `laughing` | bent forward holding belly, one eye shut, mouth open — laughing | — |
| `laugh_wide` | 🤣 | `[3,3]` | `laughing` | laughing harder — bounce low | — |
| `laugh_tilt` | 😆 | `[4,3]` | `laughing` | laughing — bounce up | `wink_right` |
| `embarrassed` | 😳 | `[5,3]` | `playful` | collar tug + blush — embarrassed | `wink_left` |
| `blush_clasped` | ☺️ | `[6,3]` | `playful` | hands clasped + blush + smile — flattered, thankful | `tada` |
| `blush_smile` | 😊 | `[7,3]` | `playful` | rest pose + blush + smile — pleased, warm | `tada_left` |
| `blush_shy` | ☺️ | `[8,3]` | `playful` | rest pose + blush + smile, glancing away — shy, flattered | `smug` |
| `blanched` | 🥶 | `[9,3]` | `cold` | collar tug, face drained pale — mortified / chilled | `shiver` |
| `scared` | 😱 | `[10,3]` | `scared` | a spectral skull appears beside him, teeth gritted — fright | — |

## Tool functions

| id | state | bubble |
|---|---|---|
| `search` | `curious` | Searching… |
| `read` | `thinking` | Reading… |
| `write` | `processing` | Writing… |
| `terminal` | `confident` | Running… |
| `memory` | `thinking` | Organizing… |
| `web` | `curious` | Checking… |
| `delegate` | `confident` | Delegating… |
| `clarify` | `confused` | Clarifying… |
| `vision` | `curious` | Looking… |

## `agent.sprite`

A function with a **frame** renders that exact asset; a **tool** maps to its state
sequence. `bubble` overrides the default label (short line only).

```json
{ "type": "agent.sprite", "sprite": "wink_right", "bubble": "😉" }
{ "type": "agent.sprite", "sprite": "4,3" }
{ "type": "agent.sprite", "sprite": "search" }
{ "type": "agent.sprite", "sprite": "😱" }
```

`agent.signal` remains the state-level channel (name or emoji → state sequence).
Use `agent.sprite` when you want a specific pose/asset; use `agent.signal` when a
state is enough.

## Notes

- Function ids and emojis are stable; an emoji that appears on several frames
  resolves to the first one. Use the id or the cell for exact disambiguation.
- Since v3 the automatic state table uses all 43 cells (`npm run sprites:usage`);
  `hands_on_hips` now names the frame that actually shows it (`6,1`), so the old
  `hands_on_hips` request (`10,1`, an open-mouth grin) is the one id whose cell changed.
- `npm run sprites:usage` audits the automatic state table; this manifest is the
  1:1 asset index.
