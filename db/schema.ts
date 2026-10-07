import {sql} from 'drizzle-orm';
import {bigint,check,index,integer,pgTable,real,text,timestamp,uniqueIndex} from 'drizzle-orm/pg-core';

export const classrooms=pgTable('classrooms',{
 name:text('name').primaryKey(),
 teacher:text('teacher').notNull().default(''),
 room:text('room').notNull().default(''),
 createdAt:timestamp('created_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),
 updatedAt:timestamp('updated_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),
},t=>[
 index('idx_classrooms_teacher').on(t.teacher),
 check('classrooms_name_not_blank_check',sql`btrim(${t.name}) <> ''`),
]);

export const students=pgTable('students',{
 id:text('id').primaryKey(),
 nis:text('nis').notNull().unique(),
 nisn:text('nisn').notNull().default(''),
 gender:text('gender').notNull().default(''),
 name:text('name').notNull(),
 className:text('class_name').notNull().references(()=>classrooms.name,{onUpdate:'cascade',onDelete:'restrict'}),
 token:text('token').notNull().unique(),
 createdAt:timestamp('created_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),
 updatedAt:timestamp('updated_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),
},t=>[
 index('idx_students_class_name').on(t.className),
 index('idx_students_name').on(t.name),
 index('idx_students_nisn').on(t.nisn),
 check('students_gender_check',sql`${t.gender} in ('','L','P')`),
 check('students_nis_not_blank_check',sql`btrim(${t.nis}) <> ''`),
 check('students_name_not_blank_check',sql`btrim(${t.name}) <> ''`),
 check('students_class_not_blank_check',sql`btrim(${t.className}) <> ''`),
]);

export const attendance=pgTable('attendance',{
 id:text('id').primaryKey(),
 studentId:text('student_id').notNull().references(()=>students.id,{onDelete:'restrict'}),
 date:text('date').notNull(),
 time:text('time').notNull(),
 status:text('status').notNull(),
 method:text('method').notNull(),
 photo:text('photo'),
 reason:text('reason'),
 note:text('note'),
 letter:text('letter'),
 parentName:text('parent_name'),
 letterData:text('letter_data'),
 latitude:real('latitude'),
 longitude:real('longitude'),
 accuracy:real('accuracy'),
 distance:real('distance'),
 createdAt:timestamp('created_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),
},t=>[
 uniqueIndex('one_per_day').on(t.studentId,t.date),
 index('idx_attendance_date').on(t.date),
 index('idx_attendance_student_date').on(t.studentId,t.date),
 index('idx_attendance_status_date').on(t.status,t.date),
 index('idx_attendance_time').on(t.time),
 check('attendance_status_check',sql`${t.status} in ('Hadir','Izin','Sakit','Alpa')`),
 check('attendance_method_check',sql`${t.method} in ('QR','Manual')`),
 check('attendance_geo_check',sql`(
  (${t.latitude} is null and ${t.longitude} is null and ${t.accuracy} is null and ${t.distance} is null)
  or
  (${t.latitude} between -90 and 90 and ${t.longitude} between -180 and 180 and ${t.accuracy} >= 0 and ${t.distance} >= 0)
 )`),
 check('attendance_leave_check',sql`${t.status} <> 'Izin' or (
  ${t.parentName} is not null and btrim(${t.parentName}) <> '' and
  ${t.reason} is not null and btrim(${t.reason}) <> ''
 )`),
]);

export const settings=pgTable('settings',{
 id:text('id').primaryKey(),
 latitude:real('latitude').notNull(),
 longitude:real('longitude').notNull(),
 radius:real('radius').notNull(),
 updatedAt:timestamp('updated_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),
},t=>[
 check('settings_latitude_check',sql`${t.latitude} between -90 and 90`),
 check('settings_longitude_check',sql`${t.longitude} between -180 and 180`),
 check('settings_radius_check',sql`${t.radius} between 20 and 2000`),
]);

export const loginAttempts=pgTable('login_attempts',{
 key:text('key').primaryKey(),
 windowStart:bigint('window_start',{mode:'number'}).notNull(),
 attempts:integer('attempts').notNull().default(0),
},t=>[
 index('idx_login_attempts_window').on(t.windowStart),
]);

export const schemaMigrations=pgTable('schema_migrations',{
 name:text('name').primaryKey(),
 checksum:text('checksum').notNull(),
 appliedAt:timestamp('applied_at',{withTimezone:true,mode:'string'}).notNull().defaultNow(),
});
