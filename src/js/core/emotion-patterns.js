/**
 * Emotion pattern table for lightweight text-based avatar reactions.
 *
 * ## Precision over recall
 * This only fires on unambiguous emotional signals: explicit laughter
 * markers, explicit strong exclamation/surprise, explicit apology/error
 * language, and explicit confusion. Everyday helpful-assistant phrasing
 * ("here's the result", "that's a great question", "let me check") must
 * NOT trigger an emotion override — those words show up constantly in
 * mundane, non-emotional responses and were the #1 source of the avatar
 * "randomly laughing" or "presenting" for no reason.
 *
 * When no pattern clears `minScore`, `detectEmotion` returns `null` so
 * callers fall back to the current contextual/category-driven state
 * instead of forcing an emotion change. Erring toward no override is the
 * intended default.
 *
 * ## Tuning
 * - Raise a pattern's `weight` to make it fire more eagerly on its own.
 * - Keep ambiguous/mild words (e.g. "wow", "amazing") at low weight so they
 *   only count when reinforced by another signal (repeated punctuation,
 *   another mild match, etc.) rather than firing alone.
 * - Raise `MIN_EMOTION_SCORE` to require stronger/more repeated signals
 *   overall before an emotion override is applied.
 *
 * ## Spanish coverage (absorbed 2026-08-25 from the Vibeconferencing signal
 * set) — the avatar answers in the user's language, and the original table
 * was English-only for *words* (emoji + haha/ja laughs worked in both). The
 * entries below are additive and unambiguous-only, following the same
 * precision rules: strong markers clear the bar alone, nothing that shows up
 * in everyday Spanish replies ("qué", "gracias", "perfecto", "listo") is a
 * cue on its own.
 */

export const EMOTION_PATTERNS = [
  // Laughing: only clear laugh signals. Short "haha"/"jaja" alone is too common
  // in casual Spanish/English replies and was flipping the avatar mid-idle.
  // Long laughs / meme markers / emoji clear the bar alone; short needs echo.
  [/\b(?:ha){3,}\b|\b(?:ja){3,}\b|\b(?:je){3,}\b|\blmao\b|\blmfao\b|\brofl\b|😂|🤣|😆/gi, 'laughing', 3],
  [/\b(?:ha){2}\b|\b(?:ja){2}\b|\bhehe+\b/gi, 'laughing', 1],
  // Spanish: unambiguous strong laughter only ("me muero de risa", "carcajada",
  // "jajaja" is already covered by ja{3,}). "risa"/"jaja" alone are too common.
  [/me muero de risa|\bcarcajadas?\b|risitas?/gi, 'laughing', 3],

  // Surprised: strong shock markers qualify on their own. Mild amazement
  // words ("wow", "amazing") only count when reinforced by another signal
  // (e.g. repeated "!!") so a single passing "wow" doesn't flip the avatar.
  [/\bomg\b|\bwhoa+\b|\bwoah\b|mind[\s-]?blown|🤯|😮|😲/gi, 'surprised', 3],
  [/\bwow\b|\bamazing\b|\bincredible\b|\bimpressive\b|\bwonderful\b/gi, 'surprised', 1],
  [/!{2,}/g, 'surprised', 2],
  // Spanish: strong amazement only. Bare "qué" / "increíble" in everyday
  // replies is not a cue; "no puedo creerlo" / "guau!" are unambiguous.
  [/no (?:lo |la )?puedo creerlo|\bguau+[!]?\b|no me lo creo/gi, 'surprised', 3],

  // Worried: explicit apology / error language, not generic caution words
  // like "careful"/"risk"/"warning" that show up in normal risk-analysis text.
  [/\boops\b|\buh[\s-]?oh\b|\bmy apologies\b|\bi'?m sorry\b|😅/gi, 'worried', 3],
  // Spanish: explicit apology language ("perdón", "disculpa", "lamento",
  // "es mi culpa"). "error" alone is too common in normal output to be a cue.
  [/\bperd[oó]n\b|\bdisculpa[sz]?\b|\blamento\b|\bes mi culpa\b/gi, 'worried', 3],

  // Sad: explicit sadness markers only.
  [/😢|😭|\bi'?m sad\b|\bthat'?s (?:so |really )?sad\b/gi, 'sad', 3],
  // Spanish: explicit sadness only ("estoy triste", "qué pena", "me da pena").
  [/estoy (?:muy )?(?:triste|deprimid[oa])|\bqu[ée] pena\b|\bme da (?:una |much[oa] )?pena\b/gi, 'sad', 3],

  // Confused: explicit confusion statements, and repeated "???" — never a
  // bare "?", since ordinary clarifying questions are not confusion.
  [/\?{2,}/g, 'confused', 2],
  [/\bi'?m confused\b|\bthat'?s unclear\b|\bwhat do you mean\b|\bi don'?t understand\b/gi, 'confused', 3],
  // Spanish: explicit confusion only ("no entiendo", "no sé qué").
  [/no (?:lo |la |esto )?entiendo|\bno s[eé] (?:qu[ée]|c[oó]mo|por qu[ée])\b|\bqu[ée] quieres decir\b/gi, 'confused', 3],
];

export const MIN_EMOTION_SCORE = 3;

/** How many trailing characters of accumulated text to scan (recency window). */
export const RECENT_WINDOW = 120;

/**
 * Reassurance phrases that VETO a negative-emotion override (absorbed from the
 * Vibeconferencing negation signal). "no worries" / "no te preocupes" / "no
 * pasa nada" / "don't worry" read as calm/reassuring, not worried/sad — without
 * this guard a stray "perdón" or "lamento" inside an apologetic-but-fine reply
 * would wrongly flip the avatar. If any of these is present we return null up
 * front so the caller keeps its current state. This can only turn a would-be
 * negative reaction into no-reaction; it never creates one.
 */
const NEGATION_VETO = [
  /no worries|don'?t worry|no te preocup[es]|no se preocupe|no pasa nada|no es (?:para tanto|grave|mucho)|no hay de qu[eé]|relajate|tranqui[l]o/i,
];

/**
 * Score `text` against EMOTION_PATTERNS and return the strongest emotion,
 * or `null` if nothing clears `minScore`.
 *
 * @param {string} text - lowercased text to scan (already windowed by caller)
 * @param {{minScore?: number}} [options]
 * @returns {string|null}
 */
export function detectEmotion(text, options = {}) {
  if (!text) return null;
  const minScore = options.minScore ?? MIN_EMOTION_SCORE;

  // Negation/reassurance guard: never read a reassuring line as a negative
  // emotion. (VC signal: a *wrong* reaction is worse than no reaction.)
  for (const veto of NEGATION_VETO) {
    if (veto.test(text)) return null;
  }

  const result = scoreEmotion(text, options);
  return result ? result.emotion : null;
}

/**
 * Richer scoring (absorbed from the Vibeconferencing two-axis model: an
 * "engagement" axis = how strongly the signal fired, a "confidence" axis = how
 * unambiguous it was). Returns `null` when nothing clears the bar, otherwise:
 *
 *   { emotion, score, confidence, intensity }
 *
 * - `score`      raw weighted match total (before the minScore gate).
 * - `confidence` 0..1 — how unambiguous: a single high-weight (strong) match
 *   scores high; a pile of mild (weight-1) matches scores lower.
 * - `intensity`  0..1 — the "engagement" axis, for proportional reactions
 *   (longer/stronger animation) instead of a flat fire-or-not.
 *
 * `detectEmotion` is the boolean gate; this is the opt-in rich form so existing
 * callers are unchanged.
 *
 * @param {string} text
 * @param {{minScore?: number, cap?: number}} [options] `cap` normalizes
 *   `intensity` (default 6 ≈ two strong markers, comfortably above minScore).
 * @returns {{emotion:string,score:number,confidence:number,intensity:number}|null}
 */
export function scoreEmotion(text, options = {}) {
  if (!text) return null;
  const minScore = options.minScore ?? MIN_EMOTION_SCORE;
  const cap = options.cap ?? 6;

  const scores = {};
  // Track, per emotion, the strongest single-pattern weight that contributed,
  // so confidence reflects "did something UNAMBIGUOUS fire" vs "many mild cues".
  const strongestWeight = {};
  for (const [regex, emotion, weight] of EMOTION_PATTERNS) {
    const matches = text.match(regex);
    if (matches) {
      scores[emotion] = (scores[emotion] || 0) + matches.length * weight;
      if (weight > (strongestWeight[emotion] || 0)) strongestWeight[emotion] = weight;
    }
  }

  let bestEmotion = null;
  let bestScore = 0;
  for (const [emotion, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestEmotion = emotion;
    }
  }
  if (!bestEmotion || bestScore < minScore) return null;

  // Strong single marker (weight 3) => high confidence. Mild-only (weight 1)
  // requires corroboration => lower confidence.
  const top = strongestWeight[bestEmotion] || 1;
  const confidence = top >= 3 ? 1 : Math.min(0.99, 0.4 + bestScore * 0.1);
  const intensity = Math.min(1, bestScore / cap);

  return { emotion: bestEmotion, score: bestScore, confidence, intensity };
}

export default detectEmotion;
