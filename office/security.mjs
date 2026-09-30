// Trust-boundary helpers shared by the dashboard and its approval hook. No side effects.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_BODY = 1024 * 1024;
export function allowedRequest(req, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  return hosts.includes(req.headers.host) && (!req.headers.origin || hosts.some(h => req.headers.origin === `http://${h}`));
}
export function safeFile(root, rel, suffixes = ['.md']) {
  if (!root || typeof rel !== 'string' || !rel || path.isAbsolute(rel)) throw new Error('Not a vault page');
  const base = fs.realpathSync(root), parts = rel.split(/[\\/]/);
  if (parts.some(p => !p || p.startsWith('.'))) throw new Error('Not a vault page');
  let full = base;
  for (const part of parts) {
    full = path.join(full, part);
    if (fs.lstatSync(full).isSymbolicLink()) throw new Error('Vault symlinks are not supported');
  }
  full = fs.realpathSync(full);
  if (!full.startsWith(base + path.sep) || !suffixes.includes(path.extname(full).toLowerCase()) || !fs.statSync(full).isFile()) throw new Error('Not a vault page');
  return full;
}
export function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, settled = false;
    const fail = (message, status = 400) => {
      if (settled) return;
      settled = true; const error = new Error(message); error.status = status; reject(error);
    };
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) { fail('Request too large', 413); return; }
      chunks.push(chunk);
    });
    req.on('aborted', () => fail('Request aborted'));
    req.on('error', () => fail('Request failed'));
    req.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
  });
}
export function mac(secret, ...fields) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(fields)).digest('hex');
}
export function validMac(actual, expected) {
  return typeof actual === 'string' && /^[a-f0-9]{64}$/.test(actual) && crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export const safePage = (root, rel) => safeFile(root, rel);
