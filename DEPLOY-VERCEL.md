# Deploy SANJARA Hadir ke Vercel

1. Import repository GitHub ini ke Vercel dengan Framework Preset **Next.js**.
2. Jangan isi Output Directory secara manual.
3. Hubungkan database Neon PostgreSQL dan isi `DATABASE_URL`.
4. Redeploy aplikasi. Build akan menjalankan migrasi database secara otomatis dan hanya menerapkan migrasi yang belum pernah dijalankan.
5. Jika perlu menjalankan manual dari lokal, gunakan `npm run db:migrate`.
6. Buka `/api/health`; status siap adalah HTTP 200 dengan kode `READY`.
7. Login operator lalu uji scan QR melalui alamat HTTPS deployment.

## Login operator
- Username default: `operator`
- Password bawaan tersedia untuk administrator sekolah.
- `ADMIN_USERNAME` bersifat opsional untuk mengganti username.
- `ADMIN_PASSWORD` bersifat opsional untuk mengganti password bawaan.
- `AUTH_SECRET` bersifat opsional. Jika kosong, aplikasi membuat material signing dari `DATABASE_URL`.

## Kamera dan GPS
- Kamera browser memerlukan HTTPS (kecuali localhost).
- Izinkan Camera dan Location di browser.
- QR hanya diterima dari kartu yang dibuat aplikasi SANJARA Hadir.
- Absensi setelah 07.00.00 WIB otomatis diberi tanda terlambat.


## Struktur Database v2
- Jurnal migrasi: `schema_migrations`.
- Timestamp audit pada siswa, kelas, lokasi sekolah, dan catatan absensi.
- Index untuk pencarian siswa, kelas, tanggal, status, dan rekap bulanan.
- Constraint database untuk status absensi, metode, koordinat GPS, radius, serta data izin.
- Migrasi bersifat additive dan mempertahankan data lama.
