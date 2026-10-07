import {redirect} from 'next/navigation';
import {isOperator} from '../../lib/auth';
import {missingConfiguration,safeReturnTo} from '../../lib/auth-core';
import LoginForm from './login-form';
import {serverReadiness} from '../../lib/server-readiness';

export const dynamic='force-dynamic';

export default async function Login({searchParams}:{searchParams:Promise<{next?:string}>}){
 const next=safeReturnTo((await searchParams).next);
 if(await isOperator())redirect(next);

 const missing=missingConfiguration();
 const readiness=missing.length?null:await serverReadiness();

 return <main className="login-page">
  <section className="login-card">
   <img src="/branding/logo-sekolah.png" width="70" height="83" alt="Logo sekolah"/>
   <h1>SANJARA Hadir</h1>
   <p>Masuk ke ruang guru / operator</p>

   {missing.length>0&&
    <div role="status" className="alert">
     <div>
      <b>Database belum terhubung</b>
      <p>Atur DATABASE_URL pada Environment Variables Vercel lalu redeploy.</p>
     </div>
    </div>
   }

   {!missing.length&&readiness&&!readiness.ready&&
    <div role="alert" className="alert">
     <div>
      <b>Server/database belum siap</b>
      <p>{readiness.error}</p>
      <p>Periksa migrasi database lalu muat ulang halaman.</p>
     </div>
    </div>
   }

   <LoginForm next={next}/>
  </section>
 </main>;
}
