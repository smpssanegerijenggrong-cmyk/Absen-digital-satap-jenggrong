import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export const SESSION_COOKIE='sanjara_session';
export const SESSION_SECONDS=8*60*60;
export function missingConfiguration(){return ['DATABASE_URL','ADMIN_PASSWORD','AUTH_SECRET'].filter(key=>!process.env[key]||(key==='ADMIN_PASSWORD'&&process.env[key]!.length<16)||(key==='AUTH_SECRET'&&process.env[key]!.length<32));}
function signingKey(){const {AUTH_SECRET,ADMIN_PASSWORD}=process.env;if(!AUTH_SECRET||AUTH_SECRET.length<32||!ADMIN_PASSWORD||ADMIN_PASSWORD.length<16)throw Error('Konfigurasi login belum lengkap.');return createHmac('sha256',AUTH_SECRET).update(ADMIN_PASSWORD).digest();}
export function passwordMatches(value:string){if(!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<16)return false;const hash=(v:string)=>createHash('sha256').update(v).digest();return timingSafeEqual(hash(value),hash(process.env.ADMIN_PASSWORD));}
export function makeSession(now=Date.now()){const body=`v1.${Math.floor(now/1000)+SESSION_SECONDS}.${randomBytes(24).toString('base64url')}`;return body+'.'+createHmac('sha256',signingKey()).update(body).digest('base64url');}
export function validSession(token:string|undefined,now=Date.now()){
 try{if(!token||token.length>256)return false;const parts=token.split('.');if(parts.length!==4||parts[0]!=='v1'||!/^\d+$/.test(parts[1]))return false;const expiry=Number(parts[1]);if(expiry<=Math.floor(now/1000)||expiry>Math.floor(now/1000)+SESSION_SECONDS)return false;const expected=createHmac('sha256',signingKey()).update(parts.slice(0,3).join('.')).digest();const actual=Buffer.from(parts[3],'base64url');return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}
}
export function safeReturnTo(value:unknown){return typeof value==='string'&&(value==='/'||/^\/api\/letter\?key=generated(?:%3A|:)[a-f0-9-]{36}$/i.test(value))?value:'/';}
