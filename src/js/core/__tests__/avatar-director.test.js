import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveAvatar,
  idleSprite,
  IDLE_CYCLE,
  MODE_SPRITES,
  ACTIVITY_SPRITES,
} from '../avatar-director.js';

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/data/sprite-functions.json'), 'utf8')
);
const ids = new Set(manifest.functions.map((f) => f.id));

describe('avatar-director', () => {
  it('every sprite it can name exists in the 1:1 manifest', () => {
    const used = [
      ...Object.values(MODE_SPRITES),
      ...Object.values(ACTIVITY_SPRITES),
      ...IDLE_CYCLE,
    ];
    for (const id of used) expect(ids.has(id)).toBe(true);
  });

  it('mirrors the Vibeconf priority: offline > error > speaking > activity > hearing > idle', () => {
    expect(resolveAvatar({ offline: true, error: true, speaking: 'laugh' }).id).toBe('waiting');
    expect(resolveAvatar({ error: true, speaking: 'laugh' }).id).toBe('sad_intense');
    expect(resolveAvatar({ speaking: 'laugh', state: 'thinking', hearing: true }).id).toBe('laugh');
    expect(resolveAvatar({ state: 'thinking', activity: 'curious', hearing: true }).id).toBe('curious');
    expect(resolveAvatar({ state: 'idle', hearing: true }).id).toBe('idle');
    expect(resolveAvatar({ state: 'idle' }).id).toBe('idle');
  });

  it('lets the agent override resting / working / listening / speaking slots', () => {
    expect(resolveAvatar({ state: 'idle', overrides: { idle: 'wink_right' } }).id).toBe('wink_right');
    expect(resolveAvatar({ state: 'offline', overrides: { offline: 'shiver' } }).id).toBe('shiver');
    expect(resolveAvatar({ state: 'thinking', overrides: { working: 'terminal' } }).id).toBe('terminal');
    expect(resolveAvatar({ state: 'idle', hearing: true, overrides: { listening: 'look_aside' } }).id).toBe('look_aside');
    expect(resolveAvatar({ speaking: 'thumbs_up_right', overrides: { speaking: 'laugh' } }).id).toBe('laugh');
  });

  it('a per-response speaking pose wins over the working pose', () => {
    expect(resolveAvatar({ state: 'working', activity: 'hand_on_hip', speaking: 'tada' }).id).toBe('tada');
  });

  it('modes select the listening face like Vibeconf MODE_EMOJIS', () => {
    expect(resolveAvatar({ mode: 'active', hearing: true }).id).toBe('idle');
    expect(resolveAvatar({ mode: 'passive', hearing: true }).id).toBe('arms_closed');
    expect(resolveAvatar({ mode: 'silent', hearing: true }).id).toBe('waiting');
  });

  it('the idle breathes through the cycle in every mode, not the mode face', () => {
    expect(resolveAvatar({ mode: 'active', state: 'idle', idleIndex: 7 }).id).toBe(
      idleSprite(7)
    );
    expect(resolveAvatar({ mode: 'passive', state: 'idle', idleIndex: 7 }).id).toBe(
      idleSprite(7)
    );
  });

  it('idle cycle is only the 3 true-rest frames (no work/social bleed)', () => {
    expect(new Set(IDLE_CYCLE)).toEqual(
      new Set(['idle', 'waiting', 'arms_closed'])
    );
    expect(idleSprite(0)).toBe('idle');
    expect(idleSprite(3)).toBe('idle');
    expect(idleSprite(IDLE_CYCLE.length)).toBe('idle');
    expect(idleSprite(-1)).toBe(idleSprite(1));
  });

  it('an idle override beats the mode', () => {
    expect(resolveAvatar({ mode: 'passive', overrides: { idle: 'smug' } }).id).toBe('smug');
  });

  it('error can carry the detected emotion pose', () => {
    expect(resolveAvatar({ error: true, emotion: 'scared' }).id).toBe('scared');
  });
});
