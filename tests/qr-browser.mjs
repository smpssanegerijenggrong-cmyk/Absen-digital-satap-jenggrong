import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import QRCode from 'qrcode';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import * as schema from '../db/schema.ts';
import {createDataHandlers} from '../lib/data-handlers.ts';
import {makeSession, SESSION_COOKIE} from '../lib/auth-core.ts';

// Isolated test: the real UI/camera decoder and API handlers use an in-memory
// PostgreSQL database. No school records or production credentials are used.
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'sanjara-qr-'));
const port = Number(process.env.SCAN_TEST_PORT || 3006);
const origin = 'http://127.0.0.1:' + port;
process.env.AUTH_SECRET = randomBytes(32).toString('hex');
process.env.ADMIN_PASSWORD = randomBytes(24).toString('hex');
const pg = new PGlite();
const db = drizzle(pg, {schema});
const api = createDataHandlers({authorize: async () => true, database: () => db});
let server, browser;
let serverLogs = '';

function frame(value) {
  const size = 512;
  const y = Buffer.alloc(size * size, 235);
  if (value) {
    const {modules} = QRCode.create(value, {errorCorrectionLevel: 'M'});
    const scale = Math.floor(size / (modules.size + 8));
    const offset = Math.floor((size - modules.size * scale) / 2);
    for (let row = 0; row < modules.size; row++) for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      for (let dy = 0; dy < scale; dy++) y.fill(16, (offset + row * scale + dy) * size + offset + col * scale, (offset + row * scale + dy) * size + offset + (col + 1) * scale);
    }
  }
  return Buffer.concat([Buffer.from('FRAME\n'), y, Buffer.alloc(size * size / 2, 128)]);
}

try {
  await pg.exec(await readFile(new URL('../migrations/0001_postgres.sql', import.meta.url), 'utf8'));
  const students = ['A', 'B', 'C'].map((letter, i) => ({id: randomUUID(), token: randomUUID(), nis: '00' + (i + 1), nisn: '', gender: 'L', name: 'Siswa Uji ' + letter, className: 'VII A'}));
  await db.insert(schema.students).values(students);
  await db.insert(schema.settings).values({id: 'school', latitude: -7.9, longitude: 113.2, radius: 100});
  const card = s => 'SANJARA:' + s.token;
  const feed = join(temp, 'cards.y4m');
  const blank = frame(null), a = frame(card(students[0])), b = frame(card(students[1]));
  await writeFile(feed, Buffer.concat([Buffer.from('YUV4MPEG2 W512 H512 F5:1 Ip A1:1 C420jpeg\n'), ...Array(20).fill(a), ...Array(5).fill(blank), ...Array(20).fill(b), ...Array(5).fill(blank)]));
  const image = join(temp, 'card-c.png');
  await writeFile(image, await QRCode.toBuffer(card(students[2]), {width: 512, margin: 4}));

  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], {cwd: root, env: {...process.env, DATABASE_URL: '', NODE_ENV: 'production'}, stdio: ['ignore', 'pipe', 'pipe']});
  server.stdout.on('data', data => {serverLogs = (serverLogs + data).slice(-3000);});
  server.stderr.on('data', data => {serverLogs = (serverLogs + data).slice(-3000);});
  let health;
  for (let i = 0; i < 60; i++) {
    try {health = await fetch(origin + '/api/health'); break;} catch {await new Promise(resolve => setTimeout(resolve, 100));}
  }
  assert.ok(health, 'Production server did not start: ' + serverLogs);
  assert.equal(health.status, 503);
  assert.equal((await health.json()).code, 'CONFIGURATION_MISSING');
  assert.equal((await fetch(origin + '/api/data')).status, 401);
  const login = await fetch(origin + '/login');
  assert.match(await login.text(), /Penyiapan aplikasi belum selesai/);
  assert.match(login.headers.get('permissions-policy'), /camera=\(self\).*geolocation=\(self\)/);

  browser = await chromium.launch({executablePath: process.env.SCAN_TEST_BROWSER_PATH || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + feed]});
  const context = await browser.newContext({permissions: ['geolocation'], geolocation: {latitude: -7.9, longitude: 113.2, accuracy: 10}, viewport: {width: 1280, height: 900}});
  await context.addCookies([{name: SESSION_COOKIE, value: makeSession(), url: origin, httpOnly: true, sameSite: 'Lax'}]);
  let attempts = 0, lostReply = true;
  await context.route(origin + '/api/data', async route => {
    const req = route.request();
    const raw = req.postData();
    if (req.method() === 'POST' && JSON.parse(raw).action === 'attendance') {
      attempts++;
      if (attempts === 1) return route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Simulasi koneksi tidak stabil'})});
    }
    const request = new Request(req.url(), {method: req.method(), headers: req.headers(), ...(raw ? {body: raw} : {})});
    const result = await (req.method() === 'POST' ? api.POST(request) : api.GET());
    if (req.method() === 'POST' && result.ok && lostReply) {
      lostReply = false;
      return route.abort('failed'); // A saved row with a lost network response must not duplicate on retry.
    }
    await route.fulfill({status: result.status, headers: Object.fromEntries(result.headers), body: await result.text()});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole('button', {name: 'Mulai absensi', exact: true}).click();
  await page.getByRole('button', {name: 'Mulai scan otomatis', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.scanner-status b')?.textContent === '1 tercatat', null, {timeout: 25000});
  const rows = (await pg.query('SELECT * FROM attendance')).rows;
  assert.equal(rows.length, 2);
  assert.equal(attempts, 4);
  assert.equal(rows.every(row => row.status === 'Hadir' && row.distance === 0), true);
  assert.match(await page.locator('.scan-receipt').innerText(), /Siswa Uji B/);
  assert.match(await page.locator('.scan-receipt').innerText(), /\d{2}[.:]\d{2}[.:]\d{2} WIB/);
  assert.equal(await page.locator('video').isVisible(), true);
  const media = await page.locator('video').evaluateHandle(v => v.srcObject);
  await page.getByRole('button', {name: 'Hentikan pemindai'}).click();
  assert.equal(await media.evaluate(s => s.getTracks().every(track => track.readyState === 'ended')), true);
  assert.equal(await page.locator('video').evaluate(v => v.srcObject === null), true);
  await page.getByLabel('Baca QR dari gambar', {exact: true}).setInputFiles(image);
  await page.waitForFunction(() => document.querySelector('.scanner-status b')?.textContent === '2 tercatat');
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM attendance')).rows[0].n, 3);
  const before = attempts;
  await page.getByLabel('Baca QR dari gambar', {exact: true}).setInputFiles(image);
  await page.waitForTimeout(350);
  assert.equal(attempts, before);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({cameraReadsCardsAutomatically: true, postgresRecords: 3, retriesRecoverLostResponse: true, duplicatePrevented: true, gpsValidated: true, timestampsIncludeSeconds: true, cameraStopsCleanly: true, imageQRWorks: true, setupHealth503: true, unauthenticatedAPI401: true, pageErrors: errors.length}));
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
  await pg.close();
  await rm(temp, {recursive: true, force: true});
}
