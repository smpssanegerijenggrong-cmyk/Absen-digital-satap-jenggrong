import {readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL belum diatur. Hubungkan Neon dan isi .env.local terlebih dahulu.');
const sql=neon(process.env.DATABASE_URL);
const statements=(await readFile(new URL('../migrations/0001_postgres.sql',import.meta.url),'utf8')).split(';').map(s=>s.trim()).filter(Boolean);
try{await sql.transaction(statements.map(statement=>sql.query(statement)));console.log('Struktur database SANJARA siap. Data yang ada dipertahankan.');}catch{console.error('Migrasi gagal. Periksa koneksi serta hak akses database.');process.exitCode=1;}
