import {sql} from 'drizzle-orm';
import {getDb} from '../db';
import {missingConfiguration} from './auth-core';
import {storageError} from './server-errors';

export const DATABASE_SCHEMA_VERSION='0003_student_class_relation.sql';

export async function serverReadiness(){
 const missing=missingConfiguration();
 if(missing.length)return {ready:false,code:'CONFIGURATION_MISSING',error:'Pengaturan aplikasi belum lengkap. Atur '+missing.join(', ')+' di Vercel, lalu redeploy.',schemaVersion:null};

 try{
  const result=await getDb().execute(sql`SELECT
   to_regclass('public.students') IS NOT NULL AND
   to_regclass('public.attendance') IS NOT NULL AND
   to_regclass('public.settings') IS NOT NULL AND
   to_regclass('public.classrooms') IS NOT NULL AND
   to_regclass('public.login_attempts') IS NOT NULL AND
   to_regclass('public.schema_migrations') IS NOT NULL AND
   EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='students' AND column_name='created_at'
   ) AND
   EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='attendance' AND column_name='created_at'
   ) AND
   EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE name=${DATABASE_SCHEMA_VERSION}
   ) AS ready`);

  if(result.rows[0]?.ready!==true){
   return {
    ready:false,
    code:'SCHEMA_NOT_READY',
    error:'Struktur database belum versi terbaru. Redeploy aplikasi agar migrasi database otomatis dijalankan.',
    schemaVersion:DATABASE_SCHEMA_VERSION
   };
  }

  return {ready:true,code:'READY',error:'',schemaVersion:DATABASE_SCHEMA_VERSION};
 }catch(e){
  const failure=storageError(e);
  return {ready:false,code:failure.code,error:failure.error,schemaVersion:DATABASE_SCHEMA_VERSION};
 }
}
