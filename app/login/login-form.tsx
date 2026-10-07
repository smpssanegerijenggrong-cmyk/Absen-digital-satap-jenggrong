'use client';
import {useState} from 'react';

export default function LoginForm({next}:{next:string}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <form onSubmit={async e=>{
  e.preventDefault();setBusy(true);setError('');
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
  <label>Username
   <input required type="text" name="username" autoComplete="username" maxLength={64} placeholder="operator" autoCapitalize="none" spellCheck={false}/>
  </label>
  <label>Kata sandi operator
   <input required type="password" name="password" autoComplete="current-password" maxLength={256}/>
  </label>
  {error&&<p role="alert" className="alert">{error}</p>}
  <button className="primary full" disabled={busy}>{busy?'Memeriksa…':'Masuk'}</button>
 </form>;
}
