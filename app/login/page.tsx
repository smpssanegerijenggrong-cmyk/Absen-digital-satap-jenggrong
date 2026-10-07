import {redirect} from 'next/navigation';
import {isOperator} from '../../lib/auth';
import {missingConfiguration,safeReturnTo} from '../../lib/auth-core';
import LoginForm from './login-form';
import {serverReadiness} from '../../lib/server-readiness';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{next?:string}>}){const next=safeReturnTo((await searchParams).next);if(await isOperator())redirect(next);const missing=missingConfiguration();const readiness=missing.length?null:await serverReadiness();return <main className="login-page"><section className="login-card"><img src="/branding/logo-sekolah.png" width="70" height="83" alt="Logo sekolah"/><h1>SANJARA Hadir</h1><p>Masuk ke ruang guru / operator</p>{missing.length?<div role="status" className="alert"><div><b>Penyiapan aplikasi belum selesai</b><p>Atur {missing.join(', ')} pada Environment Variables Vercel, lalu redeploy. ADMIN_PASSWORD minimal 16 karakter, AUTH_SECRET minimal 32 karakter.</p></div></div>:readiness&&!readiness.ready?<div role="alert" className="alert"><div><b>Server belum siap digunakan</b><p>{readiness.error}</p><p>Jika pengaturan sudah diperbaiki, muat ulang halaman ini.</p></div></div>:<LoginForm next={next}/>}</section></main>;}
