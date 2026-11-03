#!/usr/bin/env node
/**
 * OtaClaw reference gateway (Bring Your Own Agent).
 *
 * This is NOT an inference server. It is the smallest useful bridge:
 *
 *   your agent ──POST /internal/notify──▶ gateway ──WebSocket──▶ OtaClaw face
 *   OtaClaw face ──tickle/chat──▶ gateway ──POST──▶ your agent (--agent-webhook)
 *
 * It also serves the static app, so one command gives you a working face:
 *
 *   npm install
 *   npm run gateway:demo
 *   # open http://127.0.0.1:18789/src/widget.html?host=127.0.0.1&port=18789&hal_ws=ws://127.0.0.1:18789/ws
 *
 * Options:
 *   --port 18789             HTTP + WebSocket port
 *   --host 127.0.0.1         bind address (use 0.0.0.0 to expose on the LAN)
 *   --demo                   emit a simulated agent cycle every 3s
 *   --agent-webhook URL      POST tickle/chat events to your agent
 *
 * No dependencies beyond `ws` and the Node standard library.
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};

const PORT = parseInt(process.env.OTACLAW_PORT || value('--port', '18789'), 10);
const HOST = process.env.OTACLAW_HOST || String(value('--host', '127.0.0.1'));
const DEMO = has('--demo');
const AGENT_WEBHOOK =
  process.env.OTACLAW_AGENT_WEBHOOK || String(value('--agent-webhook', '') || '');
const PUBLIC_HOST = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.md': 'text/markdown; charset=utf-8',
};

const clients = new Set();

function broadcast(frame) {
  const raw = JSON.stringify(frame);
  for (const ws of clients) if (ws.readyState === 1) ws.send(raw);
}

function emit(event, payload = {}) {
  broadcast({ type: 'event', event, payload });
}

/** POST JSON to the agent webhook without blocking the face. */
function postJson(url, body) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return resolve();
    }
    const lib = target.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = lib.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        res.resume();
        res.on('end', resolve);
      },
    );
    req.on('error', () => resolve());
    req.end(data);
  });
}

/** Hand an inbound interaction to the agent. The agent answers with events. */
function toAgent(payload) {
  if (AGENT_WEBHOOK) {
    postJson(AGENT_WEBHOOK, payload);
    return;
  }
  console.log('[gateway] agent event (no --agent-webhook):', JSON.stringify(payload).slice(0, 300));
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = pathname;
  if (rel === '/' || rel === '') {
    res.writeHead(302, { Location: '/src/index.html' });
    return res.end();
  }
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const noCache = rel.startsWith('/src/') || rel.startsWith('/config/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      ...(noCache ? { 'Cache-Control': 'no-store, no-cache, must-revalidate' } : {}),
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'otaclaw-reference-gateway',
      clients: clients.size,
      demo: DEMO,
      agentWebhook: AGENT_WEBHOOK || null,
    });
  }

  if (req.method === 'GET' && url.pathname === '/ws-status') {
    return sendJson(res, 200, { status: 'ok', clients: clients.size });
  }

  // The public BYOA contract: any process can push one event here.
  if (req.method === 'POST' && url.pathname === '/internal/notify') {
    let parsed;
    try {
      parsed = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return sendJson(res, 400, { error: 'invalid JSON body' });
    }
    const { event, payload } = parsed || {};
    if (!event || typeof event !== 'string') {
      return sendJson(res, 400, { error: 'missing "event" string field' });
    }
    emit(event, payload && typeof payload === 'object' ? payload : {});
    return sendJson(res, 200, { ok: true, clients: clients.size });
  }

  // Optional convenience hook: your agent owns the reply, not this gateway.
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    let parsed;
    try {
      parsed = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return sendJson(res, 400, { error: 'invalid JSON body' });
    }
    const message = String(parsed?.message || '').trim();
    if (!message) return sendJson(res, 400, { error: 'missing message' });
    toAgent({ type: 'chat', message, channel: parsed.channel || 'webchat' });
    return sendJson(res, 202, { ok: true, forwarded: true });
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res, decodeURIComponent(url.pathname));
  }

  return sendJson(res, 404, { error: 'not found' });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[gateway] client connected (${clients.size})`);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'req') {
      if (msg.method === 'connect') {
        ws.send(
          JSON.stringify({
            type: 'res',
            id: msg.id,
            ok: true,
            protocolVersion: 3,
            gateway: 'otaclaw-reference',
          }),
        );
        return;
      }
      if (msg.method === 'send') {
        const text = String(msg.params?.message || '').trim();
        ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true }));
        if (text) {
          toAgent({ type: 'chat', message: text, channel: msg.params?.channel || 'webchat' });
        }
        return;
      }
      ws.send(
        JSON.stringify({
          type: 'res',
          id: msg.id,
          ok: false,
          error: { message: `unknown method: ${msg.method}` },
        }),
      );
      return;
    }

    if (
      msg.type === 'tickle' ||
      (msg.type === 'client.interaction' && msg.action === 'tickle')
    ) {
      const intensity = Math.max(1, Math.min(100, parseInt(msg.intensity || 50, 10) || 50));
      ws.send(
        JSON.stringify({
          type: 'tickle',
          ok: true,
          intensity,
          message: '😂 haha...',
          reaction: 'Haha! That tickles!',
        }),
      );
      // Sync the interaction to other faces (Pi kiosk <-> tab).
      broadcast(msg);
      toAgent({ type: 'tickle', intensity });
      return;
    }

    if (msg.type === 'client.refresh') {
      emit('gateway.idle', {});
      return;
    }

    if (msg.type === 'client.interaction') {
      broadcast(msg);
      return;
    }

    if (msg.type === 'chat') {
      const text = String(msg.message || '').trim();
      if (!text) return;
      ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true }));
      toAgent({ type: 'chat', message: text, channel: msg.channel || 'webchat' });
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[gateway] client closed (${clients.size})`);
  });
  ws.on('error', () => clients.delete(ws));
});

// Keep the client's staleness detector quiet when nothing is happening.
setInterval(() => {
  if (clients.size) emit('gateway.heartbeat', { ts: Date.now() });
}, 30000).unref();

const DEMO_STEPS = [
  ['agent.message.start', { content: 'Listening…' }],
  ['agent.message.delta', { content: 'Thinking…', done: false }],
  ['agent.message.delta', { content: 'Here is the sample reply.', done: true }],
  ['agent.message.complete', { content: 'Here is the sample reply.' }],
  ['agent.tool.call', { tool: 'search', content: 'Searching…' }],
  ['gateway.idle', {}],
];

function startDemo() {
  let i = 0;
  const tick = () => {
    const [event, payload] = DEMO_STEPS[i % DEMO_STEPS.length];
    emit(event, { ...payload, ts: Date.now() });
    i += 1;
  };
  tick();
  setInterval(tick, 3000).unref();
  console.log('[gateway] demo on: simulated agent cycle every 3s');
}

server.listen(PORT, HOST, () => {
  console.log(`[gateway] listening on http://${PUBLIC_HOST}:${PORT}`);
  console.log(
    `[gateway] widget: http://${PUBLIC_HOST}:${PORT}/src/widget.html?host=${PUBLIC_HOST}&port=${PORT}&hal_ws=ws://${PUBLIC_HOST}:${PORT}/ws`,
  );
  console.log(
    `[gateway] notify: POST http://${PUBLIC_HOST}:${PORT}/internal/notify {"event":"agent.message.delta","payload":{"content":"hello"}}`,
  );
  if (AGENT_WEBHOOK) console.log(`[gateway] agent webhook: ${AGENT_WEBHOOK}`);
  if (DEMO) startDemo();
  else console.log('[gateway] tip: add --demo (or npm run gateway:demo) to see the face react now');
});
