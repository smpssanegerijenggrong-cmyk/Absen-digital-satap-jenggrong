import {cookies} from 'next/headers';
import {SESSION_COOKIE,validSession} from './auth-core';
export async function isOperator(){return validSession((await cookies()).get(SESSION_COOKIE)?.value);}
export function unauthorized(){return Response.json({error:'Silakan masuk sebagai operator.',code:'UNAUTHORIZED'},{status:401,headers:{'Cache-Control':'no-store'}});}
