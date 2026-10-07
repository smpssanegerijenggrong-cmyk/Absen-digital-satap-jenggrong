export function storageError(error: unknown) {
  let current = error as { code?: string; message?: string; cause?: unknown } | undefined;
  for (let i = 0; current && i < 4; i++) {
    if (current.code === '42P01' || /relation .* does not exist/i.test(current.message || '')) {
      return { code: 'SCHEMA_NOT_READY', error: 'Struktur database belum siap. Jalankan migrasi database SANJARA, lalu muat ulang aplikasi.', status: 503 };
    }
    if (current.code === '23505' || /duplicate key|UNIQUE constraint/i.test(current.message || '')) {
      return { code: 'DUPLICATE', error: 'Data sudah terdaftar. Periksa NIPD atau catatan absensi pada tanggal tersebut.', status: 409 };
    }
    current = current.cause as typeof current;
  }
  return { code: 'DATABASE_UNAVAILABLE', error: 'Database belum dapat dihubungi. Periksa DATABASE_URL dan koneksi database pada pengaturan Vercel.', status: 503 };
}
