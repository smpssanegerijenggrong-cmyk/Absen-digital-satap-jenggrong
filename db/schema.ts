import { pgTable, text, real, uniqueIndex } from 'drizzle-orm/pg-core';
export const students = pgTable('students', {id:text('id').primaryKey(),nis:text('nis').notNull().unique(),nisn:text('nisn').notNull().default(''),gender:text('gender').notNull().default(''),name:text('name').notNull(),className:text('class_name').notNull(),token:text('token').notNull().unique()});
export const attendance = pgTable('attendance',{id:text('id').primaryKey(),studentId:text('student_id').notNull().references(()=>students.id),date:text('date').notNull(),time:text('time').notNull(),status:text('status').notNull(),method:text('method').notNull(),photo:text('photo'),reason:text('reason'),note:text('note'),letter:text('letter'),parentName:text('parent_name'),letterData:text('letter_data'),latitude:real('latitude'),longitude:real('longitude'),accuracy:real('accuracy'),distance:real('distance')},t=>[uniqueIndex('one_per_day').on(t.studentId,t.date)]);

export const settings=pgTable('settings',{id:text('id').primaryKey(),latitude:real('latitude').notNull(),longitude:real('longitude').notNull(),radius:real('radius').notNull()});

export const classrooms=pgTable('classrooms',{name:text('name').primaryKey(),teacher:text('teacher').notNull().default(''),room:text('room').notNull().default('')});
