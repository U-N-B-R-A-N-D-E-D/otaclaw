# Bring your own agent

OtaClaw is the **face**, not the brain. Any process that can emit a few
WebSocket events can drive it: a Discord bot, a WhatsApp bridge, a local LLM
script, n8n, a cron job, or your own stack.

There is no inference in this repository. You keep your agent; OtaClaw only
renders its state.

## 2-minute quickstart

```bash
npm install
npm run gateway:demo
# open the URL it prints, e.g.
# http://127.0.0.1:18789/src/widget.html?host=127.0.0.1&port=18789&hal_ws=ws://127.0.0.1:18789/ws
```

`gateway:demo` starts the **reference gateway** (`examples/gateway.mjs`) and
emits a simulated thinking → reply → success cycle. The face should react
immediately. Stop it with Ctrl+C.

Then drive it yourself — one HTTP call per event:

```bash
curl -X POST http://127.0.0.1:18789/internal/notify \
  -H 'Content-Type: application/json' \
  -d '{"event":"agent.message.start","payload":{"content":"Reading the repo…"}}'

curl -X POST http://127.0.0.1:18789/internal/notify \
  -H 'Content-Type: application/json' \
  -d '{"event":"agent.message.delta","payload":{"content":"Done: 3 files.","done":true}}'

curl -X POST http://127.0.0.1:18789/internal/notify \
  -H 'Content-Type: application/json' \
  -d '{"event":"agent.message.complete","payload":{"content":"Done: 3 files."}}'
```

That is the whole contract. No SDK, no framework, no coupling to a model.

## Architecture

```
your agent ──POST /internal/notify──▶ gateway ──WebSocket──▶ OtaClaw face
OtaClaw face ──tickle / chat────────▶ gateway ──POST──────▶ your agent
```

- The **face** connects to the gateway's `/ws`.
- The **gateway** broadcasts events to every connected face.
- Your **agent** never talks to the face directly. It posts events, and it
  receives interactions on an optional webhook.

## Events (cheat sheet)

Payloads are free-form; the face reads `content`, `message`, `bubble`, `summary`
and `state`. `content` is the full reply (logs/your chat); `bubble`/`summary` is
the one short line the avatar shows (≤100 chars). Without it, the face uses the
first sentence. Full policy: [SPEECH.md](SPEECH.md).

| Event | State | Typical payload |
|---|---|---|
| `agent.message.start` | thinking | `{ "content": "Reading…" }` |
| `agent.message.delta` | processing | `{ "content": "partial text", "done": false }` |
| `agent.message.complete` | success | `{ "content": "final reply" }` |
| `agent.message.error` | error | `{ "content": "what failed" }` |
| `agent.tool.call` | tool / surprised | `{ "tool": "search", "content": "Searching…" }` |
| `gateway.idle` | idle | `{}` |
| `agent.signal` | any state | `{ "signal": "🤔" }` (emoji or state name) |
| `agent.sprite` | that exact asset / tool | `{ "sprite": "wink_right" }`, `{ "sprite": "4,3" }`, `{ "sprite": "search" }` |

`agent.sprite` is the 1:1 asset selector (Vibeconferencing-style): every Hal frame
has a stable id/emoji in `src/data/sprite-functions.json`; tools map to a state
sequence. Full table: [SPRITE-FUNCTIONS.md](SPRITE-FUNCTIONS.md).

Events also work while the face is asleep: any `agent.*` / `gateway.*` event
quick-wakes it. No special wake call is needed.

Full details: [WEBSOCKET-PROTOCOL.md](WEBSOCKET-PROTOCOL.md) and
[STATE-SPRITES.md](STATE-SPRITES.md).

## Interactions: tickle and chat

The face emits `client.interaction { "action": "tickle" }` (and chat frames)
when the user touches/typing. Start the gateway with a webhook to receive them:

```bash
npm run gateway -- --agent-webhook http://127.0.0.1:3000/otaclaw
```

Your agent receives:

```json
{ "type": "tickle", "intensity": 50 }
{ "type": "chat", "message": "hello", "channel": "webchat" }
```

and answers by posting events back to `/internal/notify`. Tickle is optional:
if your agent ignores it, the face still laughs locally.

A minimal agent webhook (Node, any framework):

```js
app.post('/otaclaw', async (req, res) => {
  res.sendStatus(204); // answer fast; stream events separately
  await notify('agent.message.start', { content: 'On it…' });
  const reply = await myAgent(req.body); // your existing agent
  await notify('agent.message.delta', { content: reply, done: true });
  await notify('agent.message.complete', {
    content: reply,                       // full text (logs/your chat)
    bubble: reply.split(/[.!?]/)[0],      // one short line for the avatar
  });
});

async function notify(event, payload) {
  await fetch('http://127.0.0.1:18789/internal/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, payload }),
  });
}
```

The same `notify()` is the whole Discord/WhatsApp/Telegram integration: call it
where you already send messages. Nothing else is required.

### Discord, in practice

In your existing Discord handler, around the model call you already have:

```js
await notify('agent.message.start', { content: text });
const reply = await myAgent(text);          // your existing pipeline
await message.channel.send(reply);          // your existing Discord send
await notify('agent.message.complete', { content: reply });
```

No OtaClaw-specific code in the bot, no extra port: just those two calls.
Tickle/chat interactions are optional and arrive on the agent webhook above.

> **Bot etiquette (your side).** Only forward events for messages your agent
> actually answers. DMs are directed by nature; in shared guild channels require
> a mention/reply or an explicit allowlist (the Discord example can opt channels
> in). OtaClaw has no channel gate and should not grow one: that belongs to your
> agent.

## Use your own gateway

If you already have a WebSocket server, skip `examples/gateway.mjs` and speak
the protocol yourself:

1. Accept WebSocket connections on `/ws`.
2. Answer `{ "type": "req", "method": "connect" }` with
   `{ "type": "res", "id": "...", "ok": true, "protocolVersion": 3 }`.
3. Broadcast `{ "type": "event", "event": "agent.message.start", "payload": {} }`
   shapes from above.
4. Point the widget at it:
   `widget.html?host=<HOST>&port=<PORT>&hal_ws=ws://<HOST>:<PORT>/ws`.

The reference gateway is ~350 lines and only uses Node + `ws`; it is meant to be
read and replaced, not depended on.

## Ports and safety

- Default bind: `127.0.0.1:18789` (localhost only). Use `--host 0.0.0.0` only
  on a trusted LAN; there is no authentication.
- Static files are served from the repository root, so the same process serves
  the face and the gateway.
- `config/config.js` is optional; without it the face uses
  `config/config.example.js`.
- No secrets, no inference, no channel writes: the gateway only moves events.

## Cost

OtaClaw adds **no inference and no tokens**: the face and the reference gateway
are local, and a conversation watcher (if you use one) is read-only. Your agent
pays only for its own turns. There is **no OtaClaw skill, toolset or prompt** to
install; the only optional contract is the `bubble`/`summary` field if you want
to control the avatar's one-line voice.

Server-side tickle turns are opt-in; the default is a local canned reaction.

## Why this shape

- **BYOA:** you keep your model, tools and memory; the face is replaceable.
- **Plug and play:** one `npm run gateway:demo`, one `POST` per event.
- **Composable:** the same events work for a Pi kiosk, a floating HUD, an
  iframe, or all at once.
