import {NextResponse} from 'next/server';
import {SESSION_COOKIE} from '../../../lib/auth-core';
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 const response=NextResponse.redirect(new URL('/login',req.url),303);response.cookies.set(SESSION_COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});return response;
}
