/**
 * Coherent state -> sprite mapping: table integrity, event/signal resolution,
 * priority + debounce, return to idle, and deterministic playback.
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import {
  DEFAULT_STATE_SPRITES,
  StateCoordinator,
  coherentEventState,
  endsRun,
  getStateSprite,
  getStateTable,
  isMappingEnabled,
  resolveSignal,
} from '../state-sprite-map.js';
import { AnimationController } from '../animation-controller.js';
import { TimerManager } from '../timer-manager.js';

const catalog = JSON.parse(
  readFileSync(new URL('../../../data/frame-catalog.json', import.meta.url), 'utf8'),
);
const catalogKeys = new Set(catalog.frames.map((f) => `${f.col},${f.row}`));

describe('state table', () => {
  test('every state has a non-empty sequence of existing catalog frames', () => {
    for (const [state, def] of Object.entries(DEFAULT_STATE_SPRITES)) {
      expect(def.sequence.length).toBeGreaterThan(0);
      for (const [c, r] of def.sequence) {
        expect({ state, frame: `${c},${r}`, ok: catalogKeys.has(`${c},${r}`) })
          .toEqual({ state, frame: `${c},${r}`, ok: true });
      }
    }
  });

  test('covers the required states', () => {
    for (const s of ['idle', 'thinking', 'tool', 'success', 'error', 'confused', 'attention']) {
      expect(DEFAULT_STATE_SPRITES[s]).toBeDefined();
    }
  });

  test('work states loop, transient states hold and auto-return', () => {
    for (const def of Object.values(DEFAULT_STATE_SPRITES)) {
      if (def.work) expect(def.mode).toBe('loop');
      if (def.autoReturnMs) expect(def.autoReturnMs).toBeGreaterThanOrEqual(def.minHoldMs);
    }
  });

  test('error outranks every other state; idle is lowest', () => {
    const prios = Object.entries(DEFAULT_STATE_SPRITES).map(([s, d]) => [s, d.priority]);
    const max = Math.max(...prios.map(([, p]) => p));
    expect(DEFAULT_STATE_SPRITES.error.priority).toBe(max);
    expect(DEFAULT_STATE_SPRITES.idle.priority).toBe(0);
  });

  test('config overrides merge per state and can add states', () => {
    const cfg = { stateSprites: { states: { tool: { frameMs: 999 }, custom: { sequence: [[0, 0]] } } } };
    const t = getStateTable(cfg);
    expect(t.tool.frameMs).toBe(999);
    expect(t.tool.sequence).toEqual(DEFAULT_STATE_SPRITES.tool.sequence);
    expect(getStateSprite(cfg, 'custom').sequence).toEqual([[0, 0]]);
    expect(getStateSprite(cfg, 'nope')).toBeNull();
  });

  test('enabled by default, disabled explicitly', () => {
    expect(isMappingEnabled({})).toBe(true);
    expect(isMappingEnabled({ stateSprites: { enabled: false } })).toBe(false);
  });
});

describe('event and signal resolution', () => {
  test('all tool events collapse into one state', () => {
    for (const t of ['agent.tool.call', 'agent.tool.search', 'agent.tool.creative', 'agent.tool.risky']) {
      expect(coherentEventState({}, t, 'curious')).toBe('tool');
    }
  });

  test('tool categories can be re-enabled', () => {
    const cfg = { stateSprites: { toolCategoryReactions: true } };
    expect(coherentEventState(cfg, 'agent.tool.search', 'curious')).toBe('curious');
  });

  test('tool.result keeps the run going (no success flash); tool.error is an error', () => {
    expect(coherentEventState({}, 'agent.tool.result', 'success')).toBe('thinking');
    expect(coherentEventState({}, 'agent.tool.error', 'error')).toBe('error');
  });

  test('noisy user/session events do not pose the agent', () => {
    for (const t of ['user.typing', 'user.presence', 'session.start']) {
      expect(coherentEventState({}, t, 'thinking')).toBeNull();
    }
  });

  test('other events pass through the eventMap result', () => {
    expect(coherentEventState({}, 'agent.message.complete', 'success')).toBe('success');
    expect(coherentEventState({}, 'x.unknown', undefined)).toBeNull();
  });

  test('signals: names, emoji (with/without variation selector), custom, unknown', () => {
    expect(resolveSignal({}, '🤔')).toBe('thinking');
    expect(resolveSignal({}, '🛠️')).toBe('tool');
    expect(resolveSignal({}, '🛠')).toBe('tool');
    expect(resolveSignal({}, 'needs_input')).toBe('attention');
    expect(resolveSignal({}, 'confused')).toBe('confused');
    expect(resolveSignal({ stateSprites: { signalMap: { '🧪': 'tool' } } }, '🧪')).toBe('tool');
    expect(resolveSignal({}, '🧪')).toBeNull();
    expect(resolveSignal({}, undefined)).toBeNull();
  });

  test('run-ending triggers', () => {
    expect(endsRun('agent.message.complete')).toBe(true);
    expect(endsRun('agent.tool.call')).toBe(false);
  });
});

describe('StateCoordinator', () => {
  let t;
  let applied;
  let c;
  const advance = (ms) => { t += ms; jest.advanceTimersByTime(ms); };

  beforeEach(() => {
    jest.useFakeTimers();
    t = 1000;
    applied = [];
    c = new StateCoordinator({
      table: getStateTable({}),
      apply: (s, o) => applied.push([s, o.trigger]),
      now: () => t,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h),
    });
  });
  afterEach(() => { c.destroy(); jest.useRealTimers(); });

  const states = () => applied.map((a) => a[0]);

  test('higher priority interrupts immediately; error always wins', () => {
    c.request('thinking', {});
    expect(c.request('tool', {})).toBe('applied');
    expect(c.request('error', {})).toBe('applied');
    expect(states()).toEqual(['thinking', 'tool', 'error']);
  });

  test('equal/lower priority within min hold is deferred, then shown (debounce)', () => {
    c.request('tool', {});                      // hold 1200
    expect(c.request('thinking', {})).toBe('deferred');
    advance(500);
    expect(states()).toEqual(['tool']);
    advance(800);                               // hold elapsed
    expect(states()).toEqual(['tool', 'thinking']);
  });

  test('rapid flapping collapses: latest request wins, one transition', () => {
    c.request('tool', {});
    c.request('thinking', {});
    c.request('processing', {});
    c.request('thinking', { trigger: 'last' });
    advance(1300);
    expect(states()).toEqual(['tool', 'thinking']);
    expect(applied[1][1]).toBe('last');
  });

  test('same state is a no-op and cancels a pending change', () => {
    c.request('tool', {});
    c.request('thinking', {});
    expect(c.request('tool', {})).toBe('noop');
    advance(2000);
    expect(states()).toEqual(['tool']);
  });

  test('after min hold a lower-priority state applies immediately', () => {
    c.request('tool', {});
    advance(1300);
    expect(c.request('thinking', {})).toBe('applied');
  });

  test('success auto-returns to idle when no work is active', () => {
    c.request('success', { endsRun: true });
    advance(DEFAULT_STATE_SPRITES.success.autoReturnMs + 10);
    expect(states()).toEqual(['success', 'idle']);
  });

  test('transient state returns to the active work state, not idle', () => {
    c.request('thinking', {});
    advance(900);
    c.request('confused', {});                  // work still active
    advance(DEFAULT_STATE_SPRITES.confused.autoReturnMs + 10);
    expect(states()).toEqual(['thinking', 'confused', 'thinking']);
  });

  test('a run-ending request clears the work state (error -> idle)', () => {
    c.request('thinking', {});
    advance(900);
    c.request('error', { endsRun: true });
    advance(DEFAULT_STATE_SPRITES.error.autoReturnMs + 10);
    expect(states()).toEqual(['thinking', 'error', 'idle']);
  });

  test('tool error mid-run returns to work (run not ended)', () => {
    c.request('thinking', {});
    advance(900);
    c.request('error', {});
    advance(DEFAULT_STATE_SPRITES.error.autoReturnMs + 10);
    expect(states().slice(-1)).toEqual(['thinking']);
  });

  test('applied transient states are flagged managed; work states are not', () => {
    const flags = [];
    const c2 = new StateCoordinator({
      table: getStateTable({}),
      apply: (s, o) => flags.push([s, o.managed]),
      now: () => t,
    });
    c2.request('thinking', {});
    c2.request('success', {});
    c2.destroy();
    expect(flags).toEqual([['thinking', false], ['success', true]]);
  });

  test('works with the default (global) timers, not only injected ones', () => {
    const seen = [];
    const d = new StateCoordinator({ table: getStateTable({}), apply: (s) => seen.push(s) });
    d.request('success', {});
    jest.advanceTimersByTime(DEFAULT_STATE_SPRITES.success.autoReturnMs + 10);
    expect(seen).toEqual(['success', 'idle']);
    d.destroy();
  });

  test('unknown state is rejected', () => {
    expect(c.request('nope', {})).toBe('unknown');
    expect(applied).toEqual([]);
  });

  test('attention persists until something replaces it (no auto-return)', () => {
    c.request('attention', {});
    advance(60000);
    expect(states()).toEqual(['attention']);
    c.request('thinking', {});
    expect(states()).toEqual(['attention', 'thinking']);
  });

  test('reset resyncs without applying', () => {
    c.request('tool', {});
    c.reset('idle');
    expect(c.current).toBe('idle');
    expect(c.request('thinking', {})).toBe('applied');
  });
});

describe('AnimationController.startMapped (deterministic playback)', () => {
  let a;
  let frames;
  beforeEach(() => {
    jest.useFakeTimers();
    global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    global.cancelAnimationFrame = (h) => clearTimeout(h);
    a = new AnimationController({}, new TimerManager());
    frames = [];
    a.setFrameCallback((c, r, speech) => frames.push([c, r, speech]));
  });
  afterEach(() => { a.destroy(); jest.useRealTimers(); });

  const run = (ms) => jest.advanceTimersByTime(ms);

  test('loop state repeats exactly the table sequence, never random frames', () => {
    const { sequence, frameMs } = DEFAULT_STATE_SPRITES.thinking;
    expect(a.startMapped('thinking', 'hm')).toBe(true);
    run(frameMs * sequence.length * 3 + 10);
    const seen = frames.map(([c, r]) => `${c},${r}`);
    const expected = sequence.map(([c, r]) => `${c},${r}`);
    for (let i = 0; i < seen.length; i++) expect(seen[i]).toBe(expected[i % expected.length]);
    expect(seen.length).toBeGreaterThanOrEqual(expected.length * 3);
  });

  test('speech is applied on the first frame only', () => {
    a.startMapped('thinking', 'hm');
    run(DEFAULT_STATE_SPRITES.thinking.frameMs * 3);
    expect(frames[0][2]).toBe('hm');
    expect(frames.slice(1).every((f) => f[2] === undefined)).toBe(true); // undefined = leave the bubble alone
  });

  test('hold state plays once, keeps the last frame and calls onComplete', () => {
    const done = jest.fn();
    const { sequence, frameMs } = DEFAULT_STATE_SPRITES.success;
    a.startMapped('success', '', { onComplete: done });
    run(frameMs * sequence.length * 5);
    expect(frames.map(([c, r]) => `${c},${r}`)).toEqual(sequence.map(([c, r]) => `${c},${r}`));
    expect(done).toHaveBeenCalledTimes(1);
    expect(a.timers.has('mapped')).toBe(false);
  });

  test('idle is a single held frame with no timers (no random wandering)', () => {
    a.startIdle();
    run(60000);
    expect(frames.map(([c, r]) => `${c},${r}`)).toEqual(['0,0']);
  });

  test('starting another state invalidates the previous sequence', () => {
    a.startMapped('thinking');
    run(100);
    a.startMapped('error');
    const n = frames.length;
    run(60000);
    const tail = frames.slice(n).map(([c, r]) => `${c},${r}`);
    const errSeq = DEFAULT_STATE_SPRITES.error.sequence.map(([c, r]) => `${c},${r}`);
    expect(tail.every((k) => errSeq.includes(k))).toBe(true);
  });

  test('disabled or unknown -> returns false so the legacy path can run', () => {
    const off = new AnimationController({ stateSprites: { enabled: false } }, new TimerManager());
    expect(off.startMapped('thinking')).toBe(false);
    off.destroy();
    expect(a.startMapped('no-such-state')).toBe(false);
  });

  test('legacy start* methods delegate to the mapping', () => {
    a.startError('oops');
    expect(a.getCurrentState()).toBe('error');
    run(5000);
    expect(frames.map(([c, r]) => `${c},${r}`)).toEqual(
      DEFAULT_STATE_SPRITES.error.sequence.map(([c, r]) => `${c},${r}`),
    );
  });
});
