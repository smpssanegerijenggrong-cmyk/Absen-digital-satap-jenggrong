'use client';
import {useState} from 'react';

export default function LoginForm({next}:{next:string}){
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);

 return <form onSubmit={async e=>{
  e.preventDefault();
  setBusy(true);
  setError('');

  const data=new FormData(e.currentTarget);

  try{
   const r=await fetch('/api/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
     username:data.get('username'),
     password:data.get('password'),
     next
    })
   });

   const b=await r.json();

   if(!r.ok)throw Error(b.error||'Login gagal.');

   window.location.assign(b.redirect);
  }catch(err){
   setError((err as Error).message);
   setBusy(false);
  }
 }}>
  <label>
   Username operator
   <input
    required
    type="text"
    name="username"
    autoComplete="username"
    maxLength={64}
    defaultValue="operator"
    autoCapitalize="none"
    spellCheck={false}
   />
  </label>

  <label>
   Kata sandi
   <input
    required
    type="password"
    name="password"
    autoComplete="current-password"
    maxLength={256}
    placeholder="Masukkan kata sandi operator"
   />
  </label>

  <p className="muted">Username default: <b>operator</b>. Dapat diganti melalui ADMIN_USERNAME di Vercel.</p>

  {error&&<p role="alert" className="alert">{error}</p>}

  <button className="primary full" disabled={busy}>
   {busy?'Memeriksa…':'Masuk'}
  </button>
 </form>;
}
