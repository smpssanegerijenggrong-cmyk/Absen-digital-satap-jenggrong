import {sql} from 'drizzle-orm';
import {getDb} from '../db';
import {missingConfiguration} from './auth-core';
import {storageError} from './server-errors';

export async function serverReadiness() {
  const missing = missingConfiguration();
  if (missing.length) return {ready: false, code: 'CONFIGURATION_MISSING', error: 'Pengaturan aplikasi belum lengkap. Atur ' + missing.join(', ') + ' di Vercel, lalu redeploy.'};
  try {
    const result = await getDb().execute(sql`SELECT
      to_regclass('public.students') IS NOT NULL AND
      to_regclass('public.attendance') IS NOT NULL AND
      to_regclass('public.settings') IS NOT NULL AND
      to_regclass('public.classrooms') IS NOT NULL AND
      to_regclass('public.login_attempts') IS NOT NULL AS ready`);
    if (result.rows[0]?.ready !== true) return {ready: false, code: 'SCHEMA_NOT_READY', error: 'Struktur database belum siap. Jalankan migrations/0001_postgres.sql melalui SQL Editor Neon, lalu muat ulang.'};
    return {ready: true, code: 'READY', error: ''};
  } catch (e) {
    const failure = storageError(e);
    return {ready: false, code: failure.code, error: failure.error};
  }
}
