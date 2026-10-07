import {neon} from '@neondatabase/serverless';
import {drizzle} from 'drizzle-orm/neon-http';
import * as schema from './schema';
export function getDb(){const url=process.env.DATABASE_URL;if(!url)throw Error('DATABASE_URL belum diatur.');return drizzle(neon(url),{schema});}
