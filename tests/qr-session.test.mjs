import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStudentQR, ScanSession} from '../lib/qr-session.ts';
import {attendanceTiming, jakartaDate, clockWIB} from '../lib/attendance-time.ts';

const token = 'SANJARA:0c4cf845-7a4c-4c3f-9cb6-8d0bc63c1ae8';
test('recognizes printed QR payloads with whitespace and uppercase without accepting unrelated QR', () => {
  assert.equal(normalizeStudentQR(' \n' + token.toUpperCase() + ' '), token);
  assert.equal(normalizeStudentQR(token.slice(8)), token);
  for (const value of ['SANJARA:../../login', 'https://example.com', '123456', 'SANJARA:' + 'a'.repeat(36), null]) assert.equal(normalizeStudentQR(value), null);
});

test('failed QR can be retried while still visible; successful QR cannot create repeated requests', () => {
  const scanner = new ScanSession();
  assert.equal(scanner.begin(token, '2026-10-07', 0), true);
  assert.equal(scanner.begin('other-card', '2026-10-07', 0), false);
  scanner.fail(token, 2000, 0);
  assert.equal(scanner.begin(token, '2026-10-07', 1999), false);
  assert.equal(scanner.begin(token, '2026-10-07', 2000), true);
  scanner.complete(token);
  assert.equal(scanner.begin(token, '2026-10-07', 100000), false);
  assert.equal(scanner.begin('next-card', '2026-10-07', 100000), true);
  scanner.cancel();
  assert.equal(scanner.begin(token, '2026-10-08', 100001), true);
});

test('07.00 WIB cutoff uses server timestamp, shows seconds and counts late arrival as present', () => {
  assert.equal(attendanceTiming('2026-10-07T00:00:00.000Z').late, false);
  assert.deepEqual(attendanceTiming('2026-10-07T00:00:01.000Z'), {late: true, lateMinutes: 1, label: 'Terlambat'});
  assert.equal(attendanceTiming('2026-10-07T00:02:01.000Z').lateMinutes, 3);
  assert.equal(attendanceTiming('2026-10-07T02:00:00Z', 'Izin').label, '');
  assert.equal(jakartaDate('2026-10-06T18:00:00Z'), '2026-10-07');
  assert.match(clockWIB('2026-10-07T00:00:01Z'), /07[.:]00[.:]01/);
});
