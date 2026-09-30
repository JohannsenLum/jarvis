import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mac, validMac } from '../office/security.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function unusedPort() {
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port;
}
function request(port, route, {method = 'GET', headers = {}, body} = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port, path: route, method, headers, timeout: 5000}, res => {
      let text = ''; res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, text}));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout'))); req.end(body);
  });
}

test('dashboard enforces browser and hook boundaries with dummy local data', {timeout: 20000}, async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-dashboard-'));
  const root = path.join(home, 'instance'), vault = path.join(root, 'knowledge'); fs.mkdirSync(vault, {recursive: true});
  fs.writeFileSync(path.join(vault, 'now.md'), '# Focus\nDummy context');
  fs.writeFileSync(path.join(home, 'outside.md'), 'PRIVATE-DUMMY-MARKER');
  fs.symlinkSync(path.join(home, 'outside.md'), path.join(vault, 'alias.md'));
  const port = await unusedPort();
  const child = spawn(process.execPath, [path.join(repo, 'office/server.mjs'), '--root', root, '--port', String(port), '--tmux', 'ci-does-not-exist'],
    {env: {HOME: home, PATH: process.env.PATH, TMPDIR: os.tmpdir()}, stdio: ['ignore', 'pipe', 'pipe']});
  let output = ''; child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
  t.after(async () => {
    if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped; }
    fs.rmSync(home, {recursive: true, force: true});
  });
  const tokenPath = path.join(home, '.jarvis-office/ui-token');
  for (let i = 0; i < 100 && !fs.existsSync(tokenPath); i++) { assert.equal(child.exitCode, null, output); await delay(50); }
  assert.ok(fs.existsSync(tokenPath), output);
  const token = fs.readFileSync(tokenPath, 'utf8');
  assert.equal(fs.statSync(tokenPath).mode & 0o777, 0o600);
  const landing = await request(port, '/');
  assert.equal(landing.status, 200); assert.ok(!landing.text.includes(token));
  assert.equal(landing.headers['x-frame-options'], 'DENY');
  assert.match(landing.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal((await request(port, '/', {headers: {host: `attacker.example:${port}`}})).status, 403);
  assert.equal((await request(port, '/stream?t=wrong')).status, 403);
  assert.equal((await request(port, '/api/graph')).status, 403);
  const note = `/api/note?t=${token}&path=now.md`;
  assert.equal((await request(port, note)).status, 200);
  assert.equal((await request(port, note, {headers: {origin: 'https://attacker.example'}})).status, 403);
  assert.equal((await request(port, `/api/note?t=${token}&path=alias.md`)).status, 400);
  assert.equal((await request(port, `/api/note?t=${token}&path=../outside.md`)).status, 400);
  const graph = await request(port, `/api/graph?t=${token}`);
  assert.ok(!graph.text.includes('PRIVATE-DUMMY-MARKER')); assert.ok(!graph.text.includes('alias.md'));
  assert.equal((await request(port, '/api/send', {method: 'POST', body: '{}'})).status, 403);
  const auth = {'x-office-token': token, 'content-type': 'application/json'};
  assert.equal((await request(port, '/api/send', {method: 'POST', headers: auth, body: '{'})).status, 400);
  assert.equal((await request(port, '/api/send', {method: 'POST', headers: auth, body: 'x'.repeat(1024 * 1024 + 1)})).status, 413);
  fs.unlinkSync(path.join(vault, 'now.md'));
  fs.symlinkSync(path.join(home, 'outside.md'), path.join(vault, 'now.md'));
  const stream = await fetch(`http://127.0.0.1:${port}/stream?t=${token}`);
  const reader = stream.body.getReader(); let event = '';
  while (!event.includes('\n\n')) { const chunk = await reader.read(); event += new TextDecoder().decode(chunk.value); }
  assert.ok(!event.includes('PRIVATE-DUMMY-MARKER'));
  await reader.cancel(); await delay(30);
  const secret = fs.readFileSync(path.join(home, '.jarvis-office/hook-token'), 'utf8');
  const nonce = 'a'.repeat(48), at = String(Date.now()), body = JSON.stringify({tool_name: 'Read', tool_input: {file_path: 'dummy.md'}});
  const headers = {'x-jarvis-nonce': nonce, 'x-jarvis-time': at, 'x-jarvis-signature': mac(secret, 'request', nonce, at, body)};
  const hook = await request(port, '/hook/permission', {method: 'POST', headers, body});
  assert.equal(hook.status, 200);
  const answer = JSON.parse(hook.text); assert.equal(answer.decision, null); // No watching browser: ask in terminal.
  assert.ok(validMac(answer.signature, mac(secret, 'response', nonce, null)));
  assert.equal((await request(port, '/hook/permission', {method: 'POST', headers, body})).status, 403); // Replay.
  assert.equal((await request(port, '/hook/permission', {method: 'POST', headers: {authorization: `Bearer ${secret}`}, body})).status, 403);
});

test('approval hook accepts only signed decisions bound to its nonce', {timeout: 10000}, async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-hook-'));
  const dir = path.join(home, '.jarvis-office'); fs.mkdirSync(dir); const secret = 'c'.repeat(48);
  fs.writeFileSync(path.join(dir, 'hook-token'), secret);
  let leaked = false, mode = 'unsigned';
  const server = http.createServer((req, res) => {
    leaked = JSON.stringify(req.headers).includes(secret);
    req.resume();
    const nonce = mode === 'wrong-nonce' ? 'wrong' : req.headers['x-jarvis-nonce'];
    const signature = mode === 'unsigned' ? undefined : mac(secret, 'response', nonce, 'allow');
    res.end(JSON.stringify({decision: 'allow', signature}));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  fs.writeFileSync(path.join(dir, 'port'), String(server.address().port));
  t.after(() => { server.close(); fs.rmSync(home, {recursive: true, force: true}); });
  for (mode of ['unsigned', 'wrong-nonce', 'valid']) {
  const child = spawn(process.execPath, [path.join(repo, 'office/permission-hook.mjs')], {env: {HOME: home, PATH: process.env.PATH}, stdio: ['pipe', 'pipe', 'pipe']});
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = ''; child.stdout.on('data', c => { output += c; });
  child.stdin.end('{"tool_name":"Read"}'); await once(child, 'exit');
  if (mode === 'valid') assert.equal(JSON.parse(output).hookSpecificOutput.decision.behavior, 'allow');
  else assert.equal(output, '');
  assert.equal(leaked, false);
  }
});
