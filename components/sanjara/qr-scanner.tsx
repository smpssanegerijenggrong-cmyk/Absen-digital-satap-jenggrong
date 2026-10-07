'use client';

import {useEffect, useRef, useState} from 'react';
import {Camera, CheckCheck, ImageUp, ScanLine, Square} from 'lucide-react';
import jsQR from 'jsqr';
import {checkLocation, type SchoolLocation} from '../../lib/attendance-rules';
import {attendanceTiming, clockWIB, jakartaDate} from '../../lib/attendance-time';
import {normalizeStudentQR, ScanSession} from '../../lib/qr-session';

type Position = {latitude: number; longitude: number; accuracy: number; timestamp: number};
type Receipt = {name: string; nis: string; nisn?: string; className: string; status: string; time: string; duplicate?: boolean};
type Props = {settings: SchoolLocation | null; hasStudents: boolean; onRecorded: () => Promise<void>; onSetup: () => void};

function cameraMessage(error: unknown) {
  const e = error as Error;
  if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'Izin kamera ditolak. Izinkan Kamera pada pengaturan situs, lalu mulai lagi. Jika memakai pratinjau, buka alamat aplikasi langsung di browser.';
  if (e.name === 'NotFoundError') return 'Kamera tidak ditemukan. Hubungkan kamera atau pindai melalui ponsel.';
  if (e.name === 'NotReadableError') return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut, lalu mulai lagi.';
  return e.message || 'Kamera belum dapat diaktifkan.';
}

export default function QRScanner({settings, hasStudents, onRecorded, onSetup}: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const callback = useRef(onRecorded);
  const session = useRef(new ScanSession());
  const position = useRef<Position | null>(null);
  const watch = useRef<number | null>(null);
  const pending = useRef<AbortController | null>(null);
  const recording = useRef(false);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [gps, setGps] = useState('GPS diperiksa saat pemindai dimulai');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [count, setCount] = useState(0);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState('');
  callback.current = onRecorded;

  function shutdown() {
    epoch.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current?.abort();
    pending.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    position.current = null;
    recording.current = false;
    session.current.cancel();
  }

  function stop() {
    shutdown();
    setActive(false);
    setStarting(false);
    setWorking(false);
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; shutdown(); };
  }, []);

  function updatePosition(p: GeolocationPosition) {
    const location = {latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp};
    position.current = location;
    try {
      checkLocation(settings || undefined, location);
      setGps('Lokasi sekolah valid · akurasi ±' + Math.round(location.accuracy) + ' m');
    } catch (e) { setGps((e as Error).message); }
    return location;
  }

  function watchLocation(version: number) {
    if (!navigator.geolocation) { setGps('Browser tidak mendukung lokasi.'); return; }
    setGps('Mencari lokasi sekolah…');
    watch.current = navigator.geolocation.watchPosition(p => {
      if (mounted.current && version === epoch.current) updatePosition(p);
    }, e => {
      if (mounted.current && version === epoch.current) setGps(e.code === 1 ? 'Izinkan Lokasi pada pengaturan situs untuk mencatat kehadiran.' : 'GPS belum tersedia. Aktifkan lokasi perangkat; pemindai akan mencoba kembali.');
    }, {enableHighAccuracy: true, maximumAge: 15000, timeout: 15000});
  }

  async function locate(version: number): Promise<Position> {
    if (position.current && Date.now() - position.current.timestamp < 60000) {
      try { checkLocation(settings || undefined, position.current); return position.current; } catch { /* Ask GPS for a better position. */ }
    }
    if (!navigator.geolocation) throw Error('Browser tidak mendukung lokasi.');
    const location = await new Promise<Position>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(p => {
        if (!mounted.current || version !== epoch.current) { reject(Error('Pemindai dihentikan.')); return; }
        resolve(updatePosition(p));
      }, e => reject(Error(e.code === 1 ? 'Izin lokasi ditolak. Izinkan Lokasi pada pengaturan situs.' : 'Lokasi belum tersedia. Aktifkan GPS dan coba di area terbuka.')), {enableHighAccuracy: true, maximumAge: 15000, timeout: 15000});
    });
    checkLocation(settings || undefined, location);
    return location;
  }

  async function start(selectedCamera = cameraId) {
    if (starting || recording.current) return;
    shutdown();
    const version = epoch.current;
    setActive(false);
    setError('');
    setStarting(true);
    try {
      if (!settings) throw Error('Atur lokasi sekolah terlebih dahulu.');
      if (!hasStudents) throw Error('Tambahkan data siswa terlebih dahulu.');
      if (!window.isSecureContext) throw Error('Kamera memerlukan alamat HTTPS. Buka alamat aplikasi Vercel langsung di browser.');
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Browser ini tidak menyediakan akses kamera. Gunakan Chrome, Edge, atau Safari pada alamat aplikasi langsung.');
      const constraints: MediaTrackConstraints = selectedCamera ? {deviceId: {exact: selectedCamera}} : {facingMode: {ideal: 'environment'}};
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({video: {...constraints, width: {ideal: 1280}, height: {ideal: 720}}, audio: false});
      } catch (e) {
        if (!['OverconstrainedError', 'NotFoundError'].includes((e as Error).name) || version !== epoch.current) throw e;
        media = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
      }
      if (!mounted.current || version !== epoch.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const v = video.current;
      if (!v) throw Error('Pratinjau kamera belum siap. Mulai kembali.');
      v.srcObject = media;
      await v.play();
      if (!mounted.current || version !== epoch.current) return;
      setCameraId(media.getVideoTracks()[0]?.getSettings().deviceId || selectedCamera);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (version === epoch.current) setCameras(devices.filter(d => d.kind === 'videoinput'));
      } catch { /* Scanning also works when enumeration is unavailable. */ }
      if (!mounted.current || version !== epoch.current) return;
      media.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (mounted.current && version === epoch.current) { stop(); setError('Kamera terputus. Hubungkan kembali lalu mulai pemindai.'); }
      }, {once: true});
      setActive(true);
      watchLocation(version);
      tick(version);
    } catch (e) {
      if (mounted.current && version === epoch.current) { shutdown(); setActive(false); setError(cameraMessage(e)); }
    } finally { if (mounted.current && (version === epoch.current || !stream.current)) setStarting(false); }
  }

  async function record(raw: string, version: number) {
    if (version !== epoch.current || recording.current) return;
    const token = normalizeStudentQR(raw);
    const key = token || raw.slice(0, 100);
    if (!session.current.begin(key, jakartaDate())) return;
    recording.current = true;
    setWorking(true);
    setError('');
    let succeeded = false;
    let cooldown = 2500;
    try {
      if (!token) { cooldown = 8000; throw Error('QR ini bukan kartu siswa SANJARA. Gunakan QR dari menu ID card siswa.'); }
      const location = await locate(version);
      if (version !== epoch.current) return;
      let result: {error?: string; receipt?: Receipt} = {};
      let response: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (version !== epoch.current) return;
        const controller = new AbortController();
        pending.current = controller;
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
          response = await fetch('/api/data', {method: 'POST', headers: {'Content-Type': 'application/json'}, signal: controller.signal, body: JSON.stringify({action: 'attendance', method: 'QR', token, location})});
          result = await response.json();
          if (response.status < 500 || attempt === 2) break;
        } catch {
          if (version !== epoch.current) return;
          if (attempt === 2) throw Error('Koneksi terputus atau terlalu lama. QR akan dicoba kembali otomatis; catatan ganda tetap dicegah.');
        } finally { clearTimeout(timeout); pending.current = null; }
        if (mounted.current && version === epoch.current) setError('Koneksi belum stabil. Mencoba menyimpan ulang otomatis…');
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 700));
      }
      if (version !== epoch.current || !mounted.current) return;
      if (response?.status === 401) { stop(); window.location.assign('/login'); return; }
      if (response && (response.ok || response.status === 409) && result.receipt) {
        succeeded = true;
        session.current.complete(key);
        setReceipt({...result.receipt, duplicate: response.status === 409});
        setError('');
        if (response.ok) { setCount(n => n + 1); navigator.vibrate?.(80); }
        // A slow refresh must not stop the camera or mark a saved receipt as failed.
        void callback.current().catch(() => {
          if (mounted.current) setError('Kehadiran tersimpan. Tampilan rekap belum diperbarui; muat ulang setelah selesai memindai.');
        });
      } else {
        if (response?.status === 404) cooldown = 8000;
        throw Error(result.error || 'Penyimpanan belum berhasil. QR akan dicoba kembali otomatis.');
      }
    } catch (e) {
      if (mounted.current && version === epoch.current) setError((e as Error).message);
    } finally {
      if (version === epoch.current) {
        if (!succeeded) session.current.fail(key, cooldown);
        recording.current = false;
        if (mounted.current) setWorking(false);
      }
    }
  }

  function decode(source: CanvasImageSource, width: number, height: number) {
    const c = canvas.current || (canvas.current = document.createElement('canvas'));
    const ratio = Math.min(1, 1280 / Math.max(width, height));
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d', {willReadFrequently: true});
    if (!ctx) throw Error('Browser tidak dapat membaca gambar kamera.');
    ctx.drawImage(source, 0, 0, c.width, c.height);
    const pixels = ctx.getImageData(0, 0, c.width, c.height);
    return jsQR(pixels.data, c.width, c.height, {inversionAttempts: 'attemptBoth'})?.data;
  }

  function tick(version: number) {
    if (version !== epoch.current) return;
    const v = video.current;
    if (!recording.current && v && v.readyState >= 2 && v.videoWidth && v.videoHeight) {
      try {
        const value = decode(v, v.videoWidth, v.videoHeight);
        if (value) void record(value, version);
      } catch (e) { if (mounted.current) setError((e as Error).message); }
    }
    timer.current = setTimeout(() => tick(version), 180);
  }

  async function scanImage(file?: File) {
    if (!file || recording.current) return;
    if (file.size > 8 * 1024 * 1024) { setError('Gambar QR maksimal 8 MB.'); return; }
    const version = epoch.current;
    setError('');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (version !== epoch.current || !mounted.current) return;
      const value = decode(image, image.naturalWidth, image.naturalHeight);
      if (!value) throw Error('QR tidak terbaca dari gambar. Pilih foto yang jelas dan memuat seluruh kotak QR.');
      await record(value, version);
    } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { URL.revokeObjectURL(url); }
  }

  const timing = receipt && attendanceTiming(receipt.time, receipt.status);
  const enabled = !!settings && hasStudents;
  return <div>
    <div className="scanner-status" aria-live="polite"><span><i className={active ? 'live' : ''}/>{working ? 'Memeriksa lokasi & menyimpan…' : active ? 'Pemindai aktif · tunjukkan kartu berikutnya' : 'Siap memulai pemindaian'}</span><b>{count} tercatat</b></div>
    <div className="camera-box">
      <video ref={video} autoPlay playsInline muted className={active || starting ? 'visible-video' : ''}/>
      {!active && <div className="camera-placeholder"><ScanLine size={48}/><span>{starting ? 'Mengaktifkan kamera…' : 'Sekali aktifkan, kartu dibaca otomatis'}</span></div>}
      {active && <div className="scan-frame"/>}
    </div>
    {cameras.length > 1 && <label className="camera-picker">Kamera<select aria-label="Pilih kamera" value={cameraId} disabled={starting || working} onChange={e => {setCameraId(e.target.value); if (active) void start(e.target.value);}}>{cameras.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Kamera ' + (i + 1)}</option>)}</select></label>}
    <p className="scanner-gps" role="status">{gps}</p>
    {error && <div role="alert" className="alert scanner-message">{error}<small>Pemindai tetap mencoba otomatis saat QR terlihat. Kehadiran baru dinyatakan tersimpan setelah server mengonfirmasi.</small></div>}
    {receipt && <div role="status" className={'scan-receipt ' + (receipt.duplicate ? 'duplicate' : '')}><CheckCheck size={27}/><div><small>{receipt.duplicate ? 'SUDAH TERCATAT HARI INI' : 'KEHADIRAN TERSIMPAN'}</small><h3>{receipt.name}</h3><p>NIPD {receipt.nis} · NISN {receipt.nisn || '—'} · {receipt.className}</p><b>{receipt.status} · {clockWIB(receipt.time)} WIB{timing?.label ? ' · ' + timing.label + (timing.late ? ' ' + timing.lateMinutes + ' menit' : '') : ''}</b></div></div>}
    <div className="button-row">
      {!active ? <button disabled={starting || working || !enabled} className="primary full" onClick={() => void start()}><Camera size={17}/>{starting ? 'Mengaktifkan kamera…' : 'Mulai scan otomatis'}</button> : <button className="secondary full" onClick={stop}><Square size={15}/>Hentikan pemindai</button>}
    </div>
    <label className={'secondary qr-image-button ' + (!enabled || working || starting ? 'disabled-upload' : '')}><ImageUp size={17}/>Baca QR dari gambar<input type="file" aria-label="Baca QR dari gambar" accept="image/png,image/jpeg,image/webp" disabled={!enabled || working || starting} onChange={e => {void scanImage(e.target.files?.[0]); e.target.value = '';}}/></label>
    <p className="helper">{!settings ? 'Lokasi sekolah belum diatur.' : !hasStudents ? 'Tambahkan siswa terlebih dahulu.' : 'QR otomatis disimpan, lalu lanjut ke kartu berikutnya. GPS sekolah tetap wajib. Jam setelah 07.00 WIB ditandai terlambat.'}</p>
    {!settings && <button className="text-button" onClick={onSetup}>Atur lokasi sekolah</button>}
  </div>;
}
