import {NextResponse} from 'next/server';
import {createHmac} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {getDb} from '../../../db';
import {storageError} from '../../../lib/server-errors';
import {missingConfiguration,usernameMatches,passwordMatches,makeSession,safeReturnTo,SESSION_COOKIE,SESSION_SECONDS,authSecretMaterial} from '../../../lib/auth-core';

export const runtime='nodejs';

export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin){
  return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 }

 if(missingConfiguration().length){
  return NextResponse.json({error:'Database belum dikonfigurasi.'},{status:503});
 }

 if(Number(req.headers.get('content-length')||0)>4096){
  return NextResponse.json({error:'Permintaan terlalu besar.'},{status:413});
 }

 try{
  const b=await req.json();

  if(typeof b.username!=='string'||b.username.length>64||typeof b.password!=='string'||b.password.length>256){
   return NextResponse.json({error:'Data login tidak valid.'},{status:400});
  }

  const ip=process.env.VERCEL?req.headers.get('x-vercel-forwarded-for')||'shared':'local';
  const key=createHmac('sha256',authSecretMaterial()).update(ip).digest('hex');
  const window=Math.floor(Date.now()/900000);

  const result=await getDb().execute(sql`
   INSERT INTO login_attempts (key,window_start,attempts)
   VALUES (${key},${window},1)
   ON CONFLICT (key) DO UPDATE SET
    attempts=CASE WHEN login_attempts.window_start=${window} THEN login_attempts.attempts+1 ELSE 1 END,
    window_start=${window}
   RETURNING attempts
  `);

  if(Number(result.rows[0]?.attempts)>10){
   return NextResponse.json(
    {error:'Terlalu banyak percobaan. Coba lagi dalam 15 menit.'},
    {status:429,headers:{'Retry-After':'900'}}
   );
  }

  if(!usernameMatches(b.username)||!passwordMatches(b.password)){
   return NextResponse.json({error:'Username atau kata sandi tidak sesuai.'},{status:401});
  }

  const response=NextResponse.json(
   {ok:true,redirect:safeReturnTo(b.next)},
   {headers:{'Cache-Control':'no-store'}}
  );

  response.cookies.set(SESSION_COOKIE,makeSession(),{
   httpOnly:true,
   secure:process.env.NODE_ENV==='production',
   sameSite:'lax',
   path:'/',
   maxAge:SESSION_SECONDS
  });

  return response;
 }catch(e){
  const failure=storageError(e);
  return NextResponse.json(failure,{status:failure.status});
 }
}
