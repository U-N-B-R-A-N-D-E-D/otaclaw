/**
 * 1:1 sprite functions (see `src/data/sprite-functions.json`).
 *
 * Each Hal asset has a stable id + emoji. `agent.sprite` can request:
 *   - a function id       ("laugh_tilt"), or a pre-v3 alias ("wink_right")
 *   - an emoji            ("😉", first match)
 *   - a raw cell          ("4,3")
 *   - a tool function     ("search", "terminal", ...)
 * A function with a frame renders that exact asset; a tool maps to a state
 * sequence. Pure logic (no DOM), unit tested.
 */

export function findSpriteFunction(manifest, key) {
  const raw = String(key == null ? '' : key).trim();
  if (!raw) return null;
  const cell = raw.match(/^(\d+)\s*,\s*(\d+)$/);
  if (cell) {
    return { id: `cell:${raw}`, frame: [Number(cell[1]), Number(cell[2])], state: null };
  }
  const funcs = manifest?.functions || [];
  return (
    funcs.find((f) => f.id === raw) ||
    funcs.find((f) => Array.isArray(f.aliases) && f.aliases.includes(raw)) ||
    funcs.find((f) => f.emoji === raw) ||
    null
  );
}

export function findToolFunction(manifest, key) {
  const raw = String(key == null ? '' : key).trim();
  if (!raw) return null;
  return manifest?.tools?.[raw] || null;
}

/** `agent.signal` name/emoji -> state, built from the 1:1 manifest. */
export function spriteSignalMap(manifest) {
  const map = {};
  for (const f of manifest?.functions || []) {
    if (!f.state) continue;
    if (f.emoji && !(f.emoji in map)) map[f.emoji] = f.state;
    map[f.id] = f.state;
    for (const alias of f.aliases || []) if (!(alias in map)) map[alias] = f.state;
  }
  for (const [id, tool] of Object.entries(manifest?.tools || {})) {
    if (tool?.state) map[id] = tool.state;
  }
  return map;
}
