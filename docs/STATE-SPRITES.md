# State -> sprite mapping

Every agent state shows one fixed, deterministic frame sequence. Nothing is
picked at random, and state changes are debounced so the face does not flicker.
All frames come from the existing frame catalog (`src/data/frame-catalog.json`);
no new art is involved.

Code: `src/js/core/state-sprite-map.js` (table, signals, `StateCoordinator`) and
`AnimationController.startMapped()` (playback). Tests:
`src/js/core/__tests__/state-sprite-map.test.js`.

> **Where to edit:** `stateSprites.states` / `stateSprites.signalMap` in
> `config/config.js`. `sprites.tagToFrames` and `sprites.tagToSequences` are the
> legacy random pools and are **ignored** while the coherent mapping is enabled.
> Run `npm run sprites:usage` to see which catalog frames the table actually
> uses and which are unused. For a specific asset (1:1), use `agent.sprite`;
> see [SPRITE-FUNCTIONS.md](SPRITE-FUNCTIONS.md).

## How it flows

```
gateway event --eventMap--> state --coherentEventState--> StateCoordinator --> OtaClawEngine.setState --> startMapped(sequence)
gateway signal (name/emoji) --signalMap--> state ----------^
```

1. **Event -> state.** `eventMap` (and `agent.signal`, below) pick a state.
   In coherent mode every `agent.tool.*` event becomes `tool` unless
   `stateSprites.toolCategoryReactions` is true, in which case the category picks
   `curious` / `presenting` / `excited` / `tool` / `processing`;
   `agent.tool.result` returns to `thinking` (the run is not over, so no success flash per tool call),
   and `user.typing` / `user.presence` / `session.start` do not pose the agent.
2. **Priority + debounce.** A state replaces the current one immediately only if it has a higher
   priority, or the current state has been visible for at least its `minHoldMs`. Otherwise it is
   deferred until the hold ends (latest request wins), so rapid event bursts collapse into one transition.
3. **Return.** Transient states (`success`, `error`, ...) return by themselves after `autoReturnMs`:
   to the active work state if the run is still going (e.g. a tool error mid-run), otherwise to `idle`.
   `attention` and the work states stay until something replaces them.
4. **Playback.** `hold` sequences play once and keep the last frame; `loop` sequences cycle
   at `frameMs` per frame (or the entry's own `ms`). `idle` loops four calm poses (the eye blink overlay supplies the life).

## Default table

Frames are `[col,row]` cells of the sheet; `[col,row]·ms` means that frame overrides `frameMs`
(a `[col, row, ms]` entry). What each cell shows: [SPRITE-ANATOMY.md](SPRITE-ANATOMY.md). Priority: higher interrupts lower.

| State | Meaning | Sequence | Mode | frameMs | minHoldMs | Priority | Returns after |
|-------|---------|----------|------|---------|-----------|----------|---------------|
| idle | nothing happening | [0,0] [3,0] [8,0] [5,2]·4000 | loop | 6000 | 0 | 0 | - |
| thinking | run started / digesting a result | [4,0]·2400 [6,0]·1400 [4,0]·1800 [5,0]·900 [7,0]·2400 [9,0]·2000 [10,0]·700 [11,0]·2400 | loop | 2400 | 800 | 3 | work state |
| processing | generating the reply | [1,0] [8,1]·1600 [2,0]·900 [11,1]·1400 [8,1]·1200 [6,1]·2000 | loop | 1800 | 800 | 3 | work state |
| speaking | lip-sync while a reply is spoken | [8,1]·220 [1,3]·160 [9,1]·200 [1,3]·160 [8,1]·260 [9,1]·180 [10,1]·220 [1,3]·160 | loop | 200 | 600 | 3 | until replaced |
| tool | using a tool (proud / ready) | [6,1]·2200 [1,0]·1600 [8,1]·1600 | loop | 1800 | 1200 | 4 | work state |
| success | run finished | [1,1]·300 [0,1]·350 [2,1]·700 [3,1]·900 | hold | 350 | 1800 | 7 | 2600 ms |
| error | error | [1,2]·350 [2,2]·900 [3,2]·1200 | hold | 600 | 2500 | 10 | 3500 ms |
| confused | puzzled / unsure | [4,1]·700 [5,1]·1400 | hold | 700 | 1500 | 6 | 3000 ms |
| attention | waiting for the user (input, approval) | [5,2]·2000 [0,0] | loop | 1200 | 1500 | 8 | until replaced |
| laughing |  | [2,3]·200 [3,3]·240 [4,3]·200 [3,3]·240 [2,3]·200 [4,3]·260 | hold | 220 | 1800 | 5 | 3000 ms |
| surprised |  | [0,2]·700 [0,3]·900 | hold | 400 | 1200 | 5 | 2200 ms |
| curious |  | [5,2]·1000 [11,1]·1600 | hold | 1000 | 1200 | 4 | 3000 ms |
| excited |  | [1,1]·250 [2,1]·500 [3,1]·500 [2,3]·300 [4,3]·400 | hold | 450 | 1500 | 5 | 2800 ms |
| presenting |  | [1,0]·600 [8,1]·500 [1,3]·200 [9,1]·300 [8,1]·600 [6,1]·1200 | hold | 500 | 1200 | 5 | 3600 ms |
| worried |  | [9,0]·600 [4,2]·1200 [0,3]·1200 | hold | 700 | 1500 | 6 | 3500 ms |
| sad |  | [2,2]·1200 [3,2]·1400 | hold | 700 | 1500 | 5 | 3500 ms |
| scared |  | [0,2]·400 [10,3]·1600 | hold | 400 | 1500 | 6 | 3000 ms |
| greeting |  | [7,2]·1200 [7,3]·800 [6,3]·800 | hold | 800 | 1200 | 2 | 3200 ms |
| confident | hands on hips / knowing wink | [6,1]·2000 [8,1]·1600 [7,1]·900 [8,1]·1600 | loop | 1600 | 1200 | 4 | work state |
| playful | wink / blush | [6,2]·700 [5,3]·900 [8,3]·900 [7,3]·1000 | hold | 500 | 1500 | 5 | 4000 ms |
| cold |  | [0,3]·600 [9,3]·1600 | hold | 700 | 1500 | 6 | 3000 ms |

`tool`, `attention`, `speaking`, `confident` and `playful` are additive states (the engine
accepts them even with an older `config.js`).
`npm run sprites:usage` prints the live utilization (currently 43/43 = 100%).

Explicit notification text (`ALERT:`, `Warning:`, `Critical:`, `⚠️`, `🚨`,
`Aviso:`, `Alerta:`) is classified to `surprised` / `worried` / `curious` before the
success fallback, even when it arrives as a normal completion. Ordinary prose
that merely mentions warning or risk is not reclassified.

## Signals (names or emoji): `agent.signal`

Any gateway can describe what the agent is doing with a plain string, without knowing OtaClaw's states:

```json
{ "type": "agent.signal", "signal": "🤔" }
{ "type": "agent.signal", "signal": "needs_input" }
```

The string is looked up in `signalMap` (variation selectors are ignored; a state name also works).
Built-in entries include `🤔 -> thinking`, `🛠 🔍 📊 📁 📝 📄 -> tool`, `👍 🎉 ✅ -> success`,
`😟 -> worried`, `😔 -> sad`, `😕 ❓ -> confused`, `❌ -> error`, `👋 -> greeting`,
`🙋 🔔 needs_input waiting attention -> attention`, `🙂 😌 -> idle`. See `DEFAULT_SIGNAL_MAP`.
Unknown signals are ignored. To follow another app's emoji convention, add its emoji to your own
`signalMap`; no code change or coupling is needed (an optional adapter on the gateway side can also
translate that app's events into `agent.signal`).

## Customizing

In `config/config.js`:

```javascript
stateSprites: {
  enabled: true,                 // false = legacy random pools (previous behaviour)
  toolCategoryReactions: false,  // true = keep per-category tool poses (search/creative/risky...)
  states: {
    tool: { sequence: [[8, 2], [6, 1]], frameMs: 2000, minHoldMs: 1200 },   // merge per state
    waiting: { sequence: [[3, 0]], mode: 'hold', minHoldMs: 1000, priority: 4 },  // add a state
  },
  signalMap: { '🧪': 'tool', 'blocked': 'attention' },
},
```

State fields: `sequence`, `mode` (`hold`|`loop`), `frameMs`, `minHoldMs`, `priority`,
`autoReturnMs` (transient states), `work` (true = the agent is busy). Blinking is
owned by the widget (`app.js` + `sprites.blinkSuppressStates`), not by state specs.
A new state name must also be listed in `states` (for the CSS class and the engine) and mapped from an
event (`eventMap`) or a signal (`signalMap`). Use only cells that exist in the frame catalog; the
repo's tests check this for the defaults.

## Notes and limits

- Direct `engine.setState()` calls (taps, debug, demo) bypass the coordinator and keep the
  engine's `stateDurations` / `stateChaining`. Events coming from the gateway always go through it.
- `stateDurations` / `stateChaining` do not apply to coordinator-managed states; use
  `autoReturnMs` / `minHoldMs` instead.
- The boot/"waiting for connection" animation and the sleep overlay are separate and unchanged.
- The sprite sheet itself is not distributed in this repository (see `NOTICE`); frame coordinates
  are the same ones the catalog already documents.
