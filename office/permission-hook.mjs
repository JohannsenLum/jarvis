#!/usr/bin/env node
// Fail back to Claude's terminal prompt unless an authenticated dashboard returns a decision.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { MAX_BODY, mac, validMac } from './security.mjs';

const dir = path.join(os.homedir(), '.jarvis-office');
let input = '', size = 0;
const deadline = setTimeout(() => process.exit(0), 115000);
deadline.unref();
process.stdin.on('error', () => process.exit(0));
process.stdin.on('data', chunk => {
  size += chunk.length;
  if (size > MAX_BODY) process.exit(0);
  input += chunk;
});
process.stdin.on('end', () => {
  let token, port;
  try {
    token = fs.readFileSync(path.join(dir, 'hook-token'), 'utf8').trim();
    port = Number(fs.readFileSync(path.join(dir, 'port'), 'utf8').trim());
    if (!/^[a-f0-9]{48}$/.test(token) || !Number.isInteger(port) || port < 1 || port > 65535) process.exit(0);
  } catch { process.exit(0); }
  const raw = input || '{}', nonce = crypto.randomBytes(24).toString('hex'), at = String(Date.now());
  const req = http.request({ host: '127.0.0.1', port, path: '/hook/permission', method: 'POST', timeout: 115000,
    headers: { 'content-type': 'application/json', 'x-jarvis-nonce': nonce, 'x-jarvis-time': at,
      'x-jarvis-signature': mac(token, 'request', nonce, at, raw) } }, res => {
    if (res.statusCode !== 200) { res.resume(); process.exit(0); }
    let response = '', bytes = 0;
    res.on('error', () => process.exit(0));
    res.on('data', chunk => { bytes += chunk.length; if (bytes > 4096) process.exit(0); response += chunk; });
    res.on('end', () => {
      try {
        const { decision, signature } = JSON.parse(response);
        if ((decision === 'allow' || decision === 'deny') && validMac(signature, mac(token, 'response', nonce, decision))) {
          const out = { behavior: decision };
          if (decision === 'deny') out.message = 'Denied from the Jarvis Office dashboard.';
          process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: out } }));
        }
      } catch { /* Malformed or unsigned responses never authorize an operation. */ }
      process.exit(0);
    });
  });
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(raw);
});
