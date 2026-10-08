'use client';

import {useEffect,useRef,useState} from 'react';
import {Camera,CheckCheck,ImageUp,ScanLine,Square} from 'lucide-react';
import jsQR from 'jsqr';
import {checkLocation,type SchoolLocation} from '../../lib/attendance-rules';
import {attendanceTiming,clockWIB,jakartaDate} from '../../lib/attendance-time';
import {normalizeStudentQR,ScanSession} from '../../lib/qr-session';

type Position={latitude:number;longitude:number;accuracy:number;timestamp:number};
type Receipt={name:string;nis:string;nisn?:string;className:string;status:string;time:string;duplicate?:boolean};
type Props={settings:SchoolLocation|null;hasStudents:boolean;onRecorded:()=>Promise<void>;onSetup:()=>void};
type NativeBarcode={rawValue?:string};
type NativeDetector={detect:(source:CanvasImageSource)=>Promise<NativeBarcode[]>};
type NativeDetectorCtor=new(options:{formats:string[]})=>NativeDetector;

function cameraMessage(error:unknown){
 const e=error as Error;
 if(e.name==='NotAllowedError'||e.name==='SecurityError')return 'Izin kamera ditolak. Izinkan Kamera pada pengaturan situs, lalu tekan Coba nyalakan kamera.';
 if(e.name==='NotFoundError')return 'Kamera tidak ditemukan. Hubungkan kamera atau gunakan ponsel.';
 if(e.name==='NotReadableError')return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera/WhatsApp/Meet, lalu coba lagi.';
 if(e.name==='OverconstrainedError')return 'Kamera yang dipilih tidak tersedia. Pilih kamera lain atau coba kembali.';
 if(e.name==='AbortError')return 'Kamera sempat terhenti. Tekan Coba nyalakan kamera.';
 return e.message||'Kamera belum dapat diaktifkan.';
}

export default function QRScanner({settings,hasStudents,onRecorded,onSetup}:Props){
 const video=useRef<HTMLVideoElement>(null);
 const canvas=useRef<HTMLCanvasElement|null>(null);
 const stream=useRef<MediaStream|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const epoch=useRef(0);
 const mounted=useRef(true);
 const callback=useRef(onRecorded);
 const session=useRef(new ScanSession());
 const position=useRef<Position|null>(null);
 const watch=useRef<number|null>(null);
 const pending=useRef<AbortController|null>(null);
 const recording=useRef(false);
 const detector=useRef<NativeDetector|null>(null);
 const detectorBusy=useRef(false);

 const [active,setActive]=useState(false);
 const [starting,setStarting]=useState(false);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 const [gps,setGps]=useState('GPS diperiksa saat QR berhasil dibaca');
 const [receipt,setReceipt]=useState<Receipt|null>(null);
 const [count,setCount]=useState(0);
 const [cameras,setCameras]=useState<MediaDeviceInfo[]>([]);
 const [cameraId,setCameraId]=useState('');
 const [decoder,setDecoder]=useState('QR engine siap');
 callback.current=onRecorded;

 function shutdown(){
  epoch.current++;
  if(timer.current)clearTimeout(timer.current);
  timer.current=null;
  pending.current?.abort();
  pending.current=null;
  stream.current?.getTracks().forEach(track=>track.stop());
  stream.current=null;
  if(video.current)video.current.srcObject=null;
  if(watch.current!==null)navigator.geolocation?.clearWatch(watch.current);
  watch.current=null;
  position.current=null;
  recording.current=false;
  detectorBusy.current=false;
  session.current.cancel();
 }

 function stop(){
  shutdown();
  setActive(false);
  setStarting(false);
  setWorking(false);
  setGps('GPS diperiksa saat QR berhasil dibaca');
 }

 useEffect(()=>{
  mounted.current=true;
  const auto=setTimeout(()=>{
   if(mounted.current&&!stream.current)void start();
  },350);
  return()=>{
   clearTimeout(auto);
   mounted.current=false;
   shutdown();
  };
  // Scanner is mounted only while the Scan QR dialog is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 function updatePosition(p:GeolocationPosition){
  const location={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};
  position.current=location;
  try{
   checkLocation(settings||undefined,location);
   setGps('Lokasi sekolah valid · akurasi ±'+Math.round(location.accuracy)+' m');
  }catch(e){
   setGps((e as Error).message);
  }
  return location;
 }

 function watchLocation(version:number){
  if(!navigator.geolocation){
   setGps('Browser tidak mendukung lokasi.');
   return;
  }
  setGps('Mencari lokasi sekolah…');
  watch.current=navigator.geolocation.watchPosition(
   p=>{
    if(mounted.current&&version===epoch.current)updatePosition(p);
   },
   e=>{
    if(mounted.current&&version===epoch.current){
     setGps(e.code===1?'QR dapat dibaca, tetapi Lokasi harus diizinkan untuk menyimpan kehadiran.':'GPS belum tersedia. Aktifkan lokasi perangkat; kamera tetap memindai QR.');
    }
   },
   {enableHighAccuracy:true,maximumAge:15000,timeout:15000}
  );
 }

 async function locate(version:number):Promise<Position>{
  if(!settings)throw Error('QR terbaca, tetapi lokasi sekolah belum diatur. Atur Lokasi sekolah lalu scan kembali.');
  if(position.current&&Date.now()-position.current.timestamp<60000){
   try{
    checkLocation(settings,position.current);
    return position.current;
   }catch{
    // Ask GPS for a fresher or more accurate position below.
   }
  }
  if(!navigator.geolocation)throw Error('QR terbaca, tetapi browser tidak mendukung lokasi.');
  const location=await new Promise<Position>((resolve,reject)=>{
   navigator.geolocation.getCurrentPosition(
    p=>{
     if(!mounted.current||version!==epoch.current){
      reject(Error('Pemindai dihentikan.'));
      return;
     }
     resolve(updatePosition(p));
    },
    e=>reject(Error(e.code===1?'QR terbaca, tetapi izin lokasi ditolak. Izinkan Lokasi pada pengaturan situs.':'QR terbaca, tetapi lokasi belum tersedia. Aktifkan GPS dan coba di area terbuka.')),
    {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
   );
  });
  checkLocation(settings,location);
  return location;
 }

 function setupNativeDetector(){
  detector.current=null;
  try{
   const Ctor=(window as unknown as {BarcodeDetector?:NativeDetectorCtor}).BarcodeDetector;
   if(Ctor){
    detector.current=new Ctor({formats:['qr_code']});
    setDecoder('Pembaca QR cepat aktif');
    return;
   }
  }catch{
   detector.current=null;
  }
  setDecoder('Pembaca QR kompatibel aktif');
 }

 async function start(selectedCamera=cameraId){
  if(starting||recording.current||stream.current)return;
  shutdown();
  const version=epoch.current;
  setActive(false);
  setError('');
  setStarting(true);
  setReceipt(null);

  try{
   if(!window.isSecureContext)throw Error('Kamera memerlukan HTTPS. Buka alamat aplikasi Vercel langsung, bukan file HTML atau iframe pratinjau.');
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Browser ini tidak menyediakan akses kamera. Gunakan Chrome, Edge, atau Safari terbaru.');

   const preferred:MediaTrackConstraints=selectedCamera
    ?{deviceId:{exact:selectedCamera}}
    :{facingMode:{ideal:'environment'}};

   let media:MediaStream;
   try{
    media=await navigator.mediaDevices.getUserMedia({
     video:{...preferred,width:{ideal:1920,min:640},height:{ideal:1080,min:480}},
     audio:false
    });
   }catch(e){
    if(!['OverconstrainedError','NotFoundError'].includes((e as Error).name)||version!==epoch.current)throw e;
    media=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
   }

   if(!mounted.current||version!==epoch.current){
    media.getTracks().forEach(t=>t.stop());
    return;
   }

   stream.current=media;
   const v=video.current;
   if(!v)throw Error('Pratinjau kamera belum siap. Coba nyalakan kamera kembali.');

   v.srcObject=media;
   v.setAttribute('playsinline','true');
   v.muted=true;
   await v.play();

   if(!mounted.current||version!==epoch.current)return;

   const track=media.getVideoTracks()[0];
   setCameraId(track?.getSettings().deviceId||selectedCamera);
   try{
    const caps=track?.getCapabilities?.() as MediaTrackCapabilities&{focusMode?:string[]};
    if(caps?.focusMode?.includes('continuous')){
     await track.applyConstraints({advanced:[{focusMode:'continuous'} as MediaTrackConstraintSet]});
    }
   }catch{
    // Autofocus manual tidak wajib; scanner tetap berjalan.
   }

   try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    if(version===epoch.current)setCameras(devices.filter(d=>d.kind==='videoinput'));
   }catch{
    // Enumeration is optional; scanning still works.
   }

   track?.addEventListener('ended',()=>{
    if(mounted.current&&version===epoch.current){
     stop();
     setError('Kamera terputus. Tekan Coba nyalakan kamera.');
    }
   },{once:true});

   setupNativeDetector();
   setActive(true);
   watchLocation(version);
   scheduleTick(version,80);
  }catch(e){
   if(mounted.current&&version===epoch.current){
    shutdown();
    setActive(false);
    setError(cameraMessage(e));
   }
  }finally{
   if(mounted.current&&(version===epoch.current||!stream.current))setStarting(false);
  }
 }

 async function record(raw:string,version:number){
  if(version!==epoch.current||recording.current)return;
  const token=normalizeStudentQR(raw);
  const key=token||raw.slice(0,100);
  if(!session.current.begin(key,jakartaDate()))return;

  recording.current=true;
  setWorking(true);
  setReceipt(null);
  setDecoder('QR terbaca · merekam otomatis…');
  setError('');
  let succeeded=false;
  let cooldown=2500;

  try{
   if(!token){
    cooldown=8000;
    throw Error('QR terbaca, tetapi ini bukan kartu siswa SANJARA.');
   }

   if(!hasStudents){
    setError('QR terbaca. Memeriksa kartu ke server…');
   }

   const location=await locate(version);
   if(version!==epoch.current)return;

   let result:{error?:string;receipt?:Receipt}={};
   let response:Response|undefined;

   for(let attempt=0;attempt<3;attempt++){
    if(version!==epoch.current)return;
    const controller=new AbortController();
    pending.current=controller;
    const timeout=setTimeout(()=>controller.abort(),12000);

    try{
     response=await fetch('/api/data',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      signal:controller.signal,
      body:JSON.stringify({action:'attendance',method:'QR',token,location})
     });
     result=await response.json();
     if(response.status<500||attempt===2)break;
    }catch{
     if(version!==epoch.current)return;
     if(attempt===2)throw Error('Koneksi terlalu lama. QR akan dapat dicoba kembali; catatan ganda tetap dicegah.');
    }finally{
     clearTimeout(timeout);
     pending.current=null;
    }

    if(mounted.current&&version===epoch.current)setError('Koneksi belum stabil. Menyimpan ulang otomatis…');
    await new Promise(resolve=>setTimeout(resolve,(attempt+1)*700));
   }

   if(version!==epoch.current||!mounted.current)return;

   if(response?.status===401){
    stop();
    window.location.assign('/login');
    return;
   }

   if(response&&(response.ok||response.status===409)&&result.receipt){
    succeeded=true;
    session.current.complete(key,4000);
    const duplicate=response.status===409;
    setReceipt({...result.receipt,duplicate});
    setError('');
    setDecoder(duplicate?'SUDAH ABSEN HARI INI':'ABSEN BERHASIL · TERSIMPAN OTOMATIS');
    if(response.ok){
     setCount(n=>n+1);
     navigator.vibrate?.(100);
    }else{
     navigator.vibrate?.([80,60,80]);
    }
    void callback.current().catch(()=>{
     if(mounted.current)setError('Kehadiran tersimpan. Rekap belum termuat ulang; lanjut scan atau muat ulang setelah selesai.');
    });
   }else{
    if(response?.status===404)cooldown=5000;
    throw Error(result.error||'QR terbaca, tetapi penyimpanan belum berhasil.');
   }
  }catch(e){
   if(mounted.current&&version===epoch.current)setError((e as Error).message);
  }finally{
   if(version===epoch.current){
    if(!succeeded)session.current.fail(key,cooldown);
    recording.current=false;
    if(mounted.current)setWorking(false);
   }
  }
 }

 function readCanvasQR(source:CanvasImageSource,sx:number,sy:number,sw:number,sh:number,target=760){
  const qrCanvas=canvas.current||(canvas.current=document.createElement('canvas'));
  const scale=Math.min(1,target/Math.max(sw,sh));
  qrCanvas.width=Math.max(1,Math.round(sw*scale));
  qrCanvas.height=Math.max(1,Math.round(sh*scale));
  const ctx=qrCanvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Browser tidak dapat membaca gambar kamera.');
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(source,sx,sy,sw,sh,0,0,qrCanvas.width,qrCanvas.height);
  const pixels=ctx.getImageData(0,0,qrCanvas.width,qrCanvas.height);
  return jsQR(pixels.data,qrCanvas.width,qrCanvas.height,{inversionAttempts:'attemptBoth'})?.data||null;
 }

 function decodeJsQR(source:CanvasImageSource,width:number,height:number){
  // Prioritaskan bagian tengah yang sama dengan kotak scan di layar.
  // QR sering terlihat kecil pada frame 16:9; crop membuat modul QR jauh lebih besar.
  const side=Math.min(width,height)*0.82;
  const sx=(width-side)/2;
  const sy=(height-side)/2;
  const center=readCanvasQR(source,sx,sy,side,side,820);
  if(center)return center;

  // Cadangan: baca seluruh frame untuk QR yang tidak tepat di tengah.
  return readCanvasQR(source,0,0,width,height,960);
 }

 async function nativeDetectWithTimeout(v:HTMLVideoElement){
  if(!detector.current||detectorBusy.current)return null;
  detectorBusy.current=true;
  try{
   const task=detector.current.detect(v).then(results=>
    results.find(item=>typeof item.rawValue==='string'&&item.rawValue.trim())?.rawValue||null
   );
   const timeout=new Promise<null>(resolve=>setTimeout(()=>resolve(null),220));
   return await Promise.race([task,timeout]);
  }catch{
   detector.current=null;
   setDecoder('Pembaca QR kompatibel aktif');
   return null;
  }finally{
   detectorBusy.current=false;
  }
 }

 async function decodeVideo(v:HTMLVideoElement){
  // jsQR dijalankan lebih dulu agar scan otomatis tidak tergantung implementasi
  // BarcodeDetector browser yang pada sebagian HP bisa lambat.
  const jsValue=decodeJsQR(v,v.videoWidth,v.videoHeight);
  if(jsValue)return jsValue;
  return await nativeDetectWithTimeout(v);
 }

 function scheduleTick(version:number,delay=90){
  if(version!==epoch.current)return;
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>void tick(version),delay);
 }

 async function tick(version:number){
  if(version!==epoch.current)return;
  const v=video.current;

  if(!recording.current&&v&&v.readyState>=2&&v.videoWidth&&v.videoHeight){
   try{
    const value=await decodeVideo(v);
    if(value&&version===epoch.current){
     setDecoder('QR terbaca otomatis');
     void record(value,version);
    }else if(version===epoch.current){
     setDecoder(detector.current?'Mencari QR otomatis · pembaca ganda aktif':'Mencari QR otomatis · jsQR aktif');
    }
   }catch(e){
    if(mounted.current&&version===epoch.current)setError((e as Error).message);
   }
  }

  if(mounted.current&&version===epoch.current)scheduleTick(version,90);
 }

 async function scanImage(file?:File){
  if(!file||recording.current)return;
  if(file.size>8*1024*1024){
   setError('Gambar QR maksimal 8 MB.');
   return;
  }

  const version=epoch.current;
  setError('');
  const url=URL.createObjectURL(file);

  try{
   const image=new Image();
   image.src=url;
   await image.decode();
   if(version!==epoch.current||!mounted.current)return;
   const value=decodeJsQR(image,image.naturalWidth,image.naturalHeight);
   if(!value)throw Error('QR tidak terbaca dari gambar. Pilih foto tajam yang memuat seluruh kotak QR.');
   await record(value,version);
  }catch(e){
   if(mounted.current)setError((e as Error).message);
  }finally{
   URL.revokeObjectURL(url);
  }
 }

 const timing=receipt&&attendanceTiming(receipt.time,receipt.status);

 return <div>
  <div className="scanner-status" aria-live="polite">
   <span><i className={active?'live':''}/>{working?'QR terbaca · memeriksa lokasi & menyimpan…':starting?'Mengaktifkan kamera…':active?'Pemindai aktif · arahkan QR ke kotak':'Kamera siap dinyalakan'}</span>
   <b>{count} absen baru</b>
  </div>

  <div className="camera-box">
   <video ref={video} autoPlay playsInline muted className={active||starting?'visible-video':''}/>
   {!active&&<div className="camera-placeholder">
    <ScanLine size={48}/>
    <span>{starting?'Mengaktifkan kamera…':'Kamera akan menyala otomatis. Arahkan QR ke kotak sampai terbaca.'}</span>
   </div>}
   {active&&<div className="scan-frame"/>}
   {receipt&&<div className={'scan-camera-result '+(receipt.duplicate?'duplicate':'success')} aria-live="assertive">
    <CheckCheck size={30}/>
    <div>
     <strong>{receipt.duplicate?'SUDAH ABSEN HARI INI':'ABSEN BERHASIL'}</strong>
     <span>{receipt.name} · {receipt.className}</span>
    </div>
   </div>}
  </div>

  <p className="scanner-engine">{decoder}</p>

  {cameras.length>1&&<label className="camera-picker">
   Kamera
   <select
    aria-label="Pilih kamera"
    value={cameraId}
    disabled={starting||working}
    onChange={e=>{
     const id=e.target.value;
     setCameraId(id);
     if(active){
      stop();
      setTimeout(()=>void start(id),80);
     }
    }}
   >
    {cameras.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||'Kamera '+(i+1)}</option>)}
   </select>
  </label>}

  <p className="scanner-gps" role="status">{gps}</p>

  {error&&<div role="alert" className="alert scanner-message">
   {error}
   <small>Kamera tetap dapat membaca QR. Absensi baru dianggap berhasil setelah server mengonfirmasi penyimpanan.</small>
  </div>}

  {receipt&&<div role="status" className={'scan-receipt '+(receipt.duplicate?'duplicate':'')}>
   <CheckCheck size={27}/>
   <div>
    <small>{receipt.duplicate?'SUDAH ABSEN HARI INI':'ABSEN BERHASIL · TERSIMPAN OTOMATIS'}</small>
    <h3>{receipt.name}</h3>
    <p>NIPD {receipt.nis} · NISN {receipt.nisn||'—'} · {receipt.className}</p>
    <b>{receipt.status} · {clockWIB(receipt.time)} WIB{timing?.label?' · '+timing.label+(timing.late?' '+timing.lateMinutes+' menit':''):''}</b>
   </div>
  </div>}

  <div className="button-row">
   {!active
    ?<button disabled={starting||working} className="primary full" onClick={()=>void start()}>
      <Camera size={17}/>{starting?'Mengaktifkan kamera…':'Coba nyalakan kamera'}
     </button>
    :<button className="secondary full" onClick={stop}>
      <Square size={15}/>Hentikan pemindai
     </button>}
  </div>

  <label className={'secondary qr-image-button '+(working||starting?'disabled-upload':'')}>
   <ImageUp size={17}/>Baca QR dari gambar
   <input
    type="file"
    aria-label="Baca QR dari gambar"
    accept="image/png,image/jpeg,image/webp"
    disabled={working||starting}
    onChange={e=>{void scanImage(e.target.files?.[0]);e.target.value='';}}
   />
  </label>

  <p className="helper">
   {!settings
    ?'Kamera tetap dapat membaca QR, tetapi kehadiran belum dapat disimpan sebelum Lokasi sekolah diatur.'
    :!hasStudents
     ?'Kamera aktif. Jika data siswa belum tampil, muat ulang data setelah database siap.'
     :'QR dibaca otomatis tanpa tombol. Posisikan QR di tengah kotak, isi sekitar 40–70% kotak, dan jaga pencahayaan cukup.'}
  </p>

  {!settings&&<button className="text-button" onClick={onSetup}>Atur lokasi sekolah</button>}
 </div>;
}
