# OtaClaw API Documentation

Complete API reference for OtaClaw integration and customization.

## Table of Contents

- [WebSocket Protocol](#websocket-protocol)
- [Event System](#event-system)
- [JavaScript API](#javascript-api)
- [Configuration API](#configuration-api)
- [State Management](#state-management)
- [Touch/Gesture API](#touchgesture-api)

## WebSocket Protocol

### Connection

OtaClaw connects to OpenClaw Gateway via WebSocket:

```
ws://{host}:{port}{wsPath}
```

Default: `ws://localhost:18789/ws`

### Message Format

All messages are JSON-encoded:

```typescript
interface WebSocketMessage {
  type: string;           // Event type
  timestamp: number;      // Unix timestamp (ms)
  data?: any;            // Optional payload
}
```

### Client → Server Messages

#### Handshake

```javascript
{
  type: 'client.connect',
  client: 'otaclaw',
  version: '1.0.0',
  timestamp: 1699900000000
}
```

#### Ping/Keepalive

```javascript
{
  type: 'client.ping',
  timestamp: 1699900000000
}
```

#### State Refresh Request

```javascript
{
  type: 'client.refresh',
  timestamp: 1699900000000
}
```

#### User Interaction

```javascript
{
  type: 'client.interaction',
  action: 'tap' | 'doubleTap' | 'longPress' | 'tickle' | 'wake',
  position?: { x: number, y: number },
  timestamp: 1699900000000
}
```

- `tickle`: User swiped over Hal; agent can react playfully (see OTACLAW-AGENT.md).
- `wake`: User touched to wake from sleep; broadcast so other clients (kiosk/tab) sync.

### Server → Client Messages

#### Agent Events

```javascript
// Message started
{
  type: 'agent.message.start',
  timestamp: 1699900000000,
  data: {
    agentId: 'main',
    messageId: 'msg_123',
    channel: 'webchat'
  }
}

// Streaming response
{
  type: 'agent.message.delta',
  timestamp: 1699900000000,
  data: {
    messageId: 'msg_123',
    content: 'partial text...',
    chunk: 5
  }
}

// Response complete
{
  type: 'agent.message.complete',
  timestamp: 1699900000000,
  data: {
    messageId: 'msg_123',
    totalChunks: 42
  }
}

// Error occurred
{
  type: 'agent.message.error',
  timestamp: 1699900000000,
  data: {
    messageId: 'msg_123',
    error: 'Error message',
    code: 'ERROR_CODE'
  }
}
```

#### Tool Events

```javascript
// Tool called
{
  type: 'agent.tool.call',
  timestamp: 1699900000000,
  data: {
    tool: 'web_search',
    parameters: { query: '...' }
  }
}

// Tool result
{
  type: 'agent.tool.result',
  timestamp: 1699900000000,
  data: {
    tool: 'web_search',
    result: '...'
  }
}

// Tool error
{
  type: 'agent.tool.error',
  timestamp: 1699900000000,
  data: {
    tool: 'web_search',
    error: '...'
  }
}
```

#### Gateway Events

```javascript
// Gateway ready
{
  type: 'gateway.ready',
  timestamp: 1699900000000,
  data: {
    version: '1.0.0',
    uptime: 3600
  }
}

// Gateway idle
{
  type: 'gateway.idle',
  timestamp: 1699900000000,
  data: {
    lastActivity: 1699900000000
  }
}

// Gateway error
{
  type: 'gateway.error',
  timestamp: 1699900000000,
  data: {
    error: 'Error message'
  }
}
```

## Event System

### Subscribing to Events

```javascript
import { otaclaw } from './js/otaclaw.js';

// Subscribe to state changes
const unsubscribe = otaclaw.on('stateChange', (data) => {
  console.log(`State: ${data.previousState} → ${data.state}`);
});

// Later: unsubscribe
unsubscribe();
```

### Available Events

#### OtaClaw Engine Events

| Event | Payload | Description |
|-------|---------|-------------|
| `initialized` | `null` | Engine initialized |
| `stateChange` | `{ state, previousState, trigger, data }` | State changed |
| `tap` | `{ x, y }` | Screen tapped |
| `doubleTap` | `{ x, y }` | Screen double-tapped |
| `longPress` | `{ x, y }` | Long press detected |

#### WebSocket Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connecting` | `null` | Connecting to server |
| `connected` | `null` | Successfully connected |
| `disconnected` | `{ code, reason }` | Connection closed |
| `reconnecting` | `{ attempt, maxAttempts, delay }` | Reconnect scheduled |
| `message` | `any` | Raw message received |
| `error` | `Error` | Connection error |
| `stateChange` | `{ state, trigger, data }` | State change triggered |

### Custom Events

```javascript
// Emit custom event
otaclaw.emit('customEvent', { custom: 'data' });

// Subscribe to custom event
otaclaw.on('customEvent', (data) => {
  console.log('Custom event:', data);
});
```

## JavaScript API

### OtaClawEngine

#### Constructor

```javascript
import { OtaClawEngine } from './js/otaclaw.js';

const otaclaw = new OtaClawEngine(config);
```

#### Methods

##### init()

Initialize the engine and bind to DOM.

```javascript
otaclaw.init();
```

Returns: `void`

##### setState(state, options)

Set emotional state.

```javascript
otaclaw.setState('thinking', {
  trigger: 'manual',
  data: { custom: 'data' },
  force: false  // Set to true to force same state
});
```

Parameters:
- `state` (string): Target state
- `options` (object, optional):
  - `trigger` (string): What triggered the change
  - `data` (any): Additional data
  - `force` (boolean): Force change even if same state

Returns: `boolean` - Whether state was changed

##### getState()

Get current state.

```javascript
const state = otaclaw.getState();
console.log(state); // 'idle', 'thinking', etc.
```

Returns: `string` - Current state

##### getPreviousState()

Get previous state.

```javascript
const prev = otaclaw.getPreviousState();
```

Returns: `string | null` - Previous state or null

##### transitionTo(state, duration)

Transition to state with animation.

```javascript
otaclaw.transitionTo('success', 300);
```

Parameters:
- `state` (string): Target state
- `duration` (number): Transition duration in ms

Returns: `void`

##### getHistory()

Get state change history.

```javascript
const history = otaclaw.getHistory();
// [
//   { state: 'success', previousState: 'processing', timestamp: 1699900000000, ... },
//   { state: 'processing', previousState: 'thinking', timestamp: 1699900000000, ... }
// ]
```

Returns: `Array<HistoryEntry>`

##### clearHistory()

Clear state history.

```javascript
otaclaw.clearHistory();
```

##### getStats()

Get engine statistics.

```javascript
const stats = otaclaw.getStats();
// {
//   currentState: 'idle',
//   previousState: 'thinking',
//   isInitialized: true,
//   soundsEnabled: false,
//   historyLength: 10,
//   config: { ... }
// }
```

Returns: `Object`

##### destroy()

Clean up and destroy engine.

```javascript
otaclaw.destroy();
```

#### Event Methods

##### on(event, handler)

Subscribe to event.

```javascript
const unsubscribe = otaclaw.on('stateChange', handler);
```

Parameters:
- `event` (string): Event name
- `handler` (function): Event handler

Returns: `Function` - Unsubscribe function

##### off(event, handler)

Unsubscribe from event.

```javascript
otaclaw.off('stateChange', handler);
```

##### emit(event, data)

Emit event.

```javascript
otaclaw.emit('customEvent', data);
```

### WebSocketClient

#### Constructor

```javascript
import { WebSocketClient } from './js/websocket-client.js';

const client = new WebSocketClient(config);
```

#### Methods

##### connect()

Connect to WebSocket server.

```javascript
await client.connect();
```

Returns: `Promise<void>`

##### disconnect()

Disconnect from server.

```javascript
client.disconnect();
```

##### reconnect()

Reconnect to server.

```javascript
client.reconnect();
```

##### send(message)

Send message to server.

```javascript
client.send({ type: 'client.ping' });
```

Parameters:
- `message` (object | string): Message to send

Returns: `boolean` - Whether message was sent

##### getStats()

Get connection statistics.

```javascript
const stats = client.getStats();
// {
//   isConnected: true,
//   isConnecting: false,
//   reconnectAttempts: 0,
//   uptime: 3600000,
//   queuedMessages: 0
// }
```

Returns: `Object`

#### Event Methods

Same as OtaClawEngine: `on()`, `off()`, `emit()`

## Configuration API

### Configuration Object

```typescript
interface OtaClawConfig {
  openclaw: {
    host: string;              // OpenClaw hostname/IP
    port: number;              // Gateway port
    wsPath: string;            // WebSocket path
    reconnectInterval: number; // Reconnect delay (ms)
    maxReconnectAttempts: number; // 0 = unlimited
    connectionTimeout: number; // Connection timeout (ms)
  };
  
  behavior: {
    idleTimeout: number;       // Auto-idle delay (ms)
    animations: boolean;         // Enable CSS animations
    sounds: boolean;             // Enable sounds
    touchEnabled: boolean;       // Enable touch
    debug: boolean;              // Enable debug panel
    showStatusBar: boolean;      // Show status bar
    autoHideOverlay: boolean;    // Auto-hide connection overlay
  };
  
  states: string[];              // Available states
  
  eventMap: {
    [eventName: string]: string; // Event → State mapping
  };
  
  stateDurations: {
    [state: string]: number;    // State duration (ms), 0 = infinite
  };
  
  sprites: {
    useCSS: boolean;             // Use CSS sprites
    basePath: string;            // Sprite base path
    format: string;              // Sprite format
    frames: { [state: string]: number }; // Frames per state
    fps: number;                 // Animation FPS
  };
  
  sounds: {
    basePath: string;            // Sound base path
    volume: number;              // Volume (0-1)
    files: { [state: string]: string | null }; // Sound files
  };
  
  touch: {
    tapEnabled: boolean;         // Enable tap
    swipeEnabled: boolean;       // Enable swipe
    debounceTime: number;        // Tap debounce (ms)
    longPressDuration: number;   // Long press time (ms)
  };
  
  display: {
    fullscreen: boolean;         // Fullscreen mode
    orientation: 'portrait' | 'landscape' | null;
    preventSleep: boolean;       // Prevent screen sleep
    brightness: number;          // Brightness (0-100)
  };
  
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error' | 'none';
    console: boolean;            // Console logging
    remote: boolean;             // Remote logging
  };
}
```

## State Management

### Built-in States

| State | ID | Duration | Description |
|-------|-----|----------|-------------|
| Idle | `idle` | Infinite | Default resting state |
| Thinking | `thinking` | Infinite | Processing started |
| Processing | `processing` | Infinite | Generating response |
| Success | `success` | 3000ms | Response complete |
| Error | `error` | 5000ms | Error occurred |
| Laughing | `laughing` | 4000ms | Humor detected |
| Surprised | `surprised` | 2500ms | Unexpected event |

### State Lifecycle

```
Event → setState() → applyState() → [Auto-return to idle] → emit('stateChange')
```

### Custom States

Add custom states to config:

```javascript
states: ['idle', 'thinking', 'custom'],

stateDurations: {
  custom: 2000,  // 2 seconds
}
```

Create CSS for custom state:

```css
.state-custom .sprite {
  animation: custom-animation 1s infinite;
}
```

Trigger custom state:

```javascript
otaclaw.setState('custom', { trigger: 'custom.event' });
```

## Touch/Gesture API

### Touch Events

```javascript
// Tap (single click/touch)
otaclaw.on('tap', ({ x, y }) => {
  console.log(`Tapped at (${x}, ${y})`);
});

// Double tap
otaclaw.on('doubleTap', ({ x, y }) => {
  console.log(`Double tapped at (${x}, ${y})`);
});

// Long press
otaclaw.on('longPress', ({ x, y }) => {
  console.log(`Long pressed at (${x}, ${y})`);
  otaclaw.toggleDebugPanel();
});
```

### Touch Configuration

```javascript
{
  touch: {
    tapEnabled: true,
    swipeEnabled: false,      // Not yet implemented
    debounceTime: 300,         // Prevent double triggers
    longPressDuration: 800,    // Time for long press
  }
}
```

---

For integration examples, see the [README](../README.md) and [OPENCLAW-INTEGRATION.md](OPENCLAW-INTEGRATION.md).
