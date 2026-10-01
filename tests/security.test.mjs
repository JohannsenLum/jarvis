import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { allowedRequest, safePage, readBody, mac, validMac } from '../office/security.mjs';

test('only exact local Host and Origin combinations are accepted', () => {
  assert.equal(allowedRequest({headers: {host: '127.0.0.1:3777'}}, 3777), true);
  assert.equal(allowedRequest({headers: {host: 'localhost:3777', origin: 'http://localhost:3777'}}, 3777), true);
  for (const host of ['evil.example:3777', '127.0.0.1.evil.example:3777', 'localhost:3778', undefined]) {
    assert.equal(allowedRequest({headers: {host}}, 3777), false);
  }
  for (const origin of ['null', 'https://evil.example', 'http://localhost:3777.evil.example']) {
    assert.equal(allowedRequest({headers: {host: 'localhost:3777', origin}}, 3777), false);
  }
});

test('vault page reads reject traversal, hidden files and symlinks', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-pages-'));
  t.after(() => fs.rmSync(tmp, {recursive: true, force: true}));
  const root = path.join(tmp, 'vault'); fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'note.md'), 'hello');
  fs.writeFileSync(path.join(tmp, 'outside.md'), 'outside');
  fs.symlinkSync(path.join(tmp, 'outside.md'), path.join(root, 'alias.md'));
  assert.equal(safePage(root, 'note.md'), fs.realpathSync(path.join(root, 'note.md')));   // macOS: /var is /private/var
  for (const rel of ['../outside.md', 'alias.md', '.hidden.md', '/outside.md', 'note.md/../note.md', '']) {
    assert.throws(() => safePage(root, rel));
  }
});

test('hook signatures bind direction, nonce, body and decision without disclosing the secret', () => {
  const secret = 'dummy-secret', nonce = 'dummy-nonce';
  const signature = mac(secret, 'request', nonce, '123', '{}');
  assert.ok(validMac(signature, mac(secret, 'request', nonce, '123', '{}')));
  assert.equal(validMac(signature, mac('wrong', 'request', nonce, '123', '{}')), false);
  assert.equal(validMac(signature, mac(secret, 'request', nonce, '123', '{"allow":true}')), false);
  assert.equal(validMac(signature, mac(secret, 'response', nonce, 'allow')), false);
  assert.equal(validMac(mac(secret, 'response', nonce, 'deny'), mac(secret, 'response', nonce, 'allow')), false);
  assert.equal(validMac('invalid', signature), false);
});

test('request body bounds bytes and rejects interrupted streams', async () => {
  const ok = new PassThrough(); const result = readBody(ok, 8); ok.end('{}'); assert.equal(await result, '{}');
  const large = new PassThrough(); const overflow = readBody(large, 3); large.end('éé');
  await assert.rejects(overflow, {status: 413});
  const aborted = new PassThrough(); const interrupted = readBody(aborted); aborted.emit('aborted');
  await assert.rejects(interrupted, /aborted/);
});
