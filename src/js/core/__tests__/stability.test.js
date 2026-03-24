/**
 * OtaClaw Core Stability Tests
 *
 * Basic tests to ensure the cemented foundation is solid.
 * Run with: npm test (once configured)
 */

import { TimerManager } from '../timer-manager.js';
import { AnimationController } from '../animation-controller.js';
import { ConfigValidator } from '../config-validator.js';
import { StateMachine } from '../state-machine.js';

// Mock minimal config for testing
const mockConfig = {
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
        nodes: ['192.168.1.10', '192.168.1.11'],
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

  test('should detect missing openclaw section', () => {
    const badConfig = { ...mockConfig, openclaw: undefined };
    const validator = new ConfigValidator(badConfig);
    const result = validator.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('openclaw'))).toBe(true);
  });

  test('should detect invalid port', () => {
    const badConfig = {
      ...mockConfig,
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

describe('StateMachine', () => {
  let sm;
  let stateChanges;

  beforeEach(() => {
    stateChanges = [];
    sm = new StateMachine(mockConfig, {
      onStateChange: (from, to, ctx) => {
        stateChanges.push({ from, to, trigger: ctx.trigger });
      },
    });
  });

  afterEach(() => {
    sm.destroy();
  });

  test('should start in idle state', () => {
    expect(sm.getState()).toBe('idle');
  });

  test('should transition between states', () => {
    sm.transition('thinking', { trigger: 'test' });
    expect(sm.getState()).toBe('thinking');
    expect(sm.getPreviousState()).toBe('idle');
  });

  test('should not transition to invalid state', () => {
    const result = sm.transition('invalid-state', { trigger: 'test' });
    expect(result).toBe(false);
    expect(sm.getState()).toBe('idle');
  });

  test('should skip duplicate state transitions', () => {
    sm.transition('thinking', { trigger: 'test' });
    const result = sm.transition('thinking', { trigger: 'test2' });
    expect(result).toBe(false);
  });

  test('should force transition to same state', () => {
    sm.transition('thinking', { trigger: 'test' });
    const result = sm.transition('thinking', { trigger: 'test2', force: true });
    expect(result).toBe(true);
  });

  test('should handle tap when idle', () => {
    const result = sm.onTap();
    expect(result).toBe(true);
    expect(sm.getState()).toBe('thinking');
  });

  test('should not handle tap when not idle', () => {
    sm.transition('thinking', { trigger: 'test' });
    const result = sm.onTap();
    expect(result).toBe(false);
  });

  test('should handle tickle', () => {
    const result = sm.onTickle({ x: 100, y: 100 });
    expect(result).toBe(true);
    expect(sm.getState()).toBe('laughing');
  });

  test('should map events to states', () => {
    sm.handleEvent('agent.message.start', {});
    expect(sm.getState()).toBe('thinking');

    sm.handleEvent('agent.message.complete', {});
    expect(sm.getState()).toBe('success');
  });

  test('should respect event priority', () => {
    // Setup: thinking is active (from agent.message.start)
    sm.transition('thinking', { trigger: 'agent.message.start' });

    // gateway.idle has low priority, should not override
    const result = sm.handleEvent('gateway.idle', {});
    expect(result).toBe(false);
    expect(sm.getState()).toBe('thinking');
  });

  test('should maintain state history', () => {
    sm.transition('thinking', { trigger: 't1' });
    sm.transition('processing', { trigger: 't2' });
    sm.transition('success', { trigger: 't3' });

    const history = sm.getHistory(3);
    expect(history).toHaveLength(3);
    expect(history[0].state).toBe('success');
    expect(history[1].state).toBe('processing');
    expect(history[2].state).toBe('thinking');
  });

  test('should get event priority', () => {
    const priority = sm.getEventPriority('agent.message.error');
    expect(typeof priority).toBe('number');
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
    const emotion = animator.analyzeEmotion('haha that is funny!');
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

  test('should track emotion lock', () => {
    animator.analyzeEmotion('haha funny joke');
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
});

// Integration test
describe('Integration: Core Modules Work Together', () => {
  test('full flow: event → state change → animation', (done) => {
    const config = mockConfig;
    const timers = new TimerManager();
    const animator = new AnimationController(config, timers);
    const frameCalls = [];

    animator.setFrameCallback((col, row, speech) => {
      frameCalls.push({ col, row, speech });
    });

    const sm = new StateMachine(config, {
      onStateChange: (from, to, ctx) => {
        // Verify state changed
        expect(to).toBe('thinking');

        // Verify animation started
        setTimeout(() => {
          expect(animator.getCurrentState()).toBe('thinking');
          expect(frameCalls.length).toBeGreaterThan(0);

          // Cleanup
          sm.destroy();
          animator.destroy();
          timers.clearAll();
          done();
        }, 50);
      },
      onAnimationStart: (state, speech) => {
        if (state === 'thinking') {
          animator.startThinking(() => speech);
        }
      },
    });

    // Trigger the flow
    sm.handleEvent('agent.message.start', {});
  });
});

// Stability stress test
describe('Stability: Stress Tests', () => {
  test('rapid state transitions should not crash', () => {
    const sm = new StateMachine(mockConfig, {
      onStateChange: () => {},
      onAnimationStart: () => {},
    });

    const states = ['thinking', 'processing', 'success', 'idle', 'error', 'laughing'];

    // Rapid fire 100 state changes
    for (let i = 0; i < 100; i++) {
      const state = states[i % states.length];
      sm.transition(state, { trigger: 'stress-test', force: true });
    }

    expect(sm.getHistory().length).toBeLessThanOrEqual(50); // Max history
    sm.destroy();
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
