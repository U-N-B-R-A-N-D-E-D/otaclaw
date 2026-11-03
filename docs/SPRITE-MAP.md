# Sprite map and attribution

> Generated tables: `npm run docs:sprite-map` (prose is hand-written).

> Generated from `src/data/sprite-functions.json`, `sprite-catalog.json` and
> `frame-catalog.json`; state sequences live in
> `src/js/core/state-sprite-map.js`.

## 1. Legal attribution (read this first)

**Every sprite** shares the same terms: **non-commercial fan art** derived from
**OtaClock / Metal Gear Solid**. The Hal / Otacon character and sprites are
© **Kojima Productions / Konami**. They are **not** covered by the MIT license,
which applies to the source code only. Do not use them in commercial or paid
products, or in any way that implies endorsement. See `ASSETS.md`, `NOTICE` and
`LICENSE`.

- Original sheet: `otaclock-original.png` (`src/assets/sprites/`).
- Catalog `source`: `"Individual exports from OtaClaw default sprite sheet"`.
- Type: **fan use / non-commercial, third-party character likeness**; attribution
  to Konami/Kojima is required. It is **not** CC0, CC-BY or MIT.

## 2. The frames (functional attribution)

`Primary`/`Lane` come from the frame catalog. `State` is the state in the 1:1
manifest. `Also in` lists other state sequences that use the frame.

<!-- BEGIN GENERATED:frames -->
| Cell | ID | Emoji | Primary | Lane | State | Also in | File | Description |
|---|---|---|---|---|---|---|---|---|
| `0,0` | `idle` | 🙂 | idle | idle | `idle` | attention, greeting, idle | `otacon_sprite.png_0000_Sprite-1.png` | neutral standing, arms at sides — true rest |
| `1,0` | `think_left` | 🤔 | thinking | work | `thinking` | thinking | `otacon_sprite.png_0001_Sprite-2.png` | head left, arm across — mild think (work only, not idle) |
| `2,0` | `think_right` | 🤔 | thinking | work | `thinking` | thinking | `otacon_sprite.png_0002_Sprite-3.png` | head right, arm across — mild think (work only, not idle) |
| `3,0` | `waiting` | ⏳ | idle | idle | `idle` | idle | `otacon_sprite.png_0003_Sprite-4.png` | hands together at waist — calm waiting rest |
| `4,0` | `contemplate` | 🧐 | thinking | work | `thinking` | thinking | `otacon_sprite.png_0004_Sprite-5.png` | hand to chin — contemplative think (not idle rest) |
| `5,0` | `puzzled` | 😕 | confused | work | `confused` | confused | `otacon_sprite.png_0005_Sprite-6.png` | hands near chest, puzzled / unsure |
| `6,0` | `explain_left` | 🗣️ | explaining | work | `processing` | presenting, processing | `otacon_sprite.png_0006_Sprite-7.png` | left arm out — explaining / presenting point |
| `7,0` | `explain_right` | 🗣️ | explaining | work | `processing` | presenting, processing | `otacon_sprite.png_0007_Sprite-8.png` | right arm out — explaining (mirror) |
| `8,0` | `arms_closed` | 🙅 | idle | idle | `idle` | idle | `otacon_sprite.png_0008_Sprite-9.png` | arms crossed / hands in — closed calm waiting |
| `9,0` | `shocked_left` | 😮 | surprised | react | `surprised` | scared, surprised | `otacon_sprite.png_0009_Sprite-10.png` | hand to face — surprised / shocked (L) |
| `10,0` | `shocked_right` | 😮 | surprised | react | `surprised` | surprised | `otacon_sprite.png_0010_Sprite-11.png` | hand to face — surprised / shocked (R) |
| `11,0` | `look_aside` | 👀 | thinking | work | `thinking` | curious, thinking | `otacon_sprite.png_0011_Sprite-12.png` | looking aside, contemplative think |
| `0,1` | `thumbs_up_left` | 👍 | success | react | `success` | success | `otacon_sprite.png_0012_Sprite-1a.png` | thumbs-up left — success |
| `1,1` | `thumbs_up_right` | 👍 | success | react | `success` | success | `otacon_sprite.png_0013_Sprite-2a.png` | thumbs-up right — success |
| `2,1` | `thumbs_up_both` | 🎉 | success | react | `excited` | excited, success | `otacon_sprite.png_0014_Sprite-3a.png` | both thumbs-up — strong success / excited |
| `3,1` | `thumbs_up_hip` | 💪 | success | react | `success` | excited, success | `otacon_sprite.png_0015_Sprite-4a.png` | thumbs-up + hip — success approval |
| `4,1` | `shrug` | 🤷 | confused | work | `confused` | confused | `otacon_sprite.png_0016_Sprite-5a.png` | arms open palms up — unsure shrug (NOT idle) |
| `5,1` | `doubt` | 🤨 | worried | work | `worried` | worried | `otacon_sprite.png_0017_Sprite-6a.png` | shrug open arms + worried face — doubt (NOT idle) |
| `6,1` | `point_left` | 👉 | explaining | work | `processing` | processing | `otacon_sprite.png_0018_Sprite-7a.png` | arm raised pointing — asking / emphasis |
| `7,1` | `point_right` | 👉 | explaining | work | `processing` | processing | `otacon_sprite.png_0019_Sprite-8a.png` | arm raised pointing (mirror) |
| `8,1` | `hand_on_hip` | 🧍 | confident | work | `confident` | confident, tool | `otacon_sprite.png_0020_Sprite-9a.png` | hand on hip — confident |
| `9,1` | `hand_on_hip_mirror` | 🧍 | confident | work | `confident` | confident | `otacon_sprite.png_0021_Sprite-10a.png` | hand on hip (mirror) — confident |
| `10,1` | `hands_on_hips` | 🧍 | confident | work | `confident` | confident, tool | `otacon_sprite.png_0022_Sprite-11a.png` | both hands on hips — ready / confident |
| `11,1` | `dynamic_confident` | 💼 | confident | work | `confident` | confident | `otacon_sprite.png_0023_Sprite-12a.png` | arm out + hip — dynamic confident |
| `0,2` | `worried` | 😟 | worried | react | `worried` | worried | `otacon_sprite.png_0024_Sprite-1b.png` | lean forward grimace — WORRIED (pain face, never thinking) |
| `1,2` | `puzzled_back` | 😕 | confused | work | `confused` | confused | `otacon_sprite.png_0025_Sprite-2b.png` | lean back — puzzled / questioning |
| `2,2` | `sad` | 😔 | sad | react | `sad` | error, sad | `otacon_sprite.png_0026_Sprite-3b.png` | sad, hands clasped — error / disappointment |
| `3,2` | `sad_intense` | 😭 | sad | react | `error` | error, sad | `otacon_sprite.png_0027_Sprite-4b.png` | sad intense — hard error |
| `4,2` | `worried_chin` | 😟 | worried | react | `worried` | worried | `otacon_sprite.png_0028_Sprite-5b.png` | hand near chin, strained — WORRIED (not thinking) |
| `5,2` | `curious` | 🔍 | curious | work | `curious` | curious | `otacon_sprite.png_0029_Sprite-6b.png` | slight lean / interest — curious |
| `6,2` | `phone` | 📞 | talking | work | `attention` | attention, tool | `otacon_sprite.png_0030_Sprite-7b.png` | phone to ear — talking / listening |
| `7,2` | `wave` | 👋 | greeting | social | `greeting` | greeting | `otacon_sprite.png_0031_Sprite-8b.png` | waving — greeting only |
| `0,3` | `talk_left` | 💬 | talking | work | `processing` | processing | `otacon_sprite.png_0036_Layer-1.png` | facing left, arms out — movement filler |
| `1,3` | `talk_right` | 💬 | talking | work | `processing` | processing | `otacon_sprite.png_0037_Layer-2.png` | facing right, arms out — movement filler |
| `2,3` | `laugh` | 😂 | laughing | react | `laughing` | laughing, playful | `otacon_sprite.png_0038_Layer-3.png` | laughing |
| `3,3` | `laugh_wide` | 🤣 | laughing | react | `laughing` | laughing | `otacon_sprite.png_0039_Layer-4.png` | laughing wide |
| `4,3` | `wink_right` | 😉 | playful | social | `playful` | playful | `otacon_sprite.png_0040_Layer-5.png` | wink right — playful social only |
| `5,3` | `wink_left` | 😉 | playful | social | `playful` | playful | `otacon_sprite.png_0041_Layer-6.png` | wink left — playful social only |
| `6,3` | `tada` | 🎉 | presenting | react | `presenting` | excited, presenting | `otacon_sprite.png_0042_Layer-7.png` | ta-da present — success flourish |
| `7,3` | `tada_left` | 🎉 | presenting | react | `presenting` | excited, presenting | `otacon_sprite.png_0043_Layer-8.png` | ta-da left — success flourish |
| `8,3` | `smug` | 😏 | confident | work | `confident` | confident | `otacon_sprite.png_0044_Layer-9.png` | arms crossed smug — confident satisfied |
| `9,3` | `shiver` | 🥶 | worried | react | `cold` | cold | `otacon_sprite.png_0045_Layer-10.png` | shivering cold — uncomfortable |
| `10,3` | `scared` | 😱 | scared | react | `scared` | scared | `otacon_sprite.png_0046_Layer-11.png` | scared + skull prop — fright / panic |
<!-- END GENERATED:frames -->

## 3. Tools (`agent.sprite` tool selector)

<!-- BEGIN GENERATED:tools -->
| Tool | State | Emoji | Bubble | Trigger |
|---|---|---|---|---|
| `search` | `curious` | 🔍 | Searching… | `agent.sprite {sprite:'search'}` / `agent.signal search` |
| `read` | `presenting` | 📄 | Reading… | `agent.sprite {sprite:'read'}` / `agent.signal read` |
| `write` | `processing` | ✍️ | Writing… | `agent.sprite {sprite:'write'}` / `agent.signal write` |
| `terminal` | `confident` | 💻 | Running… | `agent.sprite {sprite:'terminal'}` / `agent.signal terminal` |
| `memory` | `thinking` | 🧠 | Organizing… | `agent.sprite {sprite:'memory'}` / `agent.signal memory` |
| `web` | `curious` | 🌐 | Checking… | `agent.sprite {sprite:'web'}` / `agent.signal web` |
| `delegate` | `confident` | 🤝 | Delegating… | `agent.sprite {sprite:'delegate'}` / `agent.signal delegate` |
| `clarify` | `confused` | ❓ | Clarifying… | `agent.sprite {sprite:'clarify'}` / `agent.signal clarify` |
| `vision` | `surprised` | 👁️ | Looking… | `agent.sprite {sprite:'vision'}` / `agent.signal vision` |
<!-- END GENERATED:tools -->

## 4. States and sequences

| State | Sequence (cells) | Mode | ms | Triggers |
|---|---|---|---|---|
| `idle` | `0,0` `3,0` `11,0` `8,0` | loop | 6000 | gateway.idle/ready, session.end, channel.*, fallback `*`, return after complete; `agent.signal idle|🙂|😌`; tickle. |
| `thinking` | `1,0` `4,0` `2,0` `11,0` `4,0` | loop | 2400 | agent.message.start, tool.analytical, progress.planning, user.presence/typing, session.start; `agent.signal thinking|🤔`; tool `memory` (manifest). |
| `processing` | `6,0` `7,0` `7,1` `6,1` `8,1` `6,2` `10,1` `0,3` `1,3` | loop | 1800 | agent.message.delta, tool.communication, progress.executing; `agent.signal processing`; tool `write` (manifest). |
| `tool` | `6,2` `8,1` `10,1` | loop | 1800 | agent.tool.call (terminal category, category mode), `agent.signal tool|🛠|📊|📁|📝|📄`. (`🔍` goes to `curious` via the manifest.) |
| `success` | `0,1` `1,1` `3,1` `2,1` | hold | 350 | agent.message.complete (no terminal mood), agent.tool.result, stockagent.trade.closed; `agent.signal success|done|👍|✅`. (`🎉` goes to `excited` via the manifest.) |
| `error` | `2,2` `3,2` | hold | 600 | agent.message.error, agent.tool.error, gateway.error, stockagent.alert.critical; `agent.signal error|❌|😭`. |
| `confused` | `5,0` `1,2` `5,1` `4,1` | hold | 700 | `agent.signal confused|😕|❓`; tool `clarify` (manifest); terminal `confused` mood. |
| `attention` | `6,2` `0,0` | loop | 1200 | `agent.signal needs_input|waiting|attention|📞|🙋|🔔`; old `terminal` tool (6,2); work pause. |
| `laughing` | `2,3` `3,3` | hold | 450 | terminal `laughing` mood (`detectEmotion` over the reply); `agent.signal 😄|😂`. |
| `surprised` | `9,0` `10,0` | hold | 400 | agent.tool.call by default; terminal `surprised` mood; tool `vision` (manifest); `agent.signal 😮`. |
| `curious` | `5,2` `11,0` | hold | 1000 | agent.tool.search, progress.validating, search/web category; tools `search|web` (manifest); `agent.signal 🔍|search|web`. |
| `excited` | `2,1` `3,1` `6,3` `7,3` | hold | 450 | agent.tool.creative, stockagent.trade.opened; `agent.signal 🎉|thumbs_up_both`; `agent.sprite` `thumbs_up_both` (2,1). |
| `presenting` | `6,3` `7,3` `6,0` `7,0` | hold | 500 | progress.finalizing; tool `read` (manifest); old files category; `agent.signal read`; `agent.sprite` `tada`/`read`. |
| `worried` | `0,2` `4,2` | hold | 700 | agent.tool.risky, stockagent.alert.warning, terminal `worried` mood; `agent.signal worried|😟|⚠`. |
| `sad` | `2,2` `3,2` | hold | 700 | terminal `sad` mood; `agent.signal sad|😔`; also shares frames with error. |
| `scared` | `10,3` `9,0` | hold | 400 | `agent.sprite` `scared` (10,3) / `agent.signal 😱`; not a terminal mood. |
| `greeting` | `7,2` `0,0` | hold | 800 | `agent.signal greeting|👋`; `agent.sprite` `wave` (7,2). |
| `confident` | `8,1` `9,1` `10,1` `11,1` `8,3` | loop | 1600 | tools `terminal|delegate` (manifest), `agent.signal confident`; working pose. |
| `playful` | `4,3` `5,3` `2,3` | hold | 500 | `agent.signal playful|😉`; `agent.sprite` `wink_right|wink_left` (4,3/5,3). |
| `cold` | `9,3` | hold | 700 | `agent.signal cold|🥶`; `agent.sprite` `shiver` (9,3). |

## 5. Events → state (`config.eventMap`)

<!-- BEGIN GENERATED:events -->
| Event | State |
|---|---|
| `agent.message.start` | `thinking` |
| `agent.message.delta` | `processing` |
| `agent.message.complete` | `success` |
| `agent.message.error` | `error` |
| `agent.tool.call` | `tool` |
| `agent.tool.result` | `thinking` |
| `agent.tool.error` | `error` |
| `agent.tool.search` | `tool` |
| `agent.tool.creative` | `tool` |
| `agent.tool.risky` | `tool` |
| `agent.tool.analytical` | `tool` |
| `agent.tool.communication` | `tool` |
| `agent.tool.neutral` | `tool` |
| `agent.progress.planning` | `thinking` |
| `agent.progress.executing` | `processing` |
| `agent.progress.validating` | `curious` |
| `agent.progress.finalizing` | `presenting` |
| `gateway.idle` | `idle` |
| `gateway.ready` | `idle` |
| `gateway.error` | `error` |
| `user.presence` | `thinking` |
| `user.typing` | `thinking` |
| `session.start` | `thinking` |
| `session.end` | `idle` |
| `channel.connected` | `idle` |
| `channel.disconnected` | `idle` |
| `*` | `idle` |
<!-- END GENERATED:events -->

## 6. `agent.signal` and `agent.sprite`

- `agent.signal {signal}`: a name or emoji → `signalMap` (defaults + manifest).
  Names: idle, thinking, processing, tool, success, done, error, confused,
  needs_input, attention, waiting, confident, playful, cold. Emojis:
  🙂😌🤔🛠🔍📊📁📝📄👍🎉✅😂😄😟😔😕❓❌⚠👋🙋🔔🥶.
- `agent.sprite`: `{sprite}` is a function id (`wink_right`), emoji, cell
  (`"4,3"`) or tool (`search`). With a frame → exact frame; with a tool →
  sequence. Optional `bubble`. Details: `docs/SPRITE-FUNCTIONS.md`.

## 7. Codec portraits (`sprites.codecStateFaces`)

All 24 codec assets (`src/assets/sprites/codec/`) are mapped to states:

| Set | Files | States |
|---|---|---|
| g1 (calm) | `g1-1..5` | idle, greeting, cold |
| g2 (attentive) | `g2-1..5` | thinking, curious, confused |
| g3 (serious) | `g3-1..5` | processing, tool, worried, sad |
| g4 (positive) | `g4-1..5` | success, excited, laughing, presenting, playful, confident |
| shock | `shock-1..3` | error, surprised, scared |
| neutral | `neutral.png` | attention |

The codec screen turns on/off with the CRT collapse (`codec-crt-on` /
`codec-crt-off`), only while entering/leaving codec mode.

## 8. Unused sheet cells

<!-- BEGIN GENERATED:unused -->
The sheet is 12×4 = 48 cells. `src/data/frame-catalog.json` ships **43 frames**; 5 cells are unused: `8,2`, `9,2`, `10,2`, `11,2`, `11,3`.
<!-- END GENERATED:unused -->
