export const reasons=['Keperluan keluarga','Acara keluarga','Keluarga berduka','Urusan administrasi','Kegiatan di luar sekolah','Lainnya'];
export type SchoolLocation={latitude:number;longitude:number;radius:number};
export function validCoordinates(lat:unknown,lon:unknown){return typeof lat==='number'&&Number.isFinite(lat)&&Math.abs(lat)<=90&&typeof lon==='number'&&Number.isFinite(lon)&&Math.abs(lon)<=180;}
export function distanceMeters(a:number,b:number,c:number,d:number){const rad=(n:number)=>n*Math.PI/180;const h=Math.sin(rad(c-a)/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function checkLocation(school:SchoolLocation|undefined,location:unknown,now=Date.now()){
 if(!school)throw Error('Lokasi sekolah belum diatur. Guru perlu mengatur titik dan radius sekolah terlebih dahulu.');
 if(!location||typeof location!=='object')throw Error('Lokasi diperlukan untuk absensi hadir. Aktifkan izin lokasi.');
 const p=location as Record<string,unknown>;
 if(!validCoordinates(p.latitude,p.longitude)||typeof p.accuracy!=='number'||!Number.isFinite(p.accuracy)||p.accuracy<0||typeof p.timestamp!=='number'||!Number.isFinite(p.timestamp)||now-p.timestamp>120000||p.timestamp-now>30000)throw Error('Lokasi tidak valid atau kedaluwarsa. Ambil lokasi terbaru.');
 const limit=Math.min(100,school.radius);if(p.accuracy>limit)throw Error(`GPS belum cukup akurat (±${Math.round(p.accuracy)} m). Pindah ke area terbuka dan coba lagi; akurasi harus ≤ ${limit} m.`);
 const distance=distanceMeters(school.latitude,school.longitude,p.latitude as number,p.longitude as number);
 if(distance>school.radius)throw Error(`Anda berada di luar lokasi sekolah (${Math.round(distance)} m). Batas absensi ${school.radius} m.`);
 return {distance:Math.round(distance),latitude:p.latitude as number,longitude:p.longitude as number,accuracy:p.accuracy};
}
export function checkLeave(status:string,reason:unknown,note:unknown){if(status!=='Izin')return;if(typeof reason!=='string'||!reasons.includes(reason))throw Error('Pilih alasan izin.');if(typeof note!=='string'||note.length>1000)throw Error('Keterangan maksimal 1.000 karakter.');if(reason==='Lainnya'&&!note.trim())throw Error('Tuliskan keterangan untuk alasan Lainnya.');}
export function decodeLetter(value:unknown){if(typeof value!=='string'||value.length>7100000)throw Error('Surat izin maksimal 5 MB.');const match=/^data:(application\/pdf|image\/jpeg|image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(value);if(!match)throw Error('Surat harus berupa PDF, JPG, atau PNG.');let raw;try{raw=atob(match[2]);}catch{throw Error('File surat tidak valid.');}const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length>5*1024*1024||bytes.length<8)throw Error('Surat kosong atau melebihi 5 MB.');const type=match[1];const valid=type==='application/pdf'?raw.startsWith('%PDF-'):type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x);if(!valid)throw Error('Isi file surat tidak sesuai format.');return {bytes,type,extension:type==='application/pdf'?'pdf':type==='image/jpeg'?'jpg':'png'};}
