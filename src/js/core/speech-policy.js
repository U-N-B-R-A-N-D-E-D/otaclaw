/**
 * Speech policy — turns a full agent reply into one readable bubble line.
 *
 * The bubble is a headline, not the transcript: the full text belongs to the
 * chat (Discord, Hermes, the web UI). Rules:
 *   1. Strip anything that is not prose (code, URLs, markdown, mentions).
 *   2. Pick the most informative sentence, not blindly the first one.
 *   3. Never cut mid-word; prefer a clause boundary, then a word boundary.
 *   4. Respect a character budget derived from the layout (the compact HUD
 *      fits far less than the kiosk), so the bubble never grows off-window.
 *
 * Pure functions: no DOM, no timers. The caller decides the budget.
 */

const BOILERPLATE =
  /^(sure|okay|ok|great|certainly|of course|absolutely|alright|got it|claro|vale|perfecto|por supuesto|de acuerdo|entendido|aqu[ií]|here(?:'s| is| are)|i(?:'ll| will| can| am| have|'ve)|voy a|d[eé]jame|he |hemos |basado en|as an ai|looking at|i (?:checked|looked|reviewed|went through)|revis[eé]|lo revis[eé])\b/i;

/** Strip markdown/code/URLs/mentions and collapse whitespace. */
export function cleanSpeech(raw) {
  let s = String(raw ?? "");
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(/https?:\/\/\S+/g, " ");
  s = s.replace(/<@!?\d+>|<@&\d+>|@(here|everyone)/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^\s*(?:[>*+\-•]|\d+[.)])\s+/gm, "");
  s = s.replace(/[*_~|]/g, " ");
  s = s.replace(/^\s*(step \d+:|thought:|reasoning:|analysis:|paso \d+:)\s*/gim, "");
  s = s.replace(/^(?:hey|hi|hello|hola|buenas|qu[eé] tal)[\s,!.—–-]+/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function splitSentences(text) {
  const parts = text.match(/[^.!?…]+[.!?…]+["')\]]*/g);
  const list = parts ? parts.map((s) => s.trim()).filter(Boolean) : [];
  return list.length ? list : [text];
}

/** Cut at a comma/semicolon/dash or word boundary near `max`. */
function cutNatural(text, max) {
  const head = text.slice(0, max + 1);
  let clause = -1;
  for (const m of head.matchAll(/[,;:—–]\s/g)) {
    if (m.index >= max * 0.5) clause = m.index;
  }
  if (clause > 0) return text.slice(0, clause).trim();
  const space = head.lastIndexOf(" ");
  if (space > max * 0.5) return text.slice(0, space).trim();
  return head.trim();
}

/**
 * Pick the best sentence and fit it into `max` characters.
 *
 * @param {string} raw
 * @param {{max?: number}} [opts]
 * @returns {string}
 */
export function summarizeSpeech(raw, { max = 84 } = {}) {
  const full = cleanSpeech(raw);
  if (!full) return "";
  if (full.length <= max) return full;

  // Lead with the first real sentence: skipping greetings, acks and
  // "I checked…" wind-ups. Reordering sentences for keywords made bubbles
  // jump to a random detail instead of the point of the reply.
  const sentences = splitSentences(full);
  let lead = sentences.find((sentence) => {
    const letters = sentence.replace(/[^\p{L}\p{N}]/gu, "");
    return !BOILERPLATE.test(sentence) && letters.length >= 12;
  });
  if (!lead) lead = sentences[0];

  let out = lead;
  if (out.length > max) out = `${cutNatural(out, max)}…`;
  out = out.replace(/\s+/g, " ").trim();
  // Stripping a leading greeting can leave a lowercase first letter.
  return out.charAt(0).toUpperCase() + out.slice(1);
}
