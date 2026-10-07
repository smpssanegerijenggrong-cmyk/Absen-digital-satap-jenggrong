# Deploy SANJARA Hadir ke Vercel

1. Upload/push folder ini ke repository GitHub.
2. Import repository tersebut di Vercel dengan Framework Preset **Next.js**.
3. Jangan isi Output Directory secara manual. Biarkan Vercel mendeteksi output Next.js.
4. Hubungkan database Neon PostgreSQL dan isi `DATABASE_URL`.
5. Tambahkan Environment Variables:
   - `ADMIN_PASSWORD` — minimal 16 karakter.
   - `AUTH_SECRET` — secret acak minimal 32 karakter.
6. Jalankan isi `migrations/0001_postgres.sql` pada SQL Editor database Neon.
7. Redeploy aplikasi.
8. Buka `/api/health`. Status siap adalah HTTP 200 dengan kode `READY`.
9. Login operator, impor data siswa, atur titik lokasi sekolah, lalu uji scan QR melalui alamat HTTPS deployment.

Catatan kamera dan GPS:
- Kamera browser memerlukan HTTPS (kecuali localhost).
- Izinkan Camera dan Location di browser.
- QR hanya diterima dari kartu yang dibuat aplikasi SANJARA Hadir.
- Absensi setelah 07.00.00 WIB otomatis diberi tanda terlambat.
