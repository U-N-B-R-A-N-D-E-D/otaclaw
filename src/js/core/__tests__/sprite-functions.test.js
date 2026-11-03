import { readFileSync } from 'fs';
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

test('pre-v3 aliases resolve to the same cell, truthful ids win', () => {
  const real = JSON.parse(
    readFileSync(new URL('../../../data/sprite-functions.json', import.meta.url), 'utf8'),
  );
  // "phone" was never a phone: it is the winking fist-forward pose.
  expect(findSpriteFunction(real, 'phone')).toMatchObject({ id: 'point_wink_alt', frame: [6, 2] });
  expect(findSpriteFunction(real, 'shocked_left')).toMatchObject({ id: 'arms_crossed', frame: [9, 0] });
  expect(findSpriteFunction(real, 'wink_right')).toMatchObject({ id: 'laugh_tilt', frame: [4, 3] });
  expect(findSpriteFunction(real, 'hands_on_hips')?.frame).toEqual([6, 1]);
  const ids = real.functions.map((f) => f.id);
  const aliases = real.functions.flatMap((f) => f.aliases || []);
  expect(new Set(ids).size).toBe(ids.length);
  expect(aliases.filter((a) => ids.includes(a))).toEqual([]);
  expect(spriteSignalMap(real).phone).toBe('playful');
});

test('every director / tool id names a real function', async () => {
  const real = JSON.parse(
    readFileSync(new URL('../../../data/sprite-functions.json', import.meta.url), 'utf8'),
  );
  const { MODE_SPRITES, ACTIVITY_SPRITES, IDLE_CYCLE } = await import('../avatar-director.js');
  for (const id of [...Object.values(MODE_SPRITES), ...Object.values(ACTIVITY_SPRITES), ...IDLE_CYCLE]) {
    expect(real.functions.some((f) => f.id === id)).toBe(true);
  }
});
