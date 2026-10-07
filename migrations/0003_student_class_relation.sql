-- SANJARA Hadir Database v3
-- Normalisasi relasi siswa -> kelas tanpa menghapus data lama.

INSERT INTO classrooms(name)
SELECT DISTINCT class_name
FROM students
WHERE btrim(class_name) <> ''
ON CONFLICT (name) DO NOTHING;

DO $migration$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='students_class_name_fkey_v2') THEN
  ALTER TABLE students
   ADD CONSTRAINT students_class_name_fkey_v2
   FOREIGN KEY (class_name)
   REFERENCES classrooms(name)
   ON UPDATE CASCADE
   ON DELETE RESTRICT
   NOT VALID;
 END IF;
END
$migration$;
