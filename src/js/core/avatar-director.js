/**
 * Avatar director — Vibeconferencing-style selection for the 1:1 Hal sprites.
 *
 * Vibeconf does not guess a face from a tool category. It has a priority
 * waterfall (page-inject.js): offline/agent-absent > error > speaking/audio >
 * activity > hearing > idle > listening. The agent itself picks the resting /
 * working / speaking face (set_avatar_emoji + speak emoji); the renderer only
 * decides which of those applies *right now*.
 *
 * This module is that pure decision layer for OtaClaw. Inputs are semantic
 * (offline, error, speaking, activity, hearing, mode, agent overrides); the
 * output is one of the 44 function ids from src/data/sprite-functions.json.
 * No DOM, no timers — the caller drives it.
 *
 * Modes (Vibeconf MODE_EMOJIS):
 *   active  — engaged, free to answer          -> idle
 *   passive — listening, lips sealed            -> hands_clasped
 *   silent  — will act but cannot speak         -> waiting
 *
 * Activity (Vibeconf ACTIVITY_EMOJIS):
 *   thinking -> contemplate    working -> hands_on_hips
 *   speaking -> talk_open      yielding -> point_ready
 *   ticking  -> think_glance   success  -> thumbs_up_wink
 *   error    -> sad_intense    listening-> attentive
 */

export const MODE_SPRITES = Object.freeze({
  active: 'idle',
  passive: 'hands_clasped',
  silent: 'waiting',
});

export const ACTIVITY_SPRITES = Object.freeze({
  thinking: 'contemplate',
  working: 'hands_on_hips',
  speaking: 'talk_open',
  yielding: 'point_ready',
  ticking: 'think_glance',
  success: 'thumbs_up_wink',
  error: 'sad_intense',
  listening: 'attentive',
  attention: 'attentive',
  offline: 'waiting',
});

/**
 * The idle is not a frozen face and not only the 3 rest frames either.
 * Vibeconf keeps one idle emoji but animates posture/bob/breathe around it;
 * Hal instead has 44 poses, so the rest state can breathe across the calm
 * frames and occasionally glance/wave without ever looking "stuck".
 * Keep the 3 true-rest frames first (they dominate) and sprinkle the calm
 * social/work poses after them.
 */
export const IDLE_CYCLE = Object.freeze([
  'idle',
  'waiting',
  'hands_clasped',
  'idle',
  'waiting',
  'hands_clasped',
]);

export function idleSprite(index = 0, cycle = IDLE_CYCLE) {
  const arr = Array.isArray(cycle) && cycle.length ? cycle : IDLE_CYCLE;
  const i = Math.abs(Math.trunc(Number(index) || 0)) % arr.length;
  return arr[i];
}

/**
 * Resolve the face for the current moment. Priority mirrors Vibeconf's chain,
 * adapted to what OtaClaw actually knows:
 *
 *   1. offline / agent absent   -> waiting (not-on-line)
 *   2. error / degraded         -> emotion or sad_intense
 *   3. speaking / per-response  -> agent speaking override / that pose
 *   4. activity (tool/thinking) -> agent working override / tool function
 *   5. hearing (user active)    -> listening override / phone
 *   6. idle                     -> idle override / mode / idle cycle
 *
 * `overrides` are persistent slots set by the agent via `agent.sprite` with a
 * `slot` (idle | listening | working | speaking | yielding | offline | error).
 * `speaking` is the one-shot per-response pose (Vibeconf's `speak` emoji).
 */
export function resolveAvatar({
  mode = 'active',
  state = 'idle',
  overrides = {},
  activity = null,
  emotion = null,
  speaking = null,
  hearing = false,
  offline = false,
  error = false,
  idleIndex = 0,
  idleCycle = IDLE_CYCLE,
} = {}) {
  const slot = (name) => {
    const v = overrides?.[name];
    return typeof v === 'string' && v ? v : null;
  };
  const st = String(state || 'idle');

  if (offline) {
    return { id: slot('offline') || ACTIVITY_SPRITES.offline, source: 'offline' };
  }
  if (error) {
    return { id: emotion || slot('error') || ACTIVITY_SPRITES.error, source: 'error' };
  }
  if (speaking) {
    return { id: slot('speaking') || speaking, source: 'speaking' };
  }
  if (st === 'speaking') {
    return { id: slot('speaking') || ACTIVITY_SPRITES.speaking, source: 'speaking' };
  }
  if (st === 'working' || st === 'thinking') {
    return {
      id: slot('working') || activity || ACTIVITY_SPRITES[st] || 'idle',
      source: 'activity',
    };
  }
  if (st === 'yielding') {
    return { id: slot('yielding') || ACTIVITY_SPRITES.yielding, source: 'yielding' };
  }
  if (st === 'ticking') {
    return { id: ACTIVITY_SPRITES.ticking, source: 'ticking' };
  }
  if (st === 'success') {
    return {
      id: emotion || slot('speaking') || ACTIVITY_SPRITES.success,
      source: 'success',
    };
  }
  if (hearing) {
    return {
      id: slot('listening') || MODE_SPRITES[mode] || ACTIVITY_SPRITES.listening,
      source: 'listening',
    };
  }
  if (st === 'idle') {
    return {
      id: slot('idle') || idleSprite(idleIndex, idleCycle),
      source: 'idle',
    };
  }
  return { id: slot(st) || ACTIVITY_SPRITES[st] || 'idle', source: st };
}
