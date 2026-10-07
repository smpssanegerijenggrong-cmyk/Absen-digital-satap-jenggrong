import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {neon} from '@neondatabase/serverless';

const optional=process.argv.includes('--optional');
if(!process.env.DATABASE_URL){
 if(optional){
  console.warn('DATABASE_URL belum tersedia; migrasi dilewati pada build ini.');
  process.exit(0);
 }
 throw Error('DATABASE_URL belum diatur. Hubungkan Neon dan isi .env.local terlebih dahulu.');
}

const sql=neon(process.env.DATABASE_URL);
const migrationsUrl=new URL('../migrations/',import.meta.url);

function splitSqlStatements(source){
 const statements=[];
 let current='',single=false,double=false,lineComment=false,blockComment=false,dollarTag='';

 for(let i=0;i<source.length;i++){
  const ch=source[i],next=source[i+1]||'';

  if(lineComment){
   current+=ch;
   if(ch==='\n')lineComment=false;
   continue;
  }

  if(blockComment){
   current+=ch;
   if(ch==='*'&&next==='/'){current+=next;i++;blockComment=false;}
   continue;
  }

  if(dollarTag){
   if(source.startsWith(dollarTag,i)){
    current+=dollarTag;
    i+=dollarTag.length-1;
    dollarTag='';
   }else current+=ch;
   continue;
  }

  if(!single&&!double&&ch==='-'&&next==='-'){
   current+=ch+next;i++;lineComment=true;continue;
  }

  if(!single&&!double&&ch==='/'&&next==='*'){
   current+=ch+next;i++;blockComment=true;continue;
  }

  if(!single&&!double&&ch==='$'){
   const match=source.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
   if(match){
    dollarTag=match[0];
    current+=dollarTag;
    i+=dollarTag.length-1;
    continue;
   }
  }

  if(ch==="'"&&!double){
   if(single&&next==="'"){current+=ch+next;i++;continue;}
   single=!single;current+=ch;continue;
  }

  if(ch==='"'&&!single){
   if(double&&next==='"'){current+=ch+next;i++;continue;}
   double=!double;current+=ch;continue;
  }

  if(ch===';'&&!single&&!double){
   if(current.trim())statements.push(current.trim());
   current='';
   continue;
  }

  current+=ch;
 }

 if(current.trim())statements.push(current.trim());
 return statements;
}

try{
 await sql.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
   name text PRIMARY KEY,
   checksum text NOT NULL,
   applied_at timestamptz NOT NULL DEFAULT now()
  )
 `);

 const appliedRows=await sql.query('SELECT name,checksum FROM schema_migrations');
 const applied=new Map(appliedRows.map(row=>[String(row.name),String(row.checksum)]));
 const files=(await readdir(migrationsUrl)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();

 for(const name of files){
  const source=await readFile(new URL(name,migrationsUrl),'utf8');
  const checksum=createHash('sha256').update(source).digest('hex');
  const previous=applied.get(name);

  if(previous){
   if(previous!==checksum)throw Error(`Migrasi ${name} berubah setelah pernah diterapkan. Buat file migrasi baru.`);
   console.log(`✓ ${name} sudah diterapkan`);
   continue;
  }

  const statements=splitSqlStatements(source);
  if(!statements.length)continue;

  const operations=statements.map(statement=>sql.query(statement));
  operations.push(sql.query(
   'INSERT INTO schema_migrations (name,checksum) VALUES ($1,$2)',
   [name,checksum]
  ));

  await sql.transaction(operations);
  console.log(`✓ ${name} diterapkan`);
 }

 console.log('Struktur database SANJARA siap dan migrasi tersinkron.');
}catch(error){
 console.error('Migrasi database gagal:',error instanceof Error?error.message:error);
 process.exitCode=1;
}
