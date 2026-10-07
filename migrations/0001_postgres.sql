CREATE TABLE IF NOT EXISTS students (
 id text PRIMARY KEY, nis text NOT NULL UNIQUE, nisn text NOT NULL DEFAULT '',
 gender text NOT NULL DEFAULT '', name text NOT NULL, class_name text NOT NULL, token text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS attendance (
 id text PRIMARY KEY, student_id text NOT NULL REFERENCES students(id), date text NOT NULL,
 time text NOT NULL, status text NOT NULL, method text NOT NULL, photo text, reason text, note text,
 letter text, parent_name text, letter_data text, latitude real, longitude real, accuracy real, distance real,
 CONSTRAINT one_per_day UNIQUE (student_id,date)
);
CREATE TABLE IF NOT EXISTS settings (id text PRIMARY KEY, latitude real NOT NULL, longitude real NOT NULL, radius real NOT NULL);
CREATE TABLE IF NOT EXISTS classrooms (name text PRIMARY KEY, teacher text NOT NULL DEFAULT '', room text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS login_attempts (key text PRIMARY KEY, window_start bigint NOT NULL, attempts integer NOT NULL DEFAULT 0);
