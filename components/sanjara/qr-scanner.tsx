'use client';

import {useEffect,useRef,useState} from 'react';
import {Camera,CheckCheck,Flashlight,ImageUp,ScanLine,Square} from 'lucide-react';
import jsQR from 'jsqr';
import {checkLocation,type SchoolLocation} from '../../lib/attendance-rules';
import {attendanceTiming,clockWIB,jakartaDate} from '../../lib/attendance-time';
import {normalizeStudentQR,ScanSession} from '../../lib/qr-session';

type Position={latitude:number;longitude:number;accuracy:number;timestamp:number};
type Receipt={name:string;nis:string;nisn?:string;className:string;status:string;time:string;duplicate?:boolean};
type Detected={name:string;nis:string;nisn?:string;className:string};
type Props={settings:SchoolLocation|null;hasStudents:boolean;onRecorded:()=>Promise<void>;onSetup:()=>void};
type NativeBarcode={rawValue?:string};
type NativeDetector={detect:(source:CanvasImageSource)=>Promise<NativeBarcode[]>};
type NativeDetectorCtor=new(options:{formats:string[]})=>NativeDetector;
type FrameVideo=HTMLVideoElement&{
 requestVideoFrameCallback?:(callback:(now:number,metadata:unknown)=>void)=>number;
 cancelVideoFrameCallback?:(handle:number)=>void;
};

function cameraMessage(error:unknown){
 const e=error as Error;
 if(e.name==='NotAllowedError'||e.name==='SecurityError')return 'Izin kamera ditolak. Izinkan Kamera pada pengaturan situs lalu buka pemindai lagi.';
 if(e.name==='NotFoundError')return 'Kamera tidak ditemukan. Hubungkan kamera atau gunakan ponsel.';
 if(e.name==='NotReadableError')return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi Kamera/WhatsApp/Meet lalu coba lagi.';
 if(e.name==='OverconstrainedError')return 'Kamera yang dipilih tidak tersedia. Pilih kamera lain.';
 if(e.name==='AbortError')return 'Kamera sempat terhenti. Nyalakan kamera kembali.';
 return e.message||'Kamera belum dapat diaktifkan.';
}

function cameraScore(device:MediaDeviceInfo){
 const label=device.label.toLowerCase();
 let score=0;
 if(/back|rear|environment|belakang|world/.test(label))score+=100;
 if(/main|utama|camera 0|camera0/.test(label))score+=20;
 if(/front|user|depan|selfie/.test(label))score-=180;
 if(/ultra|wide|tele|macro|depth/.test(label))score-=45;
 return score;
}

export default function QRScanner({settings,hasStudents,onRecorded,onSetup}:Props){
 const video=useRef<HTMLVideoElement>(null);
 const canvas=useRef<HTMLCanvasElement|null>(null);
 const stream=useRef<MediaStream|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const frameHandle=useRef<number|null>(null);
 const epoch=useRef(0);
 const mounted=useRef(true);
 const callback=useRef(onRecorded);
 const session=useRef(new ScanSession());
 const position=useRef<Position|null>(null);
 const watch=useRef<number|null>(null);
 const pending=useRef<AbortController|null>(null);
 const recording=useRef(false);
 const detector=useRef<NativeDetector|null>(null);
 const nativeInFlight=useRef<Promise<string|null>|null>(null);
 const frameNumber=useRef(0);
 const lastDecodeAt=useRef(0);
 const latchedQR=useRef('');
 const emptyFrames=useRef(0);

 const [active,setActive]=useState(false);
 const [starting,setStarting]=useState(false);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 const [gps,setGps]=useState('GPS disiapkan otomatis');
 const [receipt,setReceipt]=useState<Receipt|null>(null);
 const [detected,setDetected]=useState<Detected|null>(null);
 const [count,setCount]=useState(0);
 const [cameras,setCameras]=useState<MediaDeviceInfo[]>([]);
 const [cameraId,setCameraId]=useState('');
 const [decoder,setDecoder]=useState('Menyiapkan mesin pembaca QR…');
 const [torchSupported,setTorchSupported]=useState(false);
 const [torchOn,setTorchOn]=useState(false);

 callback.current=onRecorded;

 function cancelFrameLoop(){
  if(timer.current)clearTimeout(timer.current);
  timer.current=null;
  const v=video.current as FrameVideo|null;
  if(frameHandle.current!==null&&v?.cancelVideoFrameCallback)v.cancelVideoFrameCallback(frameHandle.current);
  frameHandle.current=null;
 }

 function shutdown(){
  epoch.current++;
  cancelFrameLoop();
  pending.current?.abort();
  pending.current=null;
  stream.current?.getTracks().forEach(track=>track.stop());
  stream.current=null;
  if(video.current)video.current.srcObject=null;
  if(watch.current!==null)navigator.geolocation?.clearWatch(watch.current);
  watch.current=null;
  position.current=null;
  recording.current=false;
  detector.current=null;
  nativeInFlight.current=null;
  frameNumber.current=0;
  lastDecodeAt.current=0;
  latchedQR.current='';
  emptyFrames.current=0;
  session.current.cancel();
  setTorchSupported(false);
  setTorchOn(false);
 }

 function stop(){
  shutdown();
  setActive(false);
  setStarting(false);
  setWorking(false);
  setDetected(null);
  setGps('GPS disiapkan otomatis');
 }

 useEffect(()=>{
  mounted.current=true;
  const auto=setTimeout(()=>{
   if(mounted.current&&!stream.current)void start();
  },300);
  return()=>{
   clearTimeout(auto);
   mounted.current=false;
   shutdown();
  };
  // Scanner exists only while the scan dialog is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 function updatePosition(p:GeolocationPosition){
  const location={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};
  position.current=location;
  try{
   checkLocation(settings||undefined,location);
   setGps('Lokasi valid · akurasi ±'+Math.round(location.accuracy)+' m');
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
   p=>{if(mounted.current&&version===epoch.current)updatePosition(p);},
   e=>{
    if(mounted.current&&version===epoch.current){
     setGps(e.code===1?'QR tetap dapat dibaca. Izinkan Lokasi agar absensi bisa disimpan.':'GPS belum siap. Kamera tetap membaca QR.');
    }
   },
   {enableHighAccuracy:true,maximumAge:10000,timeout:15000}
  );
 }

 async function locate(version:number):Promise<Position>{
  if(!settings)throw Error('QR sudah terbaca, tetapi lokasi sekolah belum diatur.');
  if(position.current&&Date.now()-position.current.timestamp<60000){
   try{
    checkLocation(settings,position.current);
    return position.current;
   }catch{
    // Request a fresher reading below.
   }
  }
  if(!navigator.geolocation)throw Error('QR sudah terbaca, tetapi browser tidak mendukung lokasi.');
  const location=await new Promise<Position>((resolve,reject)=>{
   navigator.geolocation.getCurrentPosition(
    p=>{
     if(!mounted.current||version!==epoch.current){reject(Error('Pemindai dihentikan.'));return;}
     resolve(updatePosition(p));
    },
    e=>reject(Error(e.code===1?'QR sudah terbaca, tetapi izin lokasi ditolak. Izinkan Lokasi pada browser.':'QR sudah terbaca, tetapi GPS belum mendapatkan posisi. Aktifkan lokasi dan coba lagi.')),
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
    setDecoder('Pemindai otomatis aktif · QR native + jsQR');
    return;
   }
  }catch{
   detector.current=null;
  }
  setDecoder('Pemindai otomatis aktif · jsQR');
 }

 async function getMedia(selectedCamera:string){
  const preferred:MediaTrackConstraints=selectedCamera
   ?{deviceId:{exact:selectedCamera}}
   :{facingMode:{ideal:'environment'}};
  try{
   return await navigator.mediaDevices.getUserMedia({
    video:{...preferred,width:{ideal:1280,min:640},height:{ideal:720,min:480},frameRate:{ideal:30,max:30}},
    audio:false
   });
  }catch(e){
   if(selectedCamera||!['OverconstrainedError','NotFoundError'].includes((e as Error).name))throw e;
   return navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  }
 }

 async function chooseMainRearCamera(media:MediaStream,selectedCamera:string){
  if(selectedCamera)return media;
  try{
   const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
   setCameras(devices);
   if(devices.length<2)return media;
   const current=media.getVideoTracks()[0];
   const currentId=current?.getSettings().deviceId||'';
   const currentScore=cameraScore({deviceId:currentId,kind:'videoinput',label:current?.label||'',groupId:'',toJSON:()=>({})} as MediaDeviceInfo);
   const best=[...devices].sort((a,b)=>cameraScore(b)-cameraScore(a))[0];
   if(!best?.deviceId||best.deviceId===currentId||cameraScore(best)<=currentScore+10)return media;

   const replacement=await getMedia(best.deviceId);
   media.getTracks().forEach(track=>track.stop());
   setCameraId(best.deviceId);
   return replacement;
  }catch{
   return media;
  }
 }

 async function enhanceCamera(track:MediaStreamTrack|undefined){
  if(!track)return;
  try{
   const caps=track.getCapabilities?.() as MediaTrackCapabilities&{focusMode?:string[];torch?:boolean};
   setTorchSupported(Boolean(caps?.torch));
   if(caps?.focusMode?.includes('continuous')){
    await track.applyConstraints({advanced:[{focusMode:'continuous'} as MediaTrackConstraintSet]});
   }
  }catch{
   // Camera enhancements are optional.
  }
 }

 async function toggleTorch(){
  const track=stream.current?.getVideoTracks()[0];
  if(!track||!torchSupported)return;
  const next=!torchOn;
  try{
   await track.applyConstraints({advanced:[{torch:next} as MediaTrackConstraintSet]});
   setTorchOn(next);
  }catch{
   setError('Lampu kamera tidak dapat diaktifkan pada perangkat ini.');
  }
 }

 async function start(selectedCamera=cameraId){
  if(starting||recording.current||stream.current)return;
  shutdown();
  const version=epoch.current;
  setActive(false);
  setError('');
  setStarting(true);
  setReceipt(null);
  setDetected(null);

  try{
   if(!window.isSecureContext)throw Error('Kamera memerlukan HTTPS. Buka alamat Vercel langsung.');
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Browser ini tidak menyediakan akses kamera. Gunakan Chrome, Edge, atau Safari terbaru.');

   let media=await getMedia(selectedCamera);
   if(!mounted.current||version!==epoch.current){media.getTracks().forEach(t=>t.stop());return;}

   media=await chooseMainRearCamera(media,selectedCamera);
   if(!mounted.current||version!==epoch.current){media.getTracks().forEach(t=>t.stop());return;}

   stream.current=media;
   const v=video.current;
   if(!v)throw Error('Pratinjau kamera belum siap.');

   v.srcObject=media;
   v.setAttribute('playsinline','true');
   v.muted=true;
   await v.play();

   if(!mounted.current||version!==epoch.current)return;

   const track=media.getVideoTracks()[0];
   setCameraId(track?.getSettings().deviceId||selectedCamera);
   await enhanceCamera(track);

   try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    if(version===epoch.current)setCameras(devices.filter(d=>d.kind==='videoinput'));
   }catch{
    // Optional.
   }

   track?.addEventListener('ended',()=>{
    if(mounted.current&&version===epoch.current){
     stop();
     setError('Kamera terputus. Nyalakan kamera kembali.');
    }
   },{once:true});

   setupNativeDetector();
   setActive(true);
   watchLocation(version);
   scheduleFrame(version);
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

 function readCanvasQR(source:CanvasImageSource,sx:number,sy:number,sw:number,sh:number,target:number,attemptBoth=true){
  const qrCanvas=canvas.current||(canvas.current=document.createElement('canvas'));
  const scale=Math.min(1.35,target/Math.max(sw,sh));
  qrCanvas.width=Math.max(1,Math.round(sw*scale));
  qrCanvas.height=Math.max(1,Math.round(sh*scale));
  const ctx=qrCanvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Browser tidak dapat membaca frame kamera.');
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(source,sx,sy,sw,sh,0,0,qrCanvas.width,qrCanvas.height);
  const pixels=ctx.getImageData(0,0,qrCanvas.width,qrCanvas.height);
  return jsQR(pixels.data,qrCanvas.width,qrCanvas.height,{inversionAttempts:attemptBoth?'attemptBoth':'dontInvert'})?.data||null;
 }

 function decodeJsQR(v:HTMLVideoElement,frame:number){
  const width=v.videoWidth,height=v.videoHeight;
  const min=Math.min(width,height);

  // The visual scan box is centered. Start with a tighter crop so small QR
  // modules stay large enough for low-end phone cameras.
  const tight=min*0.68;
  const tightValue=readCanvasQR(v,(width-tight)/2,(height-tight)/2,tight,tight,820,true);
  if(tightValue)return tightValue;

  // Every second processed frame also scans most of the visible picture.
  if(frame%2===0){
   const wide=min*0.92;
   const wideValue=readCanvasQR(v,(width-wide)/2,(height-wide)/2,wide,wide,900,true);
   if(wideValue)return wideValue;
  }

  // Full-frame fallback catches a code held outside the guide.
  if(frame%3===0)return readCanvasQR(v,0,0,width,height,960,true);
  return null;
 }

 async function nativeDetect(v:HTMLVideoElement){
  if(!detector.current)return null;
  if(!nativeInFlight.current){
   const current=detector.current;
   nativeInFlight.current=current.detect(v)
    .then(results=>results.find(item=>typeof item.rawValue==='string'&&item.rawValue.trim())?.rawValue||null)
    .catch(()=>{
     detector.current=null;
     setDecoder('Pemindai otomatis aktif · jsQR');
     return null;
    })
    .finally(()=>{nativeInFlight.current=null;});
  }
  return await Promise.race([
   nativeInFlight.current,
   new Promise<null>(resolve=>setTimeout(()=>resolve(null),90))
  ]);
 }

 async function decodeVideo(v:HTMLVideoElement,frame:number){
  // Native detection runs in parallel when the browser provides it; jsQR is
  // always available as the deterministic fallback.
  const nativePromise=detector.current?nativeDetect(v):Promise.resolve(null);
  const jsValue=decodeJsQR(v,frame);
  if(jsValue)return jsValue;
  return await nativePromise;
 }

 function scheduleFrame(version:number){
  if(version!==epoch.current||!mounted.current)return;
  const v=video.current as FrameVideo|null;
  if(v?.requestVideoFrameCallback){
   frameHandle.current=v.requestVideoFrameCallback(()=>{frameHandle.current=null;void scanFrame(version);});
  }else{
   timer.current=setTimeout(()=>{timer.current=null;void scanFrame(version);},120);
  }
 }

 async function scanFrame(version:number){
  if(version!==epoch.current||!mounted.current)return;
  const v=video.current;
  const now=performance.now();

  if(v&&v.readyState>=2&&v.videoWidth&&v.videoHeight&&!recording.current&&now-lastDecodeAt.current>=150){
   lastDecodeAt.current=now;
   frameNumber.current++;
   try{
    const value=await decodeVideo(v,frameNumber.current);
    if(value&&version===epoch.current){
     emptyFrames.current=0;
     const fingerprint=value.trim().slice(0,100);
     if(fingerprint!==latchedQR.current){
      latchedQR.current=fingerprint;
      setDecoder('QR TERBACA · memeriksa siswa…');
      await record(value,version);
     }
    }else{
     emptyFrames.current++;
     // Re-arm the same physical card only after it has been removed for a
     // number of consecutive frames. This prevents duplicate spam while still
     // allowing a deliberate second scan.
     if(emptyFrames.current>=8){
      latchedQR.current='';
      emptyFrames.current=8;
     }
     if(!working)setDecoder(detector.current?'Mencari QR otomatis · kamera aktif':'Mencari QR otomatis · jsQR aktif');
    }
   }catch(e){
    if(mounted.current&&version===epoch.current)setError((e as Error).message);
   }
  }

  if(mounted.current&&version===epoch.current)scheduleFrame(version);
 }

 async function lookupQR(token:string,version:number){
  const controller=new AbortController();
  pending.current=controller;
  const timeout=setTimeout(()=>controller.abort(),7000);
  try{
   const response=await fetch('/api/data',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    signal:controller.signal,
    body:JSON.stringify({action:'qr-status',token})
   });
   const result=await response.json() as {error?:string;student?:Detected;alreadyRecorded?:boolean;receipt?:Receipt};
   if(version!==epoch.current)return null;
   if(response.status===401){stop();window.location.assign('/login');return null;}
   if(!response.ok)throw Error(result.error||'QR tidak dapat diverifikasi.');
   return result;
  }finally{
   clearTimeout(timeout);
   pending.current=null;
  }
 }

 async function record(raw:string,version:number){
  if(version!==epoch.current||recording.current)return;
  const token=normalizeStudentQR(raw);
  const key=token||raw.trim().slice(0,100);
  if(!session.current.begin(key,jakartaDate()))return;

  recording.current=true;
  setWorking(true);
  setReceipt(null);
  setDetected(null);
  setError('');
  let succeeded=false;
  let cooldown=1200;

  try{
   if(!token){
    cooldown=3500;
    throw Error('QR terbaca, tetapi bukan QR siswa SANJARA.');
   }

   setDecoder('QR TERBACA · mencari data siswa…');

   let lookup:Awaited<ReturnType<typeof lookupQR>>=null;
   try{
    lookup=await lookupQR(token,version);
   }catch(e){
    if((e as Error).name==='AbortError')setDecoder('QR terbaca · koneksi lambat, mencoba simpan langsung…');
    else throw e;
   }

   if(version!==epoch.current)return;

   if(lookup?.student){
    setDetected(lookup.student);
    setDecoder('QR TERBACA · '+lookup.student.name);
   }

   if(lookup?.alreadyRecorded&&lookup.receipt){
    succeeded=true;
    setReceipt({...lookup.receipt,duplicate:true});
    setDecoder('SUDAH ABSEN HARI INI');
    session.current.complete(key,1000);
    navigator.vibrate?.([80,60,80]);
    return;
   }

   if(!hasStudents)setDecoder('QR terbaca · memeriksa database…');

   const location=await locate(version);
   if(version!==epoch.current)return;

   setDecoder('QR valid · menyimpan absensi otomatis…');

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
     if(attempt===2)throw Error('QR terbaca tetapi koneksi ke server gagal. Coba kembali.');
    }finally{
     clearTimeout(timeout);
     pending.current=null;
    }

    if(mounted.current&&version===epoch.current)setDecoder('QR terbaca · koneksi belum stabil, mencoba ulang…');
    await new Promise(resolve=>setTimeout(resolve,(attempt+1)*650));
   }

   if(version!==epoch.current||!mounted.current)return;

   if(response?.status===401){
    stop();
    window.location.assign('/login');
    return;
   }

   if(response&&(response.ok||response.status===409)&&result.receipt){
    succeeded=true;
    const duplicate=response.status===409;
    setReceipt({...result.receipt,duplicate});
    setDetected(null);
    setError('');
    setDecoder(duplicate?'SUDAH ABSEN HARI INI':'ABSEN BERHASIL · TERSIMPAN OTOMATIS');
    session.current.complete(key,1000);
    if(response.ok){
     setCount(n=>n+1);
     navigator.vibrate?.(100);
    }else{
     navigator.vibrate?.([80,60,80]);
    }
    void callback.current().catch(()=>{
     if(mounted.current)setError('Absensi sudah tersimpan, tetapi tabel rekap belum termuat ulang.');
    });
   }else{
    if(response?.status===404)cooldown=3500;
    throw Error(result.error||'QR terbaca, tetapi absensi belum berhasil disimpan.');
   }
  }catch(e){
   if(mounted.current&&version===epoch.current){
    setError((e as Error).message);
    setDecoder('QR terbaca · belum tersimpan');
   }
  }finally{
   if(version===epoch.current){
    if(!succeeded)session.current.fail(key,cooldown);
    recording.current=false;
    if(mounted.current)setWorking(false);
   }
  }
 }

 async function scanImage(file?:File){
  if(!file||recording.current)return;
  if(file.size>8*1024*1024){setError('Gambar QR maksimal 8 MB.');return;}

  const version=epoch.current;
  setError('');
  const url=URL.createObjectURL(file);

  try{
   const image=new Image();
   image.src=url;
   await image.decode();
   if(version!==epoch.current||!mounted.current)return;
   const side=Math.min(image.naturalWidth,image.naturalHeight);
   const value=readCanvasQR(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,1000,true)
    ||readCanvasQR(image,0,0,image.naturalWidth,image.naturalHeight,1200,true);
   if(!value)throw Error('QR tidak terbaca dari gambar. Gunakan foto yang tajam dan tidak terpotong.');
   latchedQR.current='';
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
   <span><i className={active?'live':''}/>{working?'QR terbaca · proses otomatis…':starting?'Mengaktifkan kamera…':active?'Pemindai otomatis aktif':'Kamera siap dinyalakan'}</span>
   <b>{count} absen baru</b>
  </div>

  <div className="camera-box">
   <video ref={video} autoPlay playsInline muted className={active||starting?'visible-video':''}/>
   {!active&&<div className="camera-placeholder">
    <ScanLine size={48}/>
    <span>{starting?'Mengaktifkan kamera…':'Kamera akan menyala otomatis.'}</span>
   </div>}
   {active&&<div className="scan-frame"/>}

   {detected&&!receipt&&<div className="scan-camera-result detected" aria-live="assertive">
    <ScanLine size={29}/>
    <div>
     <strong>QR TERBACA</strong>
     <span>{detected.name} · {detected.className}</span>
    </div>
   </div>}

   {receipt&&<div className={'scan-camera-result '+(receipt.duplicate?'duplicate':'success')} aria-live="assertive">
    <CheckCheck size={30}/>
    <div>
     <strong>{receipt.duplicate?'SUDAH ABSEN HARI INI':'ABSEN BERHASIL'}</strong>
     <span>{receipt.name} · {receipt.className}</span>
    </div>
   </div>}
  </div>

  <p className="scanner-engine">{decoder}</p>

  <div className="scanner-tools">
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
       setTimeout(()=>void start(id),100);
      }
     }}
    >
     {cameras.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||'Kamera '+(i+1)}</option>)}
    </select>
   </label>}

   {torchSupported&&active&&<button className="secondary scanner-torch" type="button" onClick={()=>void toggleTorch()}>
    <Flashlight size={16}/>{torchOn?'Matikan lampu':'Nyalakan lampu'}
   </button>}
  </div>

  <p className="scanner-gps" role="status">{gps}</p>

  {error&&<div role="alert" className="alert scanner-message">
   {error}
   <small>Jika tulisan “QR TERBACA” muncul, kamera bekerja dan masalah berada pada lokasi/server, bukan pembaca QR.</small>
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
      <Camera size={17}/>{starting?'Mengaktifkan kamera…':'Nyalakan kamera'}
     </button>
    :<button className="secondary full" onClick={stop}>
      <Square size={15}/>Hentikan pemindai
     </button>}
  </div>

  <label className={'secondary qr-image-button '+(working||starting?'disabled-upload':'')}>
   <ImageUp size={17}/>Tes / baca QR dari gambar
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
    ?'QR tetap dibaca otomatis. Untuk menyimpan kehadiran, atur Lokasi sekolah terlebih dahulu.'
    :!hasStudents
     ?'Kamera aktif. QR akan dicek langsung ke database.'
     :'Tidak perlu tombol scan. Arahkan QR ke kotak, tahan sekitar 0,5–1 detik, lalu jauhkan kartu setelah hasil muncul.'}
  </p>

  {!settings&&<button className="text-button" onClick={onSetup}>Atur lokasi sekolah</button>}
 </div>;
}
