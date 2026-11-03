#!/usr/bin/env node
/**
 * Sprite utilization audit.
 *
 *   npm run sprites:usage
 *
 * Compares the sequences the director actually plays (catalog sequences first,
 * then DEFAULT_STATE_SPRITES) with the frame catalog and reports per-state
 * frames, total utilization and unused cells.
 * Use it after editing `stateSprites.states` to see what is actually visible.
 */
import fs from 'node:fs';
import { DEFAULT_STATE_SPRITES } from '../src/js/core/state-sprite-map.js';

const catalog = JSON.parse(
  fs.readFileSync(new URL('../src/data/frame-catalog.json', import.meta.url), 'utf8'),
);
const all = new Map((catalog.frames || []).map((f) => [`${f.col},${f.row}`, f]));
const used = new Map(); // frame -> states

const valid = new Set(all.keys());
const catalogSequences = catalog.sequences || {};
console.log('state        frames  cells');
for (const [state, def] of Object.entries(DEFAULT_STATE_SPRITES)) {
  const source = Array.isArray(catalogSequences[state])
    ? catalogSequences[state]
    : def.sequence || [];
  const cells = [...new Set(source.map(([c, r]) => `${c},${r}`).filter((k) => valid.has(k)))];
  for (const cell of cells) {
    if (!used.has(cell)) used.set(cell, []);
    used.get(cell).push(state);
  }
  console.log(`${state.padEnd(12)} ${String(cells.length).padStart(6)}  ${cells.join(' ')}`);
}

const unused = [...all.keys()].filter((cell) => !used.has(cell));
const pct = all.size ? Math.round((used.size / all.size) * 100) : 0;
console.log(
  `\nframes ${all.size} · used ${used.size} (${pct}%) · unused ${unused.length}`,
);
if (unused.length) {
  console.log('unused:', unused.join(' '));
  for (const cell of unused) {
    const f = all.get(cell);
    console.log(`  ${cell}  ${f?.primary || ''} / ${f?.mood || ''}  ${f?.desc || ''}`);
  }
}
