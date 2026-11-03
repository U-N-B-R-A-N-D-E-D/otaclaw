#!/usr/bin/env node
/**
 * Regenerate the data-driven sections of docs/SPRITE-MAP.md from the catalogs.
 *
 * Sections are delimited by:
 *   <!-- BEGIN GENERATED:frames --> ... <!-- END GENERATED:frames -->
 *   tools, events, unused
 *
 * The prose is authored by hand; only the tables/counts are generated.
 * Run: npm run docs:sprite-map
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import config from "../config/config.example.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

const frameCatalog = readJson("src/data/frame-catalog.json");
const spriteCatalog = readJson("src/data/sprite-catalog.json");
const manifest = readJson("src/data/sprite-functions.json");

const cellKey = (col, row) => `${col},${row}`;
const spriteByCell = new Map(
  (spriteCatalog.sprites || []).map((s) => [cellKey(s.col, s.row), s]),
);
const fnByCell = new Map(
  (manifest.functions || [])
    .filter((f) => Array.isArray(f.frame))
    .map((f) => [cellKey(f.frame[0], f.frame[1]), f]),
);
const esc = (v) => String(v ?? "").replace(/\|/g, "\\|");
const code = (v) => `\`${String(v).replace(/`/g, "\\`")}\``;

const frameRows = frameCatalog.frames.map((f) => {
  const key = cellKey(f.col, f.row);
  const sp = spriteByCell.get(key) || {};
  const fn = fnByCell.get(key) || {};
  return [
    code(key),
    code(fn.id || f.id || key),
    fn.emoji || f.emoji || "",
    esc(f.primary || ""),
    esc(f.lane || ""),
    fn.state ? code(fn.state) : "—",
    (fn.use || []).length ? esc(fn.use.join(", ")) : "—",
    code(sp.file || ""),
    esc(f.desc || ""),
  ];
});

const frameTable = [
  "| Cell | ID | Emoji | Primary | Lane | State | Also in | File | Description |",
  "|---|---|---|---|---|---|---|---|---|",
  ...frameRows.map((r) => `| ${r.join(" | ")} |`),
].join("\n");

const toolTable = [
  "| Tool | State | Emoji | Bubble | Trigger |",
  "|---|---|---|---|---|",
  ...Object.entries(manifest.tools || {}).map(([name, t]) =>
    `| ${code(name)} | ${t.state ? code(t.state) : "—"} | ${t.emoji || ""} | ${esc(t.bubble || "")} | ${code(`agent.sprite {sprite:'${name}'}`)} / ${code(`agent.signal ${name}`)} |`,
  ),
].join("\n");

const eventTable = [
  "| Event | State |",
  "|---|---|",
  ...Object.entries(config.eventMap || {}).map(
    ([event, state]) => `| ${code(event)} | ${code(state)} |`,
  ),
].join("\n");

const used = new Set(frameCatalog.frames.map((f) => cellKey(f.col, f.row)));
const unused = [];
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 12; col += 1) {
    const key = cellKey(col, row);
    if (!used.has(key)) unused.push(key);
  }
}
const unusedText = `The sheet is 12×4 = 48 cells. \`src/data/frame-catalog.json\` ships **${frameCatalog.frames.length} frames**; ${unused.length} cells are unused: ${unused.map(code).join(", ")}.`;

const blocks = {
  frames: frameTable,
  tools: toolTable,
  events: eventTable,
  unused: unusedText,
};

const docPath = resolve(root, "docs/SPRITE-MAP.md");
let doc = readFileSync(docPath, "utf8");
let changed = 0;
for (const [name, content] of Object.entries(blocks)) {
  const re = new RegExp(
    `(<!-- BEGIN GENERATED:${name} -->)[\\s\\S]*?(<!-- END GENERATED:${name} -->)`,
  );
  if (!re.test(doc)) {
    console.error(`missing generated block: ${name}`);
    process.exitCode = 1;
    continue;
  }
  const next = `${re.exec(doc)[1]}\n${content}\n${re.exec(doc)[2]}`;
  const replaced = doc.replace(re, next);
  if (replaced !== doc) changed += 1;
  doc = replaced;
}
writeFileSync(docPath, doc);
console.log(`sprite-map: ${frameCatalog.frames.length} frames, ${unused.length} unused cells, ${changed} block(s) updated`);
