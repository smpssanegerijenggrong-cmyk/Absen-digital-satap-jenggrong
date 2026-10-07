import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

export const SESSION_COOKIE='sanjara_session';
export const SESSION_SECONDS=8*60*60;
const FALLBACK_PASSWORD_SHA256='23c622c53d89607d2148ec422a3cf6dcdd0b01691382b6d7559342fe222a05f8';

export function missingConfiguration(){
 return ['DATABASE_URL'].filter(key=>!process.env[key]);
}

export function operatorUsername(){
 return process.env.ADMIN_USERNAME?.trim()||'operator';
}

function digest(value:string){
 return createHash('sha256').update(value).digest();
}

function constantTimeTextMatch(value:string,expected:string){
 return timingSafeEqual(digest(value),digest(expected));
}

export function usernameMatches(value:string){
 return typeof value==='string'&&value.length<=64&&constantTimeTextMatch(value.trim(),operatorUsername());
}

export function passwordMatches(value:string){
 if(typeof value!=='string'||value.length>256)return false;
 const configured=process.env.ADMIN_PASSWORD;
 if(configured&&configured.length>=16)return constantTimeTextMatch(value,configured);
 const actual=digest(value);
 const expected=Buffer.from(FALLBACK_PASSWORD_SHA256,'hex');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

export function authSecretMaterial(){
 const configured=process.env.AUTH_SECRET;
 if(configured&&configured.length>=32)return configured;
 if(process.env.DATABASE_URL)return createHash('sha256').update('sanjara-session:'+process.env.DATABASE_URL).digest('hex');
 throw Error('Konfigurasi login belum lengkap.');
}

function signingKey(){
 const credential=process.env.ADMIN_PASSWORD&&process.env.ADMIN_PASSWORD.length>=16
  ? process.env.ADMIN_PASSWORD
  : FALLBACK_PASSWORD_SHA256;
 return createHmac('sha256',authSecretMaterial()).update(credential).digest();
}

export function makeSession(now=Date.now()){
 const body=`v1.${Math.floor(now/1000)+SESSION_SECONDS}.${randomBytes(24).toString('base64url')}`;
 return body+'.'+createHmac('sha256',signingKey()).update(body).digest('base64url');
}

export function validSession(token:string|undefined,now=Date.now()){
 try{
  if(!token||token.length>256)return false;
  const parts=token.split('.');
  if(parts.length!==4||parts[0]!=='v1'||!/^\d+$/.test(parts[1]))return false;
  const expiry=Number(parts[1]);
  if(expiry<=Math.floor(now/1000)||expiry>Math.floor(now/1000)+SESSION_SECONDS)return false;
  const expected=createHmac('sha256',signingKey()).update(parts.slice(0,3).join('.')).digest();
  const actual=Buffer.from(parts[3],'base64url');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
 }catch{
  return false;
 }
}

export function safeReturnTo(value:unknown){
 return typeof value==='string'&&(value==='/'||/^\/api\/letter\?key=generated(?:%3A|:)[a-f0-9-]{36}$/i.test(value))?value:'/';
}
