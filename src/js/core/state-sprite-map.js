/**
 * State -> sprite mapping and state coordination (pure logic, no DOM).
 *
 * Goals
 * - Every agent state maps to ONE fixed, deterministic frame sequence
 *   (no random picks, so the avatar never "wanders" between unrelated poses).
 * - Transitions are debounced: a state is shown for a minimum time and
 *   higher-priority states may interrupt it; everything else waits its turn.
 * - Transient states (success, error, ...) return to the active work state
 *   (or idle) on their own.
 * - Any gateway can drive it: events go through `eventMap`, free-form
 *   signals (names or emoji) go through `signalMap`.
 *
 * Every frame used here is a cell of the existing frame catalog
 * (`src/data/frame-catalog.json`); no new art is introduced.
 *
 * Override from config: `stateSprites: { enabled, states: {<state>: {...}}, signalMap: {...} }`
 * See docs/STATE-SPRITES.md.
 */

/**
 * Per-state definition.
 *  sequence    [[col,row], ...] frames from the catalog
 *  mode        'hold'  play once, keep the last frame
 *              'loop'  cycle forever (work states)
 *  frameMs     time per frame
 *  minHoldMs   minimum on-screen time before an equal/lower priority state may replace it
 *  priority    higher interrupts lower immediately
 *  autoReturnMs  (transient states) go back to the work state / idle after this long
 *  work        true for states that mean "the agent is busy"
 */
export const DEFAULT_STATE_SPRITES = {
  idle:       { sequence: [[0, 0]], mode: 'hold', frameMs: 1000, minHoldMs: 0, priority: 0 },
  thinking:   { sequence: [[1, 0], [4, 0], [2, 0], [4, 0]], mode: 'loop', frameMs: 2400, minHoldMs: 800, priority: 3, work: true },
  processing: { sequence: [[6, 0], [7, 0]], mode: 'loop', frameMs: 1800, minHoldMs: 800, priority: 3, work: true },
  tool:       { sequence: [[8, 2], [6, 1]], mode: 'loop', frameMs: 1800, minHoldMs: 1200, priority: 4, work: true },
  success:    { sequence: [[0, 1], [1, 1], [2, 1]], mode: 'hold', frameMs: 350, minHoldMs: 1800, priority: 7, autoReturnMs: 2600 },
  error:      { sequence: [[2, 2], [3, 2]], mode: 'hold', frameMs: 600, minHoldMs: 2500, priority: 10, autoReturnMs: 3500 },
  confused:   { sequence: [[5, 0], [1, 2]], mode: 'hold', frameMs: 700, minHoldMs: 1500, priority: 6, autoReturnMs: 3000 },
  attention:  { sequence: [[7, 2], [0, 0]], mode: 'loop', frameMs: 1200, minHoldMs: 1500, priority: 8 },
  laughing:   { sequence: [[2, 3], [3, 3]], mode: 'hold', frameMs: 450, minHoldMs: 1800, priority: 5, autoReturnMs: 3000 },
  surprised:  { sequence: [[9, 0], [10, 0]], mode: 'hold', frameMs: 400, minHoldMs: 1200, priority: 5, autoReturnMs: 2200 },
  curious:    { sequence: [[5, 2]], mode: 'hold', frameMs: 1000, minHoldMs: 1200, priority: 4, autoReturnMs: 3000 },
  excited:    { sequence: [[2, 1], [6, 3], [7, 3]], mode: 'hold', frameMs: 450, minHoldMs: 1500, priority: 5, autoReturnMs: 2800 },
  presenting: { sequence: [[6, 3], [7, 3]], mode: 'hold', frameMs: 500, minHoldMs: 1200, priority: 5, autoReturnMs: 2200 },
  worried:    { sequence: [[0, 2], [4, 2]], mode: 'hold', frameMs: 700, minHoldMs: 1500, priority: 6, autoReturnMs: 3500 },
  sad:        { sequence: [[2, 2], [3, 2]], mode: 'hold', frameMs: 700, minHoldMs: 1500, priority: 5, autoReturnMs: 3500 },
  scared:     { sequence: [[10, 3], [9, 0]], mode: 'hold', frameMs: 400, minHoldMs: 1500, priority: 6, autoReturnMs: 3000 },
  greeting:   { sequence: [[7, 2], [0, 0]], mode: 'hold', frameMs: 800, minHoldMs: 1200, priority: 2, autoReturnMs: 2400 },
};

/**
 * Free-form signals -> state. Keys are plain strings (names or emoji), so any
 * gateway can emit `{ type: 'agent.signal', signal: '🤔' }` or
 * `{ type: 'agent.signal', signal: 'needs_input' }`.
 * Extend or replace via `stateSprites.signalMap`.
 */
export const DEFAULT_SIGNAL_MAP = {
  // names
  idle: 'idle', thinking: 'thinking', processing: 'processing', tool: 'tool',
  success: 'success', done: 'success', error: 'error', confused: 'confused',
  needs_input: 'attention', attention: 'attention', waiting: 'attention',
  // emoji
  '🙂': 'idle', '😌': 'idle',
  '🤔': 'thinking',
  '🛠': 'tool', '🔍': 'tool', '📊': 'tool', '📁': 'tool', '📝': 'tool', '📄': 'tool',
  '👍': 'success', '🎉': 'success', '✅': 'success',
  '😄': 'laughing', '😂': 'laughing',
  '😟': 'worried', '😔': 'sad', '😕': 'confused', '❓': 'confused',
  '❌': 'error', '⚠': 'worried',
  '👋': 'greeting', '🙋': 'attention', '🔔': 'attention',
};

const VS16 = /[︎️]/g;

export function isMappingEnabled(config) {
  return config?.stateSprites?.enabled !== false;
}

/** Merged state table (defaults + `config.stateSprites.states` overrides). */
export function getStateTable(config) {
  const over = config?.stateSprites?.states || {};
  const table = {};
  for (const [name, def] of Object.entries(DEFAULT_STATE_SPRITES)) {
    table[name] = { ...def, ...(over[name] || {}) };
  }
  for (const [name, def] of Object.entries(over)) {
    if (!table[name]) table[name] = { mode: 'hold', frameMs: 600, minHoldMs: 1000, priority: 4, ...def };
  }
  return table;
}

export function getStateSprite(config, state) {
  const def = getStateTable(config)[state];
  if (!def || !Array.isArray(def.sequence) || def.sequence.length === 0) return null;
  return def;
}

/** Resolve a gateway signal (name or emoji) to a state, or null if unknown. */
export function resolveSignal(config, signal) {
  if (typeof signal !== 'string' || !signal) return null;
  const map = { ...DEFAULT_SIGNAL_MAP, ...(config?.stateSprites?.signalMap || {}) };
  const key = signal.replace(VS16, '').trim();
  const known = getStateTable(config);
  return map[key] ?? map[key.toLowerCase()] ?? (known[key.toLowerCase()] ? key.toLowerCase() : null);
}

const RUN_END_TRIGGERS = new Set([
  'agent.message.complete', 'agent.message.error', 'gateway.idle',
  'gateway.error', 'session.end', 'agent.complete', 'agent.error',
]);

/**
 * Coherent event -> state resolution. `mappedState` is what `eventMap` said.
 * Returns the state to request, or null to ignore the event.
 *  - every tool event (call or category) is ONE state ("tool"), unless
 *    `stateSprites.toolCategoryReactions` is true;
 *  - tool.result goes back to "thinking" (the run is not finished; a
 *    "success" flash per tool call is what made the avatar flicker);
 *  - user.typing / user.presence / session.start do not pose the agent.
 */
export function coherentEventState(config, trigger, mappedState) {
  if (typeof trigger !== 'string') return mappedState ?? null;
  if (trigger === 'agent.signal') return mappedState ?? null;
  const categories = config?.stateSprites?.toolCategoryReactions === true;
  if (trigger === 'agent.tool.result') return 'thinking';
  if (trigger === 'agent.tool.error') return 'error';
  if (trigger.startsWith('agent.tool.') && !categories) return 'tool';
  if (trigger === 'user.typing' || trigger === 'user.presence' || trigger === 'session.start') return null;
  return mappedState ?? null;
}

export function endsRun(trigger) {
  return RUN_END_TRIGGERS.has(trigger);
}

/**
 * Debounced, priority-aware state scheduler.
 *
 * request(state, {trigger, endsRun, force, ...}) -> 'applied' | 'deferred' | 'noop' | 'unknown'
 * `apply(state, opts)` is invoked when a state actually becomes visible.
 */
export class StateCoordinator {
  constructor({ table, apply, now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h) } = {}) {
    this.table = table || DEFAULT_STATE_SPRITES;
    this.apply = apply || (() => {});
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.current = 'idle';
    this.enteredAt = -Infinity;
    this.workState = null;
    this.pending = null;
    this._pendingTimer = null;
    this._returnTimer = null;
  }

  _prio(state) { return this.table[state]?.priority ?? 0; }
  _hold(state) { return this.table[state]?.minHoldMs ?? 0; }

  request(state, opts = {}) {
    const def = this.table[state];
    if (!def) return 'unknown';

    if (opts.endsRun) this.workState = null;
    else if (def.work) this.workState = state;

    if (state === this.current && !opts.force) {
      this._cancelPending();
      return 'noop';
    }

    const elapsed = this.now() - this.enteredAt;
    const interrupts =
      opts.force ||
      def.priority > this._prio(this.current) ||
      elapsed >= this._hold(this.current);

    if (interrupts) {
      this._enter(state, opts);
      return 'applied';
    }

    // Debounce: show it after the current state's minimum hold. Latest wins.
    this.pending = { state, opts };
    this._cancelPendingTimer();
    this._pendingTimer = this.setTimer(() => {
      this._pendingTimer = null;
      const p = this.pending;
      this.pending = null;
      if (p && p.state !== this.current) this._enter(p.state, p.opts);
    }, Math.max(0, this._hold(this.current) - elapsed));
    return 'deferred';
  }

  /** State to settle on when a transient state ends. */
  baseState() {
    return this.workState || 'idle';
  }

  _enter(state, opts) {
    this._cancelPending();
    this._cancelReturn();
    this.current = state;
    this.enteredAt = this.now();
    const def = this.table[state];
    const managed = def.autoReturnMs > 0;
    this.apply(state, { ...opts, managed, force: opts.force || state === 'error' });
    if (managed) {
      this._returnTimer = this.setTimer(() => {
        this._returnTimer = null;
        if (this.current === state) this.request(this.baseState(), { trigger: 'auto.return' });
      }, def.autoReturnMs);
    }
  }

  _cancelPendingTimer() {
    if (this._pendingTimer) { this.clearTimer(this._pendingTimer); this._pendingTimer = null; }
  }
  _cancelPending() { this._cancelPendingTimer(); this.pending = null; }
  _cancelReturn() {
    if (this._returnTimer) { this.clearTimer(this._returnTimer); this._returnTimer = null; }
  }

  /** Sync after something else changed the visible state (e.g. watchdog). */
  reset(state = 'idle') {
    this._cancelPending();
    this._cancelReturn();
    this.current = state;
    this.enteredAt = this.now();
    this.workState = null;
  }

  destroy() {
    this._cancelPending();
    this._cancelReturn();
  }
}
