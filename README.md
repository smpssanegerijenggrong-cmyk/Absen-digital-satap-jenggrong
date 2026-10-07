# SANJARA Hadir — Vercel Edition

Absensi QR SMP SSA Negeri Jenggrong Ranuyoso. Next.js 16, React, Neon PostgreSQL dan Drizzle. Mendukung lokasi sekolah, impor siswa, kartu ID dua sisi, surat izin otomatis dan unduh rekap CSV. Logo dan desain sekolah tetap digunakan.

## Pengaturan Vercel

1. Import repository `smpssanegerijenggrong-cmyk/absensi-ssanjenggrong`.
2. Root Directory: akar repo. Framework: **Next.js**. Install: `npm ci`. Build: `npm run build`. Output Directory: biarkan default Next.js, hapus override `dist` bila pernah diisi. Gunakan Node.js **24.x**.
3. Hubungkan database **Neon PostgreSQL** dari Vercel Marketplace/Storage ke proyek. Pastikan `DATABASE_URL` tersedia.
4. Tambahkan `ADMIN_PASSWORD` (minimal 16 karakter, kata sandi operator) dan `AUTH_SECRET` (acak, minimal 32 karakter) di Settings → Environment Variables. Jangan pakai prefix `NEXT_PUBLIC_`.
5. Buat struktur database melalui SQL Editor Neon dengan isi `migrations/0001_postgres.sql`. Alternatif: setelah proyek tertaut dan env ditarik ke `.env.local`, jalankan `npm run db:migrate`.
6. Redeploy. Masuk memakai kata sandi operator, tambah/impor siswa, lalu atur lokasi sekolah.

Untuk membuat secret acak di komputer sendiri: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Simpan hasilnya hanya dalam Environment Variables. Jangan commit kredensial ke repo.

Jika env belum lengkap, halaman login menampilkan petunjuk penyiapan. Build tidak memerlukan kredensial dan tidak menjalankan migrasi. Database dan login diperlukan untuk menggunakan aplikasi. Pisahkan database Production dan Preview bila menggunakan keduanya.

## Scan QR otomatis

1. Masuk sebagai operator dan pastikan siswa serta lokasi sekolah sudah tersimpan.
2. Buka aplikasi langsung melalui alamat HTTPS Vercel, pilih **Mulai absensi → Mulai scan otomatis**, lalu izinkan Kamera dan Lokasi.
3. Arahkan QR belakang kartu ke kamera. Setelah server mengonfirmasi, nama, NIPD, kelas, dan waktu hingga detik tampil. Kamera terus membaca kartu berikutnya tanpa tombol simpan.
4. Posisi GPS yang masih baru digunakan kembali dan dipantau; radius serta akurasi tetap diperiksa server. Koneksi gagal dicoba ulang otomatis. QR yang sama tidak menghasilkan catatan ganda, termasuk saat dua perangkat memindai bersamaan.
5. Bila kamera yang dipilih tidak sesuai, gunakan pilihan Kamera. Jika kamera tidak tersedia, gunakan **Baca QR dari gambar**; pencatatan tetap melalui QR dan validasi GPS.

QR harus berasal dari data siswa pada aplikasi ini. Kartu dari database lama yang tokennya berubah perlu dibuat ulang pada menu ID card siswa.

Absensi setelah **07.00.00 WIB** ditandai terlambat berdasarkan waktu server. Siswa tetap dihitung hadir; keterangan terlambat dan jumlah menit tampil di bukti scan, tabel harian, serta rekap. Tidak ada swafoto.

## Memeriksa kesiapan Vercel

Build berhasil tidak berarti database dan login sudah siap. Endpoint `/api/health` menghasilkan HTTP 200 dengan kode `READY` jika konfigurasi dan lima tabel tersedia; HTTP 503 berarti server belum siap. Halaman login menjelaskan konfigurasi, koneksi database, atau migrasi yang perlu diperbaiki tanpa menampilkan nilai rahasia.

- `CONFIGURATION_MISSING`: isi `DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`, kemudian redeploy.
- `SCHEMA_NOT_READY`: jalankan SQL `migrations/0001_postgres.sql` pada database yang terhubung, lalu muat ulang.
- `DATABASE_UNAVAILABLE`: periksa URL koneksi dan status database Neon.
- Setelah perubahan di GitHub, pastikan deployment Vercel memakai commit terbaru dari branch `main`.

Penolakan API Vercel dengan HTTP 403 untuk tim `sanjara1` adalah masalah hak akses koneksi pengelola. Kode aplikasi tidak dapat memberi koneksi tersebut izin baru. Pengaturan proyek perlu diperiksa menggunakan akun yang memiliki akses ke tim/proyek yang benar.

## Menjalankan lokal setelah konfigurasi

```sh
npm ci
# Hubungkan proyek Vercel, tarik env ke .env.local, lalu:
npm run db:migrate
npm run dev
```

## Verifikasi kode

```sh
npm run test
npm run typecheck
npm run build
# Uji kamera sintetis, retry jaringan, dan PostgreSQL sementara:
npx playwright install chromium
npm run test:browser
```

## Keamanan dan data

- Semua API siswa, absensi, surat dan halaman utama memerlukan sesi operator. Cookie ditandatangani, httpOnly, SameSite=Lax dan Secure pada production; sesi berlaku 8 jam.
- Percobaan login dibatasi melalui database. Perubahan kata sandi/secret membatalkan sesi lama.
- Catatan izin dan isi surat disimpan bersama di PostgreSQL. QR surat membuka salinan tersimpan setelah login; bukan verifikasi identitas orang tua.
- Tidak menggunakan filesystem lokal atau localStorage untuk database siswa.
- Logo/kartu adalah aset statis. Surat baru dibuat dari database dan bisa dicetak/disimpan PDF; tidak membutuhkan R2.
- Backup Google Drive belum aktif.

## Pemindahan dari Sites

Repository ini mengganti runtime Cloudflare/Vinext dengan Next.js Node.js. Data siswa, kehadiran dan lampiran di aplikasi Sites **tidak otomatis berpindah**. Aplikasi Sites asal tetap terpisah. Ekspor/impor siswa tersedia; pemindahan riwayat absensi dan lampiran lama memerlukan migrasi data tersendiri. Jangan menerapkan SQL SQLite lama pada Neon.

Versi ini tidak memerlukan akun ChatGPT untuk login, tetapi hanya ditujukan untuk guru/operator yang memiliki kata sandi. Jangan membagikan kata sandi operator kepada siswa/orang tua.
