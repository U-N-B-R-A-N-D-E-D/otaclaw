/**
 * Emotion pattern table tests.
 *
 * Covers:
 *  - The precision-over-recall contract (strong signals fire, mundane does not).
 *  - Spanish coverage absorbed from the Vibeconferencing signal set.
 *  - The negation/reassurance veto (a reassuring line never reads as negative).
 *  - scoreEmotion's two-axis output (emotion + score/confidence/intensity).
 */
import { jest } from '@jest/globals';
import {
  detectEmotion,
  scoreEmotion,
  EMOTION_PATTERNS,
  MIN_EMOTION_SCORE,
} from '../emotion-patterns.js';

describe('emotion-patterns', () => {
  // --- Precision invariants (must NOT regress) --------------------------------

  test('strong unambiguous English signals fire', () => {
    expect(detectEmotion('hahaha that is funny!')).toBe('laughing');
    expect(detectEmotion("hahaha, that's hilarious!")).toBe('laughing');
    expect(detectEmotion('wow!! amazing!')).toBe('surprised');
    expect(detectEmotion('oops, sorry about that, I made a mistake')).toBe('worried');
    expect(detectEmotion("what?? I don't understand this at all")).toBe('confused');
    expect(detectEmotion('jajaja funny joke 😂')).toBe('laughing');
  });

  test('neutral / mundane text returns null', () => {
    const mundane = [
      'the quick brown fox',
      'Here is the result I built for you',
      "That's a great question, let me check",
      'Sure, I can help with that',
      'Great, that works!',
      "What's the weather like today?",
      'I love this feature, excellent work',
      'here you go, done!',
      'jaja ok',
      'haha sure',
    ];
    for (const t of mundane) {
      expect(detectEmotion(t.toLowerCase())).toBeNull();
    }
  });

  test('empty / nullish input returns null', () => {
    expect(detectEmotion('')).toBeNull();
    expect(detectEmotion(null)).toBeNull();
    expect(detectEmotion(undefined)).toBeNull();
  });

  test('pattern table is well-formed', () => {
    const emotions = new Set();
    for (const [regex, emotion, weight] of EMOTION_PATTERNS) {
      expect(regex).toBeInstanceOf(RegExp);
      expect(typeof emotion).toBe('string');
      expect(weight).toBeGreaterThan(0);
      emotions.add(emotion);
    }
    expect(emotions.size).toBeGreaterThan(0);
    expect(MIN_EMOTION_SCORE).toBeGreaterThan(0);
  });

  // --- Spanish coverage (absorbed signal) -------------------------------------

  test('strong Spanish laughter fires laughing', () => {
    expect(detectEmotion('me muero de risa 😂')).toBe('laughing');
    expect(detectEmotion('qué carcajada tan fuerte')).toBe('laughing');
  });

  test('strong Spanish surprise fires surprised', () => {
    expect(detectEmotion('no puedo creerlo!!')).toBe('surprised');
    expect(detectEmotion('guau!! increíble')).toBe('surprised');
  });

  test('Spanish apology fires worried', () => {
    expect(detectEmotion('perdón, fue mi error')).toBe('worried');
    expect(detectEmotion('lamento mucho el inconveniente')).toBe('worried');
  });

  test('Spanish confusion fires confused', () => {
    expect(detectEmotion('no entiendo lo que pides')).toBe('confused');
    expect(detectEmotion('no sé qué quieres decir??')).toBe('confused');
  });

  test('Spanish sadness fires sad', () => {
    expect(detectEmotion('estoy muy triste 😢')).toBe('sad');
    expect(detectEmotion('qué pena, me da mucha pena')).toBe('sad');
  });

  test('everyday Spanish phrasing does NOT fire (precision)', () => {
    const mundane = [
      'aquí tienes el resultado',
      'gracias por la pregunta',
      'claro, puedo ayudarte con eso',
      'perfecto, listo',
      'qué tal, ¿cómo vas?',
      'increíble, muy bueno', // single mild "increíble" + no reinforcement
    ];
    for (const t of mundane) {
      expect(detectEmotion(t.toLowerCase())).toBeNull();
    }
  });

  // --- Negation / reassurance veto (absorbed signal) --------------------------

  test('reassuring line does NOT read as a negative emotion', () => {
    expect(detectEmotion('no te preocupes, no pasa nada')).toBeNull();
    expect(detectEmotion("don't worry, no worries")).toBeNull();
    expect(detectEmotion('lamento el retraso pero no es para tanto')).toBeNull();
    expect(detectEmotion('perdón, no hay de qué, tranquilo')).toBeNull();
  });

  test('negation veto never CREATES a reaction (positive signals unaffected)', () => {
    // A reassuring line still won't be blocked from a genuinely strong laugh.
    // (Veto only returns null; it can't add emotion.)
    expect(detectEmotion('no te preocupes, jaja está bien')).toBeNull();
  });

  // --- scoreEmotion: two-axis rich output (absorbed signal) -------------------

  test('scoreEmotion returns null below the bar', () => {
    expect(scoreEmotion('the quick brown fox')).toBeNull();
    expect(scoreEmotion('')).toBeNull();
  });

  test('scoreEmotion returns emotion + bounded axes', () => {
    const res = scoreEmotion('no puedo creerlo!! guau');
    expect(res).not.toBeNull();
    expect(res.emotion).toBe('surprised');
    expect(res.score).toBeGreaterThanOrEqual(MIN_EMOTION_SCORE);
    expect(res.confidence).toBeGreaterThanOrEqual(0);
    expect(res.confidence).toBeLessThanOrEqual(1);
    expect(res.intensity).toBeGreaterThanOrEqual(0);
    expect(res.intensity).toBeLessThanOrEqual(1);
  });

  test('strong single marker => high confidence; mild-only => lower', () => {
    const strong = scoreEmotion('me muero de risa'); // weight-3 hit
    const mildOnly = scoreEmotion('wow amazing impressive'); // all weight-1
    expect(strong).not.toBeNull();
    expect(mildOnly).not.toBeNull();
    expect(strong.confidence).toBeGreaterThan(mildOnly.confidence);
  });

  test('detectEmotion and scoreEmotion agree on the winner', () => {
    const samples = [
      'hahaha funny 😂',
      'wow!! amazing',
      'oops my apologies 😅',
      "i'm confused what do you mean",
      'neutral nothing here',
    ];
    for (const t of samples) {
      const gate = detectEmotion(t.toLowerCase());
      const rich = scoreEmotion(t.toLowerCase());
      expect(gate).toBe(rich ? rich.emotion : null);
    }
  });
});
