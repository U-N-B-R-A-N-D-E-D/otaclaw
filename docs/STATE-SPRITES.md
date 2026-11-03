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
   at `frameMs` per frame. `idle` loops four calm poses (the eye blink overlay supplies the life).

## Default table

Frames are `[col,row]` cells of the sheet. Priority: higher interrupts lower.

| State | Meaning | Sequence | Mode | frameMs | minHoldMs | Priority | Returns after |
|-------|---------|----------|------|---------|-----------|----------|---------------|
| idle | nothing happening | [0,0] [3,0] [11,0] [8,0] | loop | 6000 | 0 | 0 | - |
| thinking | run started / digesting a result | [1,0] [4,0] [2,0] [11,0] [4,0] | loop | 2400 | 800 | 3 | work state |
| processing | generating the reply | [6,0] [7,0] [7,1] [6,1] [8,1] [6,2] [10,1] [0,3] [1,3] | loop | 1800 | 800 | 3 | work state |
| tool | using a tool (listening / ready / confident) | [6,2] [8,1] [10,1] | loop | 1800 | 1200 | 4 | work state |
| success | run finished | [0,1] [1,1] [3,1] [2,1] | hold | 350 | 1800 | 7 | 2600 ms |
| error | error | [2,2] [3,2] | hold | 600 | 2500 | 10 | 3500 ms |
| confused | puzzled / unsure | [5,0] [1,2] [5,1] [4,1] | hold | 700 | 1500 | 6 | 3000 ms |
| attention | waiting for the user (input, approval) | [6,2] [0,0] | loop | 1200 | 1500 | 8 | until replaced |
| laughing | | [2,3] [3,3] | hold | 450 | 1800 | 5 | 3000 ms |
| surprised | | [9,0] [10,0] | hold | 400 | 1200 | 5 | 2200 ms |
| curious | | [5,2] [11,0] | hold | 1000 | 1200 | 4 | 3000 ms |
| excited | | [2,1] [3,1] [6,3] [7,3] | hold | 450 | 1500 | 5 | 2800 ms |
| presenting | | [6,3] [7,3] [6,0] [7,0] | hold | 500 | 1200 | 5 | 2200 ms |
| worried | | [0,2] [4,2] | hold | 700 | 1500 | 6 | 3500 ms |
| sad | | [2,2] [3,2] | hold | 700 | 1500 | 5 | 3500 ms |
| scared | | [10,3] [9,0] | hold | 400 | 1500 | 6 | 3000 ms |
| greeting | | [7,2] [0,0] | hold | 800 | 1200 | 2 | 2400 ms |
| confident | hand on hip / ready / smug | [8,1] [9,1] [10,1] [11,1] [8,3] | loop | 1600 | 1200 | 4 | work state |
| playful | winks / laugh | [4,3] [5,3] [2,3] | hold | 500 | 1500 | 5 | 2800 ms |

`tool`, `attention`, `confident` and `playful` are additive states (the engine
accepts them even with an older `config.js`). `5,0` (puzzled) and `5,1` (doubt)
are used by `confused`; `7,1` is used by `processing`. `8,2` is not exported.
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
