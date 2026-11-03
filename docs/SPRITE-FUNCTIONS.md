# Sprite functions — 1:1 Hal assets

Every bundled Hal asset has a stable **function id**, an **emoji**, its sheet cell
and the state sequence it belongs to. A gateway can select the exact asset with
`agent.sprite` (Vibeconferencing-style), instead of relying on the state heuristics.

Manifest: `src/data/sprite-functions.json` (43 frames). Resolver: `src/js/core/sprite-functions.js`.

## Assets

| id | emoji | cell | state | description |
|---|---|---|---|---|
| `idle` | 🙂 | `[0,0]` | `idle` | neutral standing, arms at sides — true rest |
| `think_left` | 🤔 | `[1,0]` | `thinking` | head left, arm across — mild think (work only, not idle) |
| `think_right` | 🤔 | `[2,0]` | `thinking` | head right, arm across — mild think (work only, not idle) |
| `waiting` | ⏳ | `[3,0]` | `idle` | hands together at waist — calm waiting rest |
| `contemplate` | 🧐 | `[4,0]` | `thinking` | hand to chin — contemplative think (not idle rest) |
| `puzzled` | 😕 | `[5,0]` | `confused` | hands near chest, puzzled / unsure |
| `explain_left` | 🗣️ | `[6,0]` | `processing` | left arm out — explaining / presenting point |
| `explain_right` | 🗣️ | `[7,0]` | `processing` | right arm out — explaining (mirror) |
| `arms_closed` | 🙅 | `[8,0]` | `idle` | arms crossed / hands in — closed calm waiting |
| `shocked_left` | 😮 | `[9,0]` | `surprised` | hand to face — surprised / shocked (L) |
| `shocked_right` | 😮 | `[10,0]` | `surprised` | hand to face — surprised / shocked (R) |
| `look_aside` | 👀 | `[11,0]` | `thinking` | looking aside, contemplative think |
| `thumbs_up_left` | 👍 | `[0,1]` | `success` | thumbs-up left — success |
| `thumbs_up_right` | 👍 | `[1,1]` | `success` | thumbs-up right — success |
| `thumbs_up_both` | 🎉 | `[2,1]` | `excited` | both thumbs-up — strong success / excited |
| `thumbs_up_hip` | 💪 | `[3,1]` | `success` | thumbs-up + hip — success approval |
| `shrug` | 🤷 | `[4,1]` | `confused` | arms open palms up — unsure shrug (NOT idle) |
| `doubt` | 🤨 | `[5,1]` | `worried` | shrug open arms + worried face — doubt (NOT idle) |
| `point_left` | 👉 | `[6,1]` | `processing` | arm raised pointing — asking / emphasis |
| `point_right` | 👉 | `[7,1]` | `processing` | arm raised pointing (mirror) |
| `hand_on_hip` | 🧍 | `[8,1]` | `confident` | hand on hip — confident |
| `hand_on_hip_mirror` | 🧍 | `[9,1]` | `confident` | hand on hip (mirror) — confident |
| `hands_on_hips` | 🧍 | `[10,1]` | `confident` | both hands on hips — ready / confident |
| `dynamic_confident` | 💼 | `[11,1]` | `confident` | arm out + hip — dynamic confident |
| `worried` | 😟 | `[0,2]` | `worried` | lean forward grimace — WORRIED (pain face, never thinking) |
| `puzzled_back` | 😕 | `[1,2]` | `confused` | lean back — puzzled / questioning |
| `sad` | 😔 | `[2,2]` | `sad` | sad, hands clasped — error / disappointment |
| `sad_intense` | 😭 | `[3,2]` | `error` | sad intense — hard error |
| `worried_chin` | 😟 | `[4,2]` | `worried` | hand near chin, strained — WORRIED (not thinking) |
| `curious` | 🔍 | `[5,2]` | `curious` | slight lean / interest — curious |
| `phone` | 📞 | `[6,2]` | `attention` | phone to ear — talking / listening |
| `wave` | 👋 | `[7,2]` | `greeting` | waving — greeting only |
| `point_forward` | 👉 | `[8,2]` | `presenting` | pointing forward — emphasis |
| `talk_left` | 💬 | `[0,3]` | `processing` | facing left, arms out — movement filler |
| `talk_right` | 💬 | `[1,3]` | `processing` | facing right, arms out — movement filler |
| `laugh` | 😂 | `[2,3]` | `laughing` | laughing |
| `laugh_wide` | 🤣 | `[3,3]` | `laughing` | laughing wide |
| `wink_right` | 😉 | `[4,3]` | `playful` | wink right — playful social only |
| `wink_left` | 😉 | `[5,3]` | `playful` | wink left — playful social only |
| `tada` | 🎉 | `[6,3]` | `presenting` | ta-da present — success flourish |
| `tada_left` | 🎉 | `[7,3]` | `presenting` | ta-da left — success flourish |
| `smug` | 😏 | `[8,3]` | `confident` | arms crossed smug — confident satisfied |
| `shiver` | 🥶 | `[9,3]` | `cold` | shivering cold — uncomfortable |
| `scared` | 😱 | `[10,3]` | `scared` | scared + skull prop — fright / panic |

## Tool functions

| id | state | bubble |
|---|---|---|
| `search` | `curious` | Searching… |
| `read` | `presenting` | Reading… |
| `write` | `processing` | Writing… |
| `terminal` | `confident` | Running… |
| `memory` | `thinking` | Organizing… |
| `web` | `curious` | Checking… |
| `delegate` | `confident` | Delegating… |
| `clarify` | `confused` | Clarifying… |
| `vision` | `surprised` | Looking… |

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
- Cells `5,0`, `5,1`, `8,2`, `9,3` are selectable here even though the automatic
  state table avoids them (they read as puzzled/doubt/pointing/cold).
- `npm run sprites:usage` audits the automatic state table; this manifest is the
  1:1 asset index.
