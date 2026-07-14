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
 */

export const EMOTION_PATTERNS = [
  // Laughing: only clear laugh signals. Short "haha"/"jaja" alone is too common
  // in casual Spanish/English replies and was flipping the avatar mid-idle.
  // Long laughs / meme markers / emoji clear the bar alone; short needs echo.
  [/\b(?:ha){3,}\b|\b(?:ja){3,}\b|\b(?:je){3,}\b|\blmao\b|\blmfao\b|\brofl\b|😂|🤣|😆/gi, 'laughing', 3],
  [/\b(?:ha){2}\b|\b(?:ja){2}\b|\bhehe+\b/gi, 'laughing', 1],

  // Surprised: strong shock markers qualify on their own. Mild amazement
  // words ("wow", "amazing") only count when reinforced by another signal
  // (e.g. repeated "!!") so a single passing "wow" doesn't flip the avatar.
  [/\bomg\b|\bwhoa+\b|\bwoah\b|mind[\s-]?blown|🤯|😮|😲/gi, 'surprised', 3],
  [/\bwow\b|\bamazing\b|\bincredible\b|\bimpressive\b|\bwonderful\b/gi, 'surprised', 1],
  [/!{2,}/g, 'surprised', 2],

  // Worried: explicit apology / error language, not generic caution words
  // like "careful"/"risk"/"warning" that show up in normal risk-analysis text.
  [/\boops\b|\buh[\s-]?oh\b|\bmy apologies\b|\bi'?m sorry\b|😅/gi, 'worried', 3],

  // Sad: explicit sadness markers only.
  [/😢|😭|\bi'?m sad\b|\bthat'?s (?:so |really )?sad\b/gi, 'sad', 3],

  // Confused: explicit confusion statements, and repeated "??" — never a
  // bare "?", since ordinary clarifying questions are not confusion.
  [/\?{2,}/g, 'confused', 2],
  [/\bi'?m confused\b|\bthat'?s unclear\b|\bwhat do you mean\b|\bi don'?t understand\b/gi, 'confused', 3],
];

export const MIN_EMOTION_SCORE = 3;

/** How many trailing characters of accumulated text to scan (recency window). */
export const RECENT_WINDOW = 120;

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

  const scores = {};
  for (const [regex, emotion, weight] of EMOTION_PATTERNS) {
    const matches = text.match(regex);
    if (matches) scores[emotion] = (scores[emotion] || 0) + matches.length * weight;
  }

  let bestEmotion = null;
  let bestScore = 0;
  for (const [emotion, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestEmotion = emotion;
    }
  }

  return bestScore >= minScore ? bestEmotion : null;
}

export default detectEmotion;
