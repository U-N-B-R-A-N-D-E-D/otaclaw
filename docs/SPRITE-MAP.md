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
| `0,0` | `idle` | 🙂 | idle | idle | `idle` | idle | `otacon_sprite.png_0000_Sprite-1.png` | standing, one hand on hip, other arm down, neutral face — true rest |
| `1,0` | `point_ready` | 👉 | explaining | work | `processing` | processing | `otacon_sprite.png_0001_Sprite-2.png` | fist forward, neutral — about to make a point |
| `2,0` | `point_stern` | 😤 | explaining | work | `processing` | processing | `otacon_sprite.png_0002_Sprite-3.png` | fist forward, frowning — objecting, stern |
| `3,0` | `waiting` | ⏳ | idle | idle | `idle` | idle | `otacon_sprite.png_0003_Sprite-4.png` | arms folded over belly, head turned aside — calm waiting |
| `4,0` | `contemplate` | 🧐 | thinking | work | `thinking` | thinking | `otacon_sprite.png_0004_Sprite-5.png` | arm across, hand to chin — thinking |
| `5,0` | `think_squint` | 🤔 | thinking | work | `thinking` | thinking | `otacon_sprite.png_0005_Sprite-6.png` | hand to chin, eyes narrowed — concentrating (also the blink frame of 4,0) |
| `6,0` | `think_glance` | 👀 | thinking | work | `thinking` | thinking | `otacon_sprite.png_0006_Sprite-7.png` | hand to chin, glancing aside — pondering, reading |
| `7,0` | `contemplate_alt` | 🧐 | thinking | work | `thinking` | thinking | `otacon_sprite.png_0007_Sprite-8.png` | hand to chin, alternate drawing — thinking |
| `8,0` | `hands_clasped` | 🙂 | idle | idle | `idle` | idle | `otacon_sprite.png_0008_Sprite-9.png` | hands clasped in front, neutral — polite waiting |
| `9,0` | `arms_crossed` | 🤔 | thinking | work | `thinking` | thinking | `otacon_sprite.png_0009_Sprite-10.png` | arms crossed, hand at chin, neutral — weighing it up |
| `10,0` | `arms_crossed_squint` | 😑 | thinking | work | `thinking` | thinking | `otacon_sprite.png_0010_Sprite-11.png` | arms crossed, eyes narrowed — skeptical focus (also the blink frame of 9,0) |
| `11,0` | `chin_rest` | 🤔 | thinking | work | `thinking` | thinking | `otacon_sprite.png_0011_Sprite-12.png` | hand to chin, alternate drawing — thinking |
| `0,1` | `thumbs_up` | 👍 | success | react | `success` | success | `otacon_sprite.png_0012_Sprite-1a.png` | thumbs up, neutral face — approval |
| `1,1` | `thumbs_up_raise` | 👍 | success | react | `success` | success | `otacon_sprite.png_0013_Sprite-2a.png` | thumb raised high — anticipation before the thumbs up |
| `2,1` | `thumbs_up_wink` | 🎉 | success | react | `excited` | excited | `otacon_sprite.png_0014_Sprite-3a.png` | thumbs up with grin and wink — strong success |
| `3,1` | `thumbs_up_grin` | 💪 | success | react | `success` | success | `otacon_sprite.png_0015_Sprite-4a.png` | thumbs up follow-through, grin and wink — success settle |
| `4,1` | `shrug` | 🤷 | confused | work | `confused` | confused | `otacon_sprite.png_0016_Sprite-5a.png` | open-arm shrug, palms up, neutral — unsure |
| `5,1` | `shrug_big` | 🤷 | confused | work | `confused` | confused | `otacon_sprite.png_0017_Sprite-6a.png` | big shrug, eyebrow up, looking away — "no idea" |
| `6,1` | `hands_on_hips` | 😊 | confident | work | `confident` | confident | `otacon_sprite.png_0018_Sprite-7a.png` | both hands on hips, small smile — proud, ready |
| `7,1` | `point_wink` | 😏 | confident | work | `confident` | confident | `otacon_sprite.png_0019_Sprite-8a.png` | fist forward with a knowing half-wink — "got it" |
| `8,1` | `talk_closed` | 💬 | talking | work | `processing` | processing | `otacon_sprite.png_0020_Sprite-9a.png` | fist forward, mouth closed with right corner up — making a point (lip-sync rest) |
| `9,1` | `talk_open` | 🗣️ | talking | work | `processing` | processing | `otacon_sprite.png_0021_Sprite-10a.png` | fist forward, mouth open — speaking (lip-sync open) |
| `10,1` | `talk_grin` | 😁 | explaining | work | `presenting` | presenting | `otacon_sprite.png_0022_Sprite-11a.png` | fist forward, open grin with narrowed eyes — emphatic, amused while talking |
| `11,1` | `skeptical` | 🤨 | curious | work | `curious` | curious | `otacon_sprite.png_0023_Sprite-12a.png` | fist forward, eyebrow raised, looking up — skeptical "hmm?" |
| `0,2` | `startled` | 😬 | surprised | react | `surprised` | surprised | `otacon_sprite.png_0024_Sprite-1b.png` | leans back, teeth gritted, glasses flash — startled recoil |
| `1,2` | `wince` | 😣 | worried | react | `error` | error | `otacon_sprite.png_0025_Sprite-2b.png` | leans back, eyes squeezed, teeth gritted — wince, "ouch" |
| `2,2` | `sad` | 😔 | sad | react | `sad` | sad | `otacon_sprite.png_0026_Sprite-3b.png` | slumped, fists down, frown, glasses glare hide the eyes — dejected |
| `3,2` | `sad_intense` | 😢 | sad | react | `error` | error | `otacon_sprite.png_0027_Sprite-4b.png` | slumped, lip quivering — about to cry, hard error |
| `4,2` | `worried` | 😟 | worried | work | `worried` | worried | `otacon_sprite.png_0028_Sprite-5b.png` | arms crossed, brow furrowed — concerned (subtle) |
| `5,2` | `attentive` | 👂 | curious | work | `attention` | attention | `otacon_sprite.png_0029_Sprite-6b.png` | hands held at belly, one brow pixel raised — attentive listening |
| `6,2` | `point_wink_alt` | 😉 | playful | social | `playful` | playful | `otacon_sprite.png_0030_Sprite-7b.png` | fist forward, winking — playful "you got it" |
| `7,2` | `wave` | 👋 | greeting | social | `greeting` | greeting | `otacon_sprite.png_0031_Sprite-8b.png` | hand raised by the head — wave / hello |
| `0,3` | `collar_tug` | 😅 | worried | react | `worried` | worried | `otacon_sprite.png_0036_Layer-1.png` | tugging the collar, nervous toothy grin — nervous, sheepish |
| `1,3` | `talk_ajar` | 💬 | talking | work | `processing` | processing | `otacon_sprite.png_0037_Layer-2.png` | fist forward, mouth slightly open — speaking (lip-sync mid) |
| `2,3` | `laugh` | 😂 | laughing | react | `laughing` | laughing | `otacon_sprite.png_0038_Layer-3.png` | bent forward holding belly, one eye shut, mouth open — laughing |
| `3,3` | `laugh_wide` | 🤣 | laughing | react | `laughing` | laughing | `otacon_sprite.png_0039_Layer-4.png` | laughing harder — bounce low |
| `4,3` | `laugh_tilt` | 😆 | laughing | react | `laughing` | laughing | `otacon_sprite.png_0040_Layer-5.png` | laughing — bounce up |
| `5,3` | `embarrassed` | 😳 | playful | social | `playful` | playful | `otacon_sprite.png_0041_Layer-6.png` | collar tug + blush — embarrassed |
| `6,3` | `blush_clasped` | ☺️ | playful | social | `playful` | playful | `otacon_sprite.png_0042_Layer-7.png` | hands clasped + blush + smile — flattered, thankful |
| `7,3` | `blush_smile` | 😊 | playful | social | `playful` | playful | `otacon_sprite.png_0043_Layer-8.png` | rest pose + blush + smile — pleased, warm |
| `8,3` | `blush_shy` | ☺️ | playful | social | `playful` | playful | `otacon_sprite.png_0044_Layer-9.png` | rest pose + blush + smile, glancing away — shy, flattered |
| `9,3` | `blanched` | 🥶 | scared | react | `cold` | cold | `otacon_sprite.png_0045_Layer-10.png` | collar tug, face drained pale — mortified / chilled |
| `10,3` | `scared` | 😱 | scared | react | `scared` | scared | `otacon_sprite.png_0046_Layer-11.png` | a spectral skull appears beside him, teeth gritted — fright |
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
