-- SANJARA Hadir Database v2
-- Migrasi ini bersifat additive: data lama dipertahankan.

ALTER TABLE students
 ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE students
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE attendance
 ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE settings
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE classrooms
 ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE classrooms
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_students_class_name ON students(class_name);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);
CREATE INDEX IF NOT EXISTS idx_students_nisn ON students(nisn);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id,date);
CREATE INDEX IF NOT EXISTS idx_attendance_status_date ON attendance(status,date);
CREATE INDEX IF NOT EXISTS idx_attendance_time ON attendance(time);

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON classrooms(teacher);
CREATE INDEX IF NOT EXISTS idx_login_attempts_window ON login_attempts(window_start);

DO $migration$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='students_gender_check') THEN
  ALTER TABLE students ADD CONSTRAINT students_gender_check CHECK (gender IN ('','L','P')) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='students_nis_not_blank_check') THEN
  ALTER TABLE students ADD CONSTRAINT students_nis_not_blank_check CHECK (btrim(nis) <> '') NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='students_name_not_blank_check') THEN
  ALTER TABLE students ADD CONSTRAINT students_name_not_blank_check CHECK (btrim(name) <> '') NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='students_class_not_blank_check') THEN
  ALTER TABLE students ADD CONSTRAINT students_class_not_blank_check CHECK (btrim(class_name) <> '') NOT VALID;
 END IF;
END
$migration$;

DO $migration$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='attendance_status_check') THEN
  ALTER TABLE attendance ADD CONSTRAINT attendance_status_check CHECK (status IN ('Hadir','Izin','Sakit','Alpa')) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='attendance_method_check') THEN
  ALTER TABLE attendance ADD CONSTRAINT attendance_method_check CHECK (method IN ('QR','Manual')) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='attendance_geo_check') THEN
  ALTER TABLE attendance ADD CONSTRAINT attendance_geo_check CHECK (
   (latitude IS NULL AND longitude IS NULL AND accuracy IS NULL AND distance IS NULL)
   OR
   (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND accuracy >= 0 AND distance >= 0)
  ) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='attendance_leave_check') THEN
  ALTER TABLE attendance ADD CONSTRAINT attendance_leave_check CHECK (
   status <> 'Izin'
   OR (
    parent_name IS NOT NULL AND btrim(parent_name) <> ''
    AND reason IS NOT NULL AND btrim(reason) <> ''
   )
  ) NOT VALID;
 END IF;
END
$migration$;

DO $migration$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='settings_latitude_check') THEN
  ALTER TABLE settings ADD CONSTRAINT settings_latitude_check CHECK (latitude BETWEEN -90 AND 90) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='settings_longitude_check') THEN
  ALTER TABLE settings ADD CONSTRAINT settings_longitude_check CHECK (longitude BETWEEN -180 AND 180) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='settings_radius_check') THEN
  ALTER TABLE settings ADD CONSTRAINT settings_radius_check CHECK (radius BETWEEN 20 AND 2000) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='classrooms_name_not_blank_check') THEN
  ALTER TABLE classrooms ADD CONSTRAINT classrooms_name_not_blank_check CHECK (btrim(name) <> '') NOT VALID;
 END IF;
END
$migration$;
