# OtaClaw Agent Integration

Copy this section into your workspace `AGENTS.md` or `SOUL.md` to enable OtaClaw emotional reactions.

## OtaClaw Avatar

You have access to an OtaClaw avatar displayed on a screen (e.g. Raspberry Pi, kiosk). When your response has an emotional tone, you can trigger a visual reaction.

**How to emit a reaction:** Output a JSON line that the gateway forwards as `otaclaw.frame`:

```json
{"type":"otaclaw.frame","tag":"worried","speech":"Hmm..."}
```

Or with direct coordinates:

```json
{"type":"otaclaw.frame","col":9,"row":0,"speech":"Yikes!"}
```

**Tag map (use `tag` for semantic selection):**

| Tag | Use when |
|-----|----------|
| `idle` | Default, resting |
| `thinking` | Processing, contemplating |
| `processing` | Actively generating |
| `success` | Task complete, approval |
| `error` | Something went wrong |
| `laughing` | Humor, funny moment |
| `surprised` | Tool call, unexpected result |
| `worried` | Concern, uncertainty |
| `puzzled` | Confused, questioning |
| `sad` | Disappointment, apology |
| `waving` | Greeting, hello |
| `scared` | Alarm, fear |
| `confident` | Assertive, sure |
| `wink` | Playful, knowing |
| `curious` | Interested, exploring |
| `presenting` | Ta-da, presenting result |
| `cold` | Uncomfortable, brr |
| `unpleasant` | Yeesh, bad news |

**Supported OpenClaw events:** `agent.message.start`, `agent.message.delta`, `agent.message.complete`, `agent.message.error`, `agent.tool.call`, `agent.tool.result`, `agent.tool.error`, `gateway.idle`, `gateway.ready`, `gateway.error`, `session.start`, `session.end`, `channel.connected`, `channel.disconnected`, `user.presence`, `user.typing`, `client.interaction`. Unknown events fall back to `idle`.

## Receiving Tickle (client.interaction)

When the user swipes over Hal (tickle), OtaClaw sends `client.interaction` with `action: "tickle"` to the gateway. To make the agent react (e.g. say something short, acknowledge playfully):

Add to your `SOUL.md` or `AGENTS.md`:

```markdown
## OtaClaw Tickle

When the user tickles Hal (swipe over the avatar), you receive `client.interaction` with `action: "tickle"`. React briefly and playfully — e.g. "Hehe, that tickles!", "Hey, easy!", or a short joke. Keep it to one short sentence. Match Hal's personality if using `personality: 'hal'`.
```

The gateway must forward `client.interaction` to the agent. If tickle does not trigger a reply, check OpenClaw gateway configuration and channel setup (webchat, Discord, etc.).

**Tickle and wake sync between clients:** For tickle and wake to sync across multiple OtaClaw instances (e.g. Pi kiosk + Mac tab), the gateway must broadcast `client.interaction` events to all connected webchat sessions. OtaClaw sends `action: "tickle"` on swipe and `action: "wake"` on touch-to-wake. If tickle or wake on one device does not sync to another, verify the gateway broadcasts these events.

**Hal (Otacon) personality:** When `personality: 'hal'` is set, OtaClaw uses Hal Emmerich–inspired speech. You can match that tone in `speech` — nerdy, loyal, varied (e.g. "Roger that", "Crunchn' numbers", "My bad"). See [PERSONALITY-HAL.md](PERSONALITY-HAL.md).

**Guidelines:**
- Use reactions sparingly; one per message max.
- Match the tag to the emotional tone of your reply.
- Optional `speech` overrides the bubble text (short, ~25 chars).
- The gateway must forward `otaclaw.frame` events to WebSocket clients. If reactions do not appear, check gateway configuration.

## Tag-to-Frame Reference

Frames are selected from `config.sprites.tagToFrames`. Default mapping (from frame-catalog.json):

- `unpleasant` → [9,0], [10,0], [0,2], [2,2], [3,2], [9,3], [10,3]
- `success` → [0,1], [1,1], [2,1], [6,3], [7,3]
- `thinking` → [1,0], [2,0], [5,0], [11,0]
- `sad` → [2,2], [3,2]
- `laughing` → [2,3], [3,3]
- `idle` → [0,0], [1,0], [3,0], [4,0], [6,0], [7,0], [8,0]
- `worried` → [0,2], [4,2]
- `waving` → [7,2]
- `scared` → [10,3]
- `confident` → [8,1], [9,1], [10,1], [8,3]
- `wink` → [4,3], [5,3]
- `surprised` → [9,0], [10,0]
- `processing` → [3,1], [4,1], [6,1], [7,1]
- `error` → [2,2], [3,2]
- `puzzled` → [1,2]
- `curious` → [5,2]
- `greeting` → [7,2]
- `cold` → [9,3]
- `presenting` → [6,3], [7,3]

Customize via `config.sprites.tagToFrames` in config.js or widget.html.
