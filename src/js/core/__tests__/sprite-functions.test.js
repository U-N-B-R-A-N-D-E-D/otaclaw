import { findSpriteFunction, findToolFunction, spriteSignalMap } from '../sprite-functions.js';

const manifest = {
  functions: [
    { id: 'idle', emoji: '🙂', frame: [0, 0], state: 'idle' },
    { id: 'wink_right', emoji: '😉', frame: [4, 3], state: 'playful' },
    { id: 'wink_left', emoji: '😉', frame: [5, 3], state: 'playful' },
  ],
  tools: {
    search: { state: 'curious', bubble: 'Searching…' },
    terminal: { state: 'confident', bubble: 'Ejecutando…' },
  },
};

test('resolves a function by id and emoji (first match)', () => {
  expect(findSpriteFunction(manifest, 'wink_right')?.frame).toEqual([4, 3]);
  expect(findSpriteFunction(manifest, '😉')?.id).toBe('wink_right');
});

test('resolves a raw cell', () => {
  expect(findSpriteFunction(manifest, '9,3')).toMatchObject({ frame: [9, 3], state: null });
  expect(findSpriteFunction(manifest, 'nope')).toBeNull();
});

test('resolves a tool function', () => {
  expect(findToolFunction(manifest, 'search')?.state).toBe('curious');
  expect(findToolFunction(manifest, 'nope')).toBeNull();
});

test('builds the agent.signal map from functions and tools', () => {
  const map = spriteSignalMap(manifest);
  expect(map['🙂']).toBe('idle');
  expect(map['wink_right']).toBe('playful');
  expect(map.search).toBe('curious');
});
