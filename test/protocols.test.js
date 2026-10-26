import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, copyFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { filterHar, summarizeHar } from '../src/network.js';

const fixtureUrl = new URL('./fixtures/protocols.har', import.meta.url);
const fixtureText = await readFile(fixtureUrl, 'utf8');
const fixture = JSON.parse(fixtureText);
const oneFamily = family => ({ log: { ...fixture.log, entries: fixture.log.entries.filter(e => e._fixtureFamily === family) } });

test('Firefox-style protocol fixtures preserve activity for seven families and exclude static assets', () => {
  const filtered = filterHar(fixture, { preset: 'activity', redact: false });
  assert.equal(filtered.log.entries.length, 13);
  assert.deepEqual([...new Set(filtered.log.entries.map(e => e._fixtureFamily))].sort(),
    ['Belatra', 'ELK', 'Games Global', 'Playson', 'Playtech', 'Push Gaming', 'RubyPlay']);
  assert.equal(fixture.log.entries.length, 15);
  assert.ok(filtered.log.entries.every(e => !('_resourceType' in e)), 'Firefox entries do not require Chromium extensions');
});

test('provider credentials are removed from form, XML, JSON, nested XML and the Socket.IO path', () => {
  const before = JSON.stringify(fixture);
  const filtered = filterHar(fixture);
  assert.ok(!JSON.stringify(filtered).includes('fixture-secret'), 'no synthetic credential survives redaction');
  assert.equal(JSON.stringify(fixture), before, 'filter must not mutate imported HAR');
  const pl = filtered.log.entries.find(e => e._fixtureFamily === 'Playson');
  assert.match(pl.request.postData.text, /command="bet"/);
  assert.match(pl.request.postData.text, /cash="1"/);
  const ruby = JSON.parse(filtered.log.entries.find(e => e._fixtureFamily === 'RubyPlay').request.postData.text);
  assert.equal(ruby.action, 'init');
  assert.equal(ruby.funModeData.gameId, 123);
});

test('metadata filtering strips all protocol bodies and WS frame data while retaining framing', () => {
  const out = filterHar(fixture, { preset: 'metadata' });
  for (const e of out.log.entries) {
    assert.equal(e.request.postData?.text, undefined);
    assert.equal(e.response.content?.text, undefined);
    for (const frame of e._webSocketMessages ?? []) assert.equal(frame.data, undefined);
  }
  const ws = out.log.entries.find(e => e._webSocketMessages?.length);
  assert.deepEqual(ws._webSocketMessages.map(f => f.opcode), [1, 2]);
});

test('summary distinguishes two WS handshakes from the two actually exported frames', () => {
  const summary = summarizeHar(fixture);
  assert.equal(summary.entries, 15);
  assert.equal(summary.http, 13);
  assert.equal(summary.webSockets, 2);
  assert.equal(summary.webSocketFrames, 2);
  assert.equal(summary.webSocketFrameEvidence, 'frames-present');
  const playtech = summarizeHar(oneFamily('Playtech'));
  assert.equal(playtech.webSockets, 1);
  assert.equal(playtech.webSocketFrames, 0);
  assert.equal(playtech.webSocketFrameEvidence, 'handshakes-only-or-no-exported-frames');
});

test('summary sniffs mislabeled Playson XML and JSON-wrapped Games Global XML', () => {
  const playson = summarizeHar(oneFamily('Playson')).endpoints.find(e => e.url.endsWith('/bet'));
  assert.equal(playson.requestSchema.format, 'xml');
  assert.ok(playson.requestSchema.elements.includes('client'));
  assert.ok(playson.responseSchema.elements.includes('server'));
  const elk = summarizeHar(oneFamily('ELK')).endpoints.find(e => e.url.endsWith('/purchase'));
  assert.equal(elk.requestSchema.format, 'xml');
  assert.ok(elk.responseSchema.elements.includes('response'));
  const gg = summarizeHar(oneFamily('Games Global')).endpoints.find(e => e.method === 'POST');
  assert.equal(gg.requestSchema.packet.payload.format, 'xml');
  assert.ok(gg.requestSchema.packet.payload.elements.includes('Request'));
});

test('summary preserves RubyPlay and Push schemas and exposes 202 HTML without claiming success', () => {
  const ruby = summarizeHar(oneFamily('RubyPlay'));
  assert.equal(ruby.endpoints[0].count, 2);
  assert.ok('funModeData' in ruby.endpoints[0].requestSchema);
  const push = summarizeHar(oneFamily('Push Gaming'));
  const spin = push.endpoints.find(e => e.url.endsWith('/actions-v2'));
  assert.equal(spin.requestSchema.bet, 'number');
  assert.equal(spin.responseSchema.actions.type, 'array');
  const buy = push.endpoints.find(e => e.url.endsWith('/buy-feature'));
  assert.equal(buy.statuses[202], 1);
  assert.equal(buy.responseSchema.format, 'xml');
  assert.ok(buy.responseSchema.elements.includes('html'));
});

test('offline HAR CLI hashes duplicates, reports schemas and emits no credentials or raw bodies', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'umcp-har-cli-'));
  try {
    const input = join(temp, 'input');
    await mkdir(input);
    await copyFile(fixtureUrl, join(input, 'protocols.har'));
    await copyFile(fixtureUrl, join(input, 'copy.har'));
    const output = join(temp, 'summary.json');
    const run = spawnSync(process.env.PYTHON || 'python3', [fileURLToPath(new URL('../scripts/analyze-hars.py', import.meta.url)), '--input', input, '--output', output], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const raw = await readFile(output, 'utf8');
    const summary = JSON.parse(raw);
    assert.equal(summary.totals.files, 2);
    assert.equal(summary.totals.unique_sha256_files, 1);
    assert.equal(summary.totals.entries_unique_files, 15);
    assert.ok(summary.files.some(f => f.duplicate_of));
    const first = summary.files.find(f => !f.duplicate_of);
    assert.equal(first.sha256, createHash('sha256').update(fixtureText).digest('hex'));
    assert.equal(first.ws_handshakes, 2);
    assert.equal(first.ws_frames, 2);
    const xml = first.endpoints.find(e => e.url === 'https://playson.example/bet');
    assert.equal(xml.request_encodings.xml, 1);
    assert.equal(xml.response_encodings.xml, 1);
    const nested = first.endpoints.find(e => e.url === 'https://gamesglobal.example/casino/play/public/v1/games/module/123/client/456/play');
    assert.ok('$.packet.payload::xml/Pkt/Request/@action' in nested.request_schema);
    assert.ok(!raw.includes('fixture-secret'));
    assert.ok(!raw.includes('<client'));
    assert.ok(!raw.includes('<Pkt'));
    assert.ok(!raw.includes('AAEC/w=='));
    assert.equal(await readFile(join(input, 'protocols.har'), 'utf8'), fixtureText);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('offline HAR CLI rejects output paths that would replace an input HAR', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'umcp-har-cli-'));
  try {
    const input = join(temp, 'protocols.har');
    await writeFile(input, fixtureText);
    const run = spawnSync(process.env.PYTHON || 'python3', [fileURLToPath(new URL('../scripts/analyze-hars.py', import.meta.url)), '--input', temp, '--output', input], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.equal(await readFile(input, 'utf8'), fixtureText);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
