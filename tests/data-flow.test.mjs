import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import * as schema from '../db/schema.ts';
import {createDataHandlers} from '../lib/data-handlers.ts';

const request = body => new Request('https://school.example/api/data', {
  method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://school.example'}, body: JSON.stringify(body),
});

test('QR API persists attendance in PostgreSQL and safely handles repeated and concurrent scans', async t => {
  const pg = new PGlite();
  const db = drizzle(pg, {schema});
  const api = createDataHandlers({authorize: async () => true, database: () => db});
  const migration = await readFile(new URL('../migrations/0001_postgres.sql', import.meta.url), 'utf8');
  await pg.exec(migration);
  await pg.exec(migration); // The setup SQL must preserve data on repeat runs.
  try {
    await t.test('operator authorization is checked before accessing the database', async () => {
      const blocked = createDataHandlers({authorize: async () => false, database: () => {throw Error('must not access DB');}});
      assert.equal((await blocked.GET()).status, 401);
      assert.equal((await blocked.POST(request({action: 'attendance'}))).status, 401);
    });

    await t.test('malformed JSON is rejected as input rather than a database outage', async () => {
      const response = await api.POST(new Request('https://school.example/api/data', {method: 'POST', headers: {Origin: 'https://school.example', 'Content-Type': 'application/json'}, body: '{broken'}));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /JSON/);
    });

    await t.test('student and school setup returns usable QR identities', async () => {
      for (const [nis, name] of [['001', 'Siswa Uji A'], ['002', 'Siswa Uji B']]) {
        assert.equal((await api.POST(request({action: 'student', nis, nisn: '', gender: 'L', name, className: 'VII A'}))).status, 200);
      }
      assert.equal((await api.POST(request({action: 'settings', latitude: -7.9, longitude: 113.2, radius: 100}))).status, 200);
      const data = await (await api.GET()).json();
      assert.equal(data.students.length, 2);
      assert.match(data.students[0].token, /^[a-f0-9-]{36}$/);
      assert.equal(data.settings.radius, 100);
    });

    const data = await (await api.GET()).json();
    const [first, second] = data.students;
    const scan = student => ({action: 'attendance', method: 'QR', token: 'SANJARA:' + student.token, location: {latitude: -7.9, longitude: 113.2, accuracy: 10, timestamp: Date.now()}});

    await t.test('invalid, unknown, inaccurate and outside-school QR requests never save attendance', async () => {
      const invalid = {...scan(first), token: 'SANJARA:' + 'a'.repeat(36)};
      assert.equal((await api.POST(request(invalid))).status, 400);
      assert.equal((await api.POST(request({...scan(first), token: 'SANJARA:' + crypto.randomUUID()}))).status, 404);
      const outside = scan(first); outside.location.latitude = -7.91;
      assert.equal((await api.POST(request(outside))).status, 400);
      const stale = scan(first); stale.location.timestamp -= 180000;
      assert.equal((await api.POST(request(stale))).status, 400);
      const inaccurate = scan(first); inaccurate.location.accuracy = 300;
      assert.equal((await api.POST(request(inaccurate))).status, 400);
      assert.equal((await (await api.GET()).json()).records.length, 0);
    });

    await t.test('scan saves identity, server time and GPS; repeat returns the original receipt', async () => {
      const payload = scan(first);
      const response = await api.POST(request(payload));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.receipt.name, first.name);
      assert.equal(result.receipt.status, 'Hadir');
      assert.equal(typeof result.receipt.late, 'boolean');
      const duplicate = await api.POST(request(payload));
      assert.equal(duplicate.status, 409);
      assert.equal((await duplicate.json()).receipt.time, result.receipt.time);
      const stored = (await (await api.GET()).json()).records;
      assert.equal(stored.length, 1);
      assert.equal(stored[0].time, result.receipt.time);
      assert.equal(stored[0].distance, 0);
    });

    await t.test('two scanners racing for one student create exactly one row and two valid receipts', async () => {
      const responses = await Promise.all([api.POST(request(scan(second))), api.POST(request(scan(second)))]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      const receipts = await Promise.all(responses.map(r => r.json()));
      assert.equal(receipts[0].receipt.time, receipts[1].receipt.time);
      assert.equal((await (await api.GET()).json()).records.length, 2);
    });

    await t.test('cross-origin and manual present requests cannot bypass QR and GPS rules', async () => {
      const foreign = request(scan(first));
      foreign.headers.set('origin', 'https://other.example');
      assert.equal((await api.POST(foreign)).status, 403);
      assert.equal((await api.POST(request({action: 'attendance', method: 'Manual', studentId: first.id, status: 'Hadir'}))).status, 400);
    });

    await t.test('missing migration returns an actionable message without database credentials', async () => {
      await pg.exec('DROP TABLE attendance');
      const result = await api.GET();
      assert.equal(result.status, 503);
      assert.equal((await result.json()).code, 'SCHEMA_NOT_READY');
    });
  } finally {await pg.close();}
});
