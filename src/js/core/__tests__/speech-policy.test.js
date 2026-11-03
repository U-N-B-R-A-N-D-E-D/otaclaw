import { cleanSpeech, summarizeSpeech } from '../speech-policy.js';

describe('speech-policy', () => {
  it('keeps a short reply untouched', () => {
    expect(summarizeSpeech('Done — deployed to production.')).toBe(
      'Done — deployed to production.'
    );
  });

  it('strips code, URLs, markdown and mentions', () => {
    const raw =
      '**Ready** <@123>. See https://example.com/x and `npm test`.\n```js\nconsole.log(1)\n```';
    const out = summarizeSpeech(raw, { max: 120 });
    expect(out).not.toMatch(/https|```|console|\*\*|<@/);
    expect(out).toContain('Ready');
  });

  it('skips the greeting and picks the informative sentence', () => {
    const raw =
      "Sure! I checked the deploy. The build failed because the tests are red. I'll retry.";
    expect(summarizeSpeech(raw, { max: 60 })).toContain('build failed');
  });

  it('never cuts mid-word and ends with an ellipsis', () => {
    const raw =
      'This is a very long sentence without any punctuation that keeps going and going well past the budget of the bubble';
    const out = summarizeSpeech(raw, { max: 45 });
    expect(out.length).toBeLessThanOrEqual(45);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toMatch(/\S…$/);
    expect(out).not.toMatch(/\s…$/);
  });

  it('cuts at a clause boundary when there is one', () => {
    const raw =
      'The deploy went out, the migrations ran clean, and the health check is green';
    expect(summarizeSpeech(raw, { max: 40 })).toBe(
      'The deploy went out, the migrations ran…'
    );
  });

  it('handles Spanish boilerplate', () => {
    const raw =
      'Claro, ya lo revisé. El problema era el token caducado. Lo renové y quedó listo.';
    const out = summarizeSpeech(raw, { max: 60 });
    expect(out).not.toContain('Claro');
    expect(out).not.toContain('revisé');
  });

  it('returns empty for empty or non-prose input', () => {
    expect(summarizeSpeech('')).toBe('');
    expect(summarizeSpeech('```\nonly code\n```')).toBe('');
  });

  it('cleanSpeech collapses whitespace and bullets', () => {
    expect(cleanSpeech('- one\n- two\n\n> three')).toBe('one two three');
  });
});
