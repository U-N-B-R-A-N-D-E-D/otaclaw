# Speech: chat vs bubble vs sprite

Three layers, three jobs. Do not mix them.

| Layer | Where | Content | Length |
|---|---|---|---|
| **Chat** | Discord / Slack / your agent | the real conversation | full |
| **Bubble** | `#speech-bubble` on the face | the avatar's voice / status | **one short line** |
| **Sprite** | animation | current state | state-driven |

The chat is owned by the agent. OtaClaw never rewrites it. The bubble is a
**headline**, not a transcript: the full reply stays in chat.

## Bubble policy

`summarizeSpeech()` (`src/js/core/speech-policy.js`) is the single implementation;
`_shortSpeech()` and `_updateSpeechBubble()` in `src/js/app.js` call it for every
path, so no caller can bypass it.

1. **Prefer explicit voice.** If the event carries `bubble` or `summary`, use it.
2. Otherwise take the **lead sentence** of `message`/`content`, skipping
   greetings, acknowledgements and wind-ups such as "Sure" or "I checked…".
3. Otherwise fall back to the canned state phrase (`_t(state)`).
4. Strip markdown, code fences, inline code, URLs, link syntax and mentions.
5. Cut at a clause (`;`, `:`, `—`) or word boundary — **never mid-word** — and
   only then add `…`.
6. Never show the user's own message as the bubble.
7. Hold the line (~7 s) across the success→idle auto-return; idle clears it.

Budget: **84 characters** in the compact HUD, **120** in the kiosk. The compact
bubble is also capped at 5 lines with `-webkit-line-clamp`, so it can never grow
above the window and hide the beginning of the text.

The face does this locally. The reference gateway does not need to summarize;
if you want exact control, send `bubble`.

## Event mapping

| Event | Sprite | Bubble |
|---|---|---|
| `agent.message.start` | thinking | short opener (`Hmm…`) |
| `agent.message.delta` | processing | **no per-token updates** (streaming only) |
| `agent.message.complete` | success | `bubble` / `summary` / lead sentence |
| `agent.message.error` | error | brief reason |
| `agent.tool.call` | tool | optional `bubble`/`summary`, throttled |
| `gateway.idle` | idle | empty |

For agents that store **final** messages (a DB, a queue), send **start + complete**
only. A synthetic delta right before complete makes the sprite jump
processing→success in the same tick and reads as "stuck".

## BYOA contract

Any agent can drive the face with:

```json
{ "event": "agent.message.complete",
  "payload": { "content": "full reply for logs/consumers",
               "bubble": "short line for the avatar" } }
```

`bubble` and `summary` are optional strings. Without them, the face summarizes
`content` locally. Full text still lives in your chat.

## Examples

Good:

- `bubble`: `"Done: found 3 files and summarized them."`
- `bubble`: `"Could not open the repo; check permissions."`

Bad:

- the whole 3-paragraph reply
- `"**Done** — see https://…"` (markdown/URL noise)
- the user's message (`"hi there"`)

## Cost model (no tokens from the avatar)

- OtaClaw has **no model and no inference**: state machine, sprites and
  `summarizeSpeech` are local.
- The reference gateway (`examples/gateway.mjs`) has no inference either.
- A read-only watcher that mirrors your agent's conversation costs **zero
  tokens**.
- **Tickle is local by default**: laugh + a canned line. Server-side tickle
  turns are opt-in; leave them off if you do not want spend.
- **No skill/toolset is injected** into your agent. There is no OtaClaw prompt
  and no OtaClaw tool. Your agent pays only for its own conversation.

## Copy

Click or tap the bubble to copy its current line to the clipboard. The codec
subtitle mirrors the same text and copies on click too. The bubble keeps the
line on screen; copying never changes the text.

## Related

- [WEBSOCKET-PROTOCOL.md](WEBSOCKET-PROTOCOL.md) — event shapes
- [STATE-SPRITES.md](STATE-SPRITES.md) — state → sequence table
- [BRING-YOUR-OWN-AGENT.md](BRING-YOUR-OWN-AGENT.md) — the public BYOA guide
