/**
 * OtaClaw Core Stability Tests
 *
 * Basic tests to ensure the cemented foundation is solid.
 * Run with: npm test (once configured)
 */

import { jest } from '@jest/globals';
import { TimerManager } from '../timer-manager.js';
import { AnimationController } from '../animation-controller.js';
import { ConfigValidator } from '../config-validator.js';

// Mock minimal config for testing
const mockConfig = {
  // These tests cover the legacy organic-pool path; the coherent mapping has its own suite.
  stateSprites: { enabled: false },
  mode: 'public',
  openclaw: {
    host: 'localhost',
    port: 18789,
    wsPath: '/ws',
  },
  localCluster: {
    nodes: [],
    modelName: 'Qwen3.5-4B',
    showClusterStatus: false,
  },
  behavior: {
    profile: 'default',
    idleTimeout: 30000,
    sleepIdleMs: 180000,
    animations: true,
    touchEnabled: true,
    debug: false,
  },
  states: [
    'idle', 'thinking', 'processing', 'success', 'error',
    'laughing', 'surprised', 'curious', 'confused', 'excited'
  ],
  eventMap: {
    'agent.message.start': 'thinking',
    'agent.message.delta': 'processing',
    'agent.message.complete': 'success',
    'agent.message.error': 'error',
    'agent.tool.call': 'surprised',
    'gateway.idle': 'idle',
    'gateway.error': 'error',
  },
  stateDurations: {
    success: 3000,
    error: 5000,
    laughing: 4000,
    surprised: 2500,
    curious: 3000,
    confused: 3000,
    excited: 2500,
  },
  eventPriority: {
    'agent.message.error': 10,      // Errors interrupt everything
    'agent.message.complete': 9,     // Completion overrides processing
    'agent.message.delta': 8,        // Processing continues
    'agent.message.start': 7,        // Start begins flow
    'agent.tool.call': 6,            // Tools interrupt flow
    'gateway.error': 5,              // Gateway errors
    'gateway.idle': 1,               // Idle has lowest priority
    '*': 0,
  },
  sprites: {
    basePath: 'assets/sprites/',
    sheetFile: 'otaclock-original',
    format: 'png',
    sheetWidth: 567,
    sheetHeight: 278,
    cellWidth: 47,
    cellHeight: 70,
  },
  i18n: {
    thinking: 'Hmmm....',
    processing: 'Processing',
    success: 'Got it!',
    error: 'Oops...',
  },
};

describe('TimerManager', () => {
  let timers;

  beforeEach(() => {
    timers = new TimerManager();
  });

  afterEach(() => {
    timers.clearAll();
  });

  test('should set and clear timeout', () => {
    let called = false;
    timers.setTimeout('test', () => { called = true; }, 10);
    expect(timers.has('test')).toBe(true);

    timers.clear('test');
    expect(timers.has('test')).toBe(false);
  });

  test('should execute timeout callback', (done) => {
    let called = false;
    timers.setTimeout('test', () => {
      called = true;
      expect(called).toBe(true);
      done();
    }, 10);
  });

  test('should replace existing timer with same name', (done) => {
    let firstCalled = false;
    let secondCalled = false;

    timers.setTimeout('test', () => { firstCalled = true; }, 100);
    timers.setTimeout('test', () => { secondCalled = true; }, 10);

    setTimeout(() => {
      expect(firstCalled).toBe(false);
      expect(secondCalled).toBe(true);
      done();
    }, 50);
  });

  test('should clear all timers', () => {
    timers.setTimeout('t1', () => {}, 1000);
    timers.setTimeout('t2', () => {}, 1000);
    timers.setInterval('i1', () => {}, 1000);

    expect(timers.count).toBe(3);

    const cleared = timers.clearAll();
    expect(cleared).toBe(3);
    expect(timers.count).toBe(0);
  });

  test('should handle debounce pattern', (done) => {
    let callCount = 0;

    // Simulate rapid calls
    timers.debounce('save', () => callCount++, 50);
    timers.debounce('save', () => callCount++, 50);
    timers.debounce('save', () => callCount++, 50);

    expect(timers.has('save')).toBe(true);
    expect(callCount).toBe(0);

    // After debounce period, only last one executes
    setTimeout(() => {
      expect(callCount).toBe(1);
      done();
    }, 100);
  });
});

describe('ConfigValidator', () => {
  test('should validate correct config', () => {
    const validator = new ConfigValidator(mockConfig);
    const result = validator.validate();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should validate mode setting', () => {
    const publicConfig = { ...mockConfig, mode: 'public' };
    const localConfig = { ...mockConfig, mode: 'local' };
    const invalidConfig = { ...mockConfig, mode: 'invalid' };

    expect(new ConfigValidator(publicConfig).validate().valid).toBe(true);
    expect(new ConfigValidator(localConfig).validate().valid).toBe(true);

    const invalidResult = new ConfigValidator(invalidConfig).validate();
    expect(invalidResult.warnings.length).toBeGreaterThan(0);
  });

  test('should validate local cluster in local mode', () => {
    const configWithCluster = {
      ...mockConfig,
      mode: 'local',
      localCluster: {
        nodes: ['192.0.2.10', '192.0.2.11'],
        modelName: 'Qwen3.5-4B',
        showClusterStatus: true,
      },
    };

    const validator = new ConfigValidator(configWithCluster);
    const result = validator.validate();

    expect(result.valid).toBe(true);

    const summary = validator.getSummary();
    expect(summary.mode).toBe('local');
    expect(summary.localCluster).toBeDefined();
    expect(summary.localCluster.nodes).toBe(2);
  });

  test('should detect missing gateway section', () => {
    const badConfig = { ...mockConfig, openclaw: undefined, gateway: undefined };
    const validator = new ConfigValidator(badConfig);
    const result = validator.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('gateway'))).toBe(true);
  });

  test('should accept gateway key as preferred alias for openclaw', () => {
    const { openclaw, ...rest } = mockConfig;
    const cfg = { ...rest, gateway: { ...openclaw } };
    const validator = new ConfigValidator(cfg);
    const result = validator.validate();

    expect(result.valid).toBe(true);
    expect(cfg.openclaw).toEqual(openclaw);
    expect(cfg.gateway).toEqual(openclaw);
  });

  test('should detect invalid port', () => {
    const badConfig = {
      ...mockConfig,
      gateway: undefined,
      openclaw: { ...mockConfig.openclaw, port: 99999 }
    };
    const validator = new ConfigValidator(badConfig);
    const result = validator.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('port'))).toBe(true);
  });

  test('should warn about missing critical events', () => {
    const configWithMissingEvents = {
      ...mockConfig,
      eventMap: { 'gateway.idle': 'idle' }
    };
    const validator = new ConfigValidator(configWithMissingEvents);
    const result = validator.validate();

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('agent.message'))).toBe(true);
  });

  test('should provide config summary', () => {
    const validator = new ConfigValidator(mockConfig);
    const summary = validator.getSummary();

    expect(summary.openclaw.host).toBe('localhost');
    expect(summary.openclaw.port).toBe(18789);
    expect(summary.states.count).toBe(10);
    expect(summary.behavior.profile).toBe('default');
  });
});

describe('AnimationController', () => {
  let animator;
  let frameCalls;

  beforeEach(() => {
    frameCalls = [];
    animator = new AnimationController(mockConfig);
    animator.setFrameCallback((col, row, speech) => {
      frameCalls.push({ col, row, speech });
    });
  });

  afterEach(() => {
    animator.destroy();
  });

  test('should set frame directly', (done) => {
    animator.setFrame(1, 2, 'Hello');
    
    // setFrame uses RAF, so wait for next frame
    setTimeout(() => {
      expect(frameCalls.length).toBeGreaterThanOrEqual(1);
      expect(frameCalls[0]).toMatchObject({ col: 1, row: 2, speech: 'Hello' });
      done();
    }, 20);
  });

  test('should analyze text emotions', () => {
    const emotion = animator.analyzeEmotion('hahaha that is funny!');
    expect(emotion).toBe('laughing');
  });

  test('should detect surprised emotion', () => {
    const emotion = animator.analyzeEmotion('wow!! amazing!');
    expect(emotion).toBe('surprised');
  });

  test('should return null for neutral text', () => {
    const emotion = animator.analyzeEmotion('the quick brown fox');
    expect(emotion).toBeNull();
  });

  test('should NOT trigger an emotion override for mundane helpful-assistant phrasing', () => {
    const mundanePhrases = [
      "Here is the result I built for you",
      "That's a great question, let me check",
      "Sure, I can help with that",
      "Great, that works!",
      "What's the weather like today?",
      "I love this feature, excellent work",
      "here you go, done!",
      "jaja ok",
      "haha sure",
    ];
    for (const phrase of mundanePhrases) {
      animator.resetAccumulatedText();
      expect(animator.analyzeEmotion(phrase)).toBeNull();
    }
  });

  test('should still detect strong, unambiguous emotion signals', () => {
    animator.resetAccumulatedText();
    expect(animator.analyzeEmotion("hahaha, that's hilarious!")).toBe('laughing');

    animator.resetAccumulatedText();
    expect(animator.analyzeEmotion('oops, sorry about that, I made a mistake')).toBe('worried');

    animator.resetAccumulatedText();
    expect(animator.analyzeEmotion("what?? I don't understand this at all")).toBe('confused');
  });

  test('should track emotion lock', () => {
    animator.analyzeEmotion('jajaja funny joke 😂');
    expect(animator.getEmotionLock()).toBe('laughing');

    animator.clearEmotionLock();
    expect(animator.getEmotionLock()).toBeNull();
  });

  test('should get current state', () => {
    animator.startIdle();
    expect(animator.getCurrentState()).toBe('idle');

    animator.startThinking(() => 'thinking');
    expect(animator.getCurrentState()).toBe('thinking');
  });

  test('should stop all animations', () => {
    animator.startIdle();
    expect(animator.timers.count).toBeGreaterThan(0);

    animator.stopAll();
    expect(animator.timers.count).toBe(0);
  });

  test('should reset accumulated text', () => {
    animator.analyzeEmotion('first text');
    animator.resetAccumulatedText();
    expect(animator.getEmotionLock()).toBeNull();
  });

  test('should provide search tags for states', () => {
    // Test via internal method - should return array
    const tags = animator._getSearchTagsForState('laughing');
    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toContain('laughing');
    expect(tags).toContain('happy');
  });

  test('idle search tags should not pull in celebration terminals as primaries', () => {
    // Idle life may include greeting/playful tags, but not laugh/ta-da/scared as search anchors
    const tags = animator._getSearchTagsForState('idle');
    expect(tags).not.toContain('laughing');
    expect(tags).not.toContain('scared');
    expect(tags).not.toContain('neutral');
  });

  test('organic idle pool uses life repertoire and excludes pain', () => {
    animator.setCatalog({
      frames: [
        { col: 0, row: 0, primary: 'idle', lane: 'idle', tags: ['idle_base', 'base', 'calm'] },
        { col: 1, row: 0, primary: 'thinking', lane: 'work', tags: ['idle_micro', 'calm', 'contemplative'] },
        { col: 7, row: 2, primary: 'greeting', lane: 'social', tags: ['waving', 'hello'] },
        { col: 4, row: 3, primary: 'playful', lane: 'social', tags: ['wink', 'playful'] },
        { col: 8, row: 1, primary: 'confident', lane: 'work', tags: ['assertive'] },
        { col: 2, row: 3, primary: 'laughing', lane: 'react', tags: ['laughing', 'funny'] },
        { col: 0, row: 2, primary: 'worried', lane: 'react', tags: ['unpleasant', 'worried'] },
        { col: 5, row: 1, primary: 'confused', lane: 'work', tags: ['shrug', 'open', 'uncertain'] },
      ],
    });
    const pool = animator.getOrganicFramePool('idle');
    const keys = pool.map((f) => `${f.col},${f.row}`);
    expect(keys).toContain('0,0');
    expect(keys).toContain('7,2');
    // Organic rest: wave ok, wink looks like laugh — stay out of idle
    expect(keys).not.toContain('4,3');
    expect(keys).not.toContain('1,0');
    expect(keys).not.toContain('8,1');
    expect(keys).not.toContain('2,3');
    expect(keys).not.toContain('0,2');
    expect(keys).not.toContain('5,1');
  });

  test('organic work pool is primary-narrow and category ranks without expanding to wink', () => {
    animator.setCatalog({
      frames: [
        { col: 1, row: 0, primary: 'thinking', lane: 'work', tags: ['contemplative'] },
        { col: 5, row: 0, primary: 'confused', lane: 'work', tags: ['puzzled'] },
        { col: 5, row: 2, primary: 'curious', lane: 'work', tags: ['interested'] },
        { col: 4, row: 3, primary: 'playful', lane: 'social', tags: ['wink', 'playful'] },
        { col: 0, row: 0, primary: 'idle', lane: 'idle', tags: ['idle_base', 'base'] },
      ],
    });
    animator.setContext({ category: 'analytical' });
    const pool = animator.getOrganicFramePool('thinking');
    const keys = pool.map((f) => `${f.col},${f.row}`);
    expect(keys).toContain('1,0');
    expect(keys).not.toContain('4,3');
    expect(keys).not.toContain('0,0');
    expect(keys).not.toContain('5,0');
    expect(pool.length).toBeGreaterThanOrEqual(1);
  });

  test('thinking pool never includes worried/pain frames', () => {
    animator.setCatalog({
      frames: [
        { col: 1, row: 0, primary: 'thinking', lane: 'work', tags: ['contemplative', 'calm'] },
        { col: 11, row: 0, primary: 'thinking', lane: 'work', tags: ['contemplative'] },
        { col: 4, row: 2, primary: 'worried', lane: 'react', tags: ['unpleasant', 'anxious'] },
        { col: 5, row: 0, primary: 'confused', lane: 'work', tags: ['puzzled'] },
      ],
    });
    const pool = animator.getOrganicFramePool('thinking');
    const keys = pool.map((f) => `${f.col},${f.row}`);
    expect(keys).toContain('1,0');
    expect(keys).toContain('11,0');
    expect(keys).not.toContain('4,2');
    expect(keys).not.toContain('5,0');
  });

  test('real catalog v2: thinking uses calm think frames only', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const dir = dirname(fileURLToPath(import.meta.url));
    const catalog = JSON.parse(readFileSync(join(dir, '../../../data/frame-catalog.json'), 'utf8'));
    animator.setCatalog(catalog);
    const pool = animator.getOrganicFramePool('thinking');
    const keys = pool.map((f) => `${f.col},${f.row}`);
    expect(keys.every((k) => ['1,0', '2,0', '11,0', '4,0'].includes(k))).toBe(true);
    expect(keys).not.toContain('4,2');
    expect(keys).not.toContain('0,2');
    expect(keys).not.toContain('5,0');
    expect(keys).not.toContain('5,1');
  });

  test('real catalog: idle never shows doubt-shrug (5,1) or open-arms unsure (4,1)', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const dir = dirname(fileURLToPath(import.meta.url));
    const catalog = JSON.parse(readFileSync(join(dir, '../../../data/frame-catalog.json'), 'utf8'));
    animator.setCatalog(catalog);
    const idle = animator.getOrganicFramePool('idle').map((f) => `${f.col},${f.row}`);
    expect(idle).not.toContain('5,1');
    expect(idle).not.toContain('4,1');
    expect(idle).toContain('0,0');
    const confused = animator.getOrganicFramePool('confused').map((f) => `${f.col},${f.row}`);
    expect(confused).toContain('5,1');
    expect(confused).toContain('4,1');
  });

  test('real catalog: every frame is reachable from at least one state (100% utilization)', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const dir = dirname(fileURLToPath(import.meta.url));
    const catalog = JSON.parse(readFileSync(join(dir, '../../../data/frame-catalog.json'), 'utf8'));
    animator.setCatalog(catalog);
    const states = [
      'idle', 'thinking', 'processing', 'success', 'error', 'laughing',
      'surprised', 'curious', 'confused', 'excited', 'worried', 'sad',
      'scared', 'presenting', 'greeting', 'confident',
    ];
    const reachable = new Set();
    for (const state of states) {
      for (const f of animator.getOrganicFramePool(state)) {
        reachable.add(`${f.col},${f.row}`);
      }
    }
    const missing = catalog.frames
      .map((f) => `${f.col},${f.row}`)
      .filter((id) => !reachable.has(id));
    expect(missing).toEqual([]);
  });

  test('should have a single startThinking implementation that advances phases correctly', () => {
    // Regression test: a duplicate startThinking used to shadow the real one,
    // and that real one compared against `p.minMs` (always undefined) instead
    // of `p.maxMs`, so it never advanced past the first phase.
    animator.startThinking(() => 'thinking');
    expect(animator.getCurrentState()).toBe('thinking');
    // A phase-advancement timer should have been scheduled (not stuck forever
    // on the first phase with no follow-up check).
    expect(animator.timers.has('thinkingPhase')).toBe(true);
  });

  test('startThinking phases should progress thinking -> curious -> deep over time', () => {
    // Regression test: the phase-selection loop used to scan backwards and
    // compare `elapsed >= maxMs`, which (with maxMs: Infinity on the last
    // phase) always resolved to the deep phase immediately, skipping
    // thinking/curious entirely regardless of elapsed time.
    jest.useFakeTimers();
    try {
      const tagPoolCalls = [];
      const deepCalls = [];
      animator._runTagPool = (tag) => tagPoolCalls.push(tag);
      animator._runIndividualSequence = (name) => deepCalls.push(name);

      animator.startThinking(() => 'thinking');
      expect(tagPoolCalls).toEqual(['thinking']);

      jest.advanceTimersByTime(9000); // 9s elapsed -> curious phase (8-10s)
      expect(tagPoolCalls).toEqual(['thinking', 'curious']);

      jest.advanceTimersByTime(2000); // 11s elapsed -> deep thinking phase (~10s+)
      expect(deepCalls).toEqual(['thinkingDeep']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('taxonomy quarantine: pain/fear moods never enter idle/thinking/waiting/processing pools', () => {
    animator.setCatalog({
      frames: [
        { col: 0, row: 0, mood: 'calm', intensity: 'low', context: 'idle', primary: 'idle', lane: 'idle', tags: ['idle_base'] },
        { col: 1, row: 0, mood: 'think', intensity: 'mid', context: 'work', primary: 'thinking', lane: 'work', tags: ['contemplative'] },
        { col: 0, row: 2, mood: 'pain', intensity: 'high', context: 'react', primary: 'sad', lane: 'react', tags: ['error'] },
        { col: 10, row: 3, mood: 'fear', intensity: 'high', context: 'react', primary: 'scared', lane: 'react', tags: ['frightened'] },
        { col: 6, row: 0, mood: 'work', intensity: 'mid', context: 'work', primary: 'explaining', lane: 'work', tags: ['talking'] },
      ],
    });
    for (const state of ['idle', 'thinking', 'waiting', 'processing']) {
      const pool = animator.getOrganicFramePool(state).map((f) => `${f.col},${f.row}`);
      expect(pool).not.toContain('0,2');
      expect(pool).not.toContain('10,3');
    }
  });

  test('anti-repeat window: same frame is not repeated within the configured window', () => {
    animator.setCatalog({
      frames: [
        { col: 0, row: 0, mood: 'calm', intensity: 'low', context: 'idle', primary: 'idle', lane: 'idle', tags: ['idle_base'] },
        { col: 3, row: 0, mood: 'calm', intensity: 'low', context: 'idle', primary: 'idle', lane: 'idle', tags: ['idle_base'] },
        { col: 8, row: 0, mood: 'calm', intensity: 'low', context: 'idle', primary: 'idle', lane: 'idle', tags: ['idle_base'] },
        { col: 7, row: 2, mood: 'social', intensity: 'low', context: 'social', primary: 'greeting', lane: 'social', tags: ['waving'] },
        { col: 4, row: 3, mood: 'social', intensity: 'high', context: 'social', primary: 'playful', lane: 'social', tags: ['wink'] },
        { col: 5, row: 3, mood: 'social', intensity: 'high', context: 'social', primary: 'playful', lane: 'social', tags: ['wink'] },
        { col: 1, row: 0, mood: 'think', intensity: 'mid', context: 'work', primary: 'thinking', lane: 'work', tags: ['contemplative'] },
        { col: 11, row: 0, mood: 'think', intensity: 'mid', context: 'work', primary: 'thinking', lane: 'work', tags: ['contemplative'] },
      ],
    });
    animator.config.sprites.antiRepeatWindow = 5;
    animator.config.sprites.idleSpiceChance = 1.0; // force spice path so all frames are reachable
    const picks = [];
    for (let i = 0; i < 40; i++) {
      const f = animator.pickOrganicFrame('idle');
      picks.push(`${f.col},${f.row}`);
    }
    for (let i = 5; i < picks.length; i++) {
      const window = picks.slice(i - 5, i);
      expect(window).not.toContain(picks[i]);
    }
  });

  test('spice set contains only safe moods (calm or social), never concern/fear/pain', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const dir = dirname(fileURLToPath(import.meta.url));
    const catalog = JSON.parse(readFileSync(join(dir, '../../../data/frame-catalog.json'), 'utf8'));
    animator.setCatalog(catalog);
    animator.config.sprites.idleSpiceChance = 1.0; // force spice path every pick
    const spiceSet = new Set(['4,3', '5,3', '0,3', '1,3']);
    for (let i = 0; i < 30; i++) {
      const f = animator.pickOrganicFrame('idle');
      const key = `${f.col},${f.row}`;
      if (spiceSet.has(key)) {
        const frame = catalog.frames.find((fr) => fr.col === f.col && fr.row === f.row);
        expect(['calm', 'social']).toContain(frame.mood);
        expect(['concern', 'fear', 'pain']).not.toContain(frame.mood);
      }
    }
  });
});

// Integration test

// Integration test
describe('Integration: Core Modules Work Together', () => {
  test('full flow: engine state change → animation controller', (done) => {
    const config = mockConfig;
    const timers = new TimerManager();
    const animator = new AnimationController(config, timers);
    const frameCalls = [];

    animator.setFrameCallback((col, row, speech) => {
      frameCalls.push({ col, row, speech });
    });

    // OtaClawEngine is the live state orchestrator; start thinking and verify the
    // animation controller receives the work state and produces frames.
    animator.startThinking(() => config.i18n.thinking);

    setTimeout(() => {
      expect(animator.getCurrentState()).toBe('thinking');
      expect(frameCalls.length).toBeGreaterThan(0);
      animator.destroy();
      timers.clearAll();
      done();
    }, 50);
  });
});

// Stability stress test
describe('Stability: Stress Tests', () => {
  test('rapid animation start/stop cycles should not crash', () => {
    const timers = new TimerManager();
    const animator = new AnimationController(mockConfig, timers);
    const states = ['thinking', 'processing', 'success', 'idle', 'error', 'laughing'];

    // Rapid fire 100 animation cycles
    for (let i = 0; i < 100; i++) {
      const state = states[i % states.length];
      animator.stopAll();
      if (state === 'idle') animator.startIdle();
      else if (state === 'thinking') animator.startThinking(() => mockConfig.i18n.thinking);
      else if (state === 'processing') animator.startProcessing(mockConfig.i18n.processing);
      else if (state === 'success') animator.startSuccess(mockConfig.i18n.success);
      else if (state === 'error') animator.startError(mockConfig.i18n.error);
      else if (state === 'laughing') animator.startLaughing(mockConfig.i18n.laughing);
    }

    animator.destroy();
    timers.clearAll();
    expect(timers.count).toBe(0);
  });

  test('timer cleanup should be complete', () => {
    const timers = new TimerManager();

    // Create many timers
    for (let i = 0; i < 50; i++) {
      timers.setTimeout(`t${i}`, () => {}, 10000);
    }

    expect(timers.count).toBe(50);

    // Clear all
    const cleared = timers.clearAll();
    expect(cleared).toBe(50);
    expect(timers.count).toBe(0);
  });

  test('config validator handles edge cases', () => {
    const edgeCases = [
      null,
      undefined,
      {},
      { openclaw: null },
      { openclaw: { port: 'not-a-number' } },
      { states: 'not-an-array' },
    ];

    for (const config of edgeCases) {
      const validator = new ConfigValidator(config);
      const result = validator.validate();

      // Should not throw, just return invalid
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

console.log('✅ Stability tests defined. Run with: npm test');
