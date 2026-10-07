export type StudentImport={nis:string;nisn:string;gender:string;name:string;className:string};
export type ClassImport={name:string;teacher:string;room:string};
export function parseCSV(text:string):string[][]{
 const input=text.replace(/^\uFEFF/,'');const head=input.split(/\r?\n/)[0];const delimiter=head.includes(';')?';':head.includes('\t')?'\t':',';
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('Tanda kutip CSV tidak lengkap.');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
export function validateImport(mode:string,input:unknown){
 if(!['students','classes'].includes(mode)||!Array.isArray(input)||!input.length||input.length>200)throw Error('Impor harus berisi 1–200 baris.');
 const seen=new Set<string>();const errors:string[]=[];
 const rows=input.map((r,i)=>{if(!r||typeof r!=='object'){errors.push(`Baris ${i+2}: data tidak valid.`);return {};}
 const x=r as Record<string,unknown>;const value=(key:string)=>String(x[key]??'').trim();
 if(mode==='students'){const rawGender=value('gender').toLowerCase();const gender=['l','laki-laki','laki laki'].includes(rawGender)?'L':['p','perempuan'].includes(rawGender)?'P':rawGender;const row={nis:value('nis'),nisn:value('nisn'),gender,name:value('name'),className:value('className')};if(row.nisn&&!/^\d{10}$/.test(row.nisn))errors.push(`Baris ${i+2}: NISN harus 10 digit atau dikosongkan.`);if(gender&&!['L','P'].includes(gender))errors.push(`Baris ${i+2}: jenis kelamin harus L atau P.`);if(!row.nis||row.nis.length>30||!row.name||row.name.length>100||!row.className||row.className.length>30)errors.push(`Baris ${i+2}: NIPD, nama, kelas wajib; batas 30/100/30 karakter.`);if(seen.has(row.nis))errors.push(`Baris ${i+2}: NIPD ${row.nis} berulang dalam file.`);seen.add(row.nis);return row;}
 const row={name:value('name'),teacher:value('teacher'),room:value('room')};if(!row.name||row.name.length>30||row.teacher.length>100||row.room.length>60)errors.push(`Baris ${i+2}: kelas wajib; batas kelas/wali/ruang 30/100/60 karakter.`);if(seen.has(row.name))errors.push(`Baris ${i+2}: kelas ${row.name} berulang dalam file.`);seen.add(row.name);return row;
 });if(errors.length)throw Error(errors.slice(0,8).join('\n'));return rows as StudentImport[]|ClassImport[];
}
export function mapImport(mode:string,grid:unknown[][]){
 const nonempty=grid.filter(row=>row.some(x=>String(x??'').trim()));if(nonempty.length<2)throw Error('File belum berisi data. Gunakan template yang disediakan.');
 const headers=nonempty[0].map(x=>String(x??'').trim().toLowerCase().replace(/[ _-]+/g,''));
 const index=(aliases:string[])=>headers.findIndex(h=>aliases.includes(h));
 const nis=index(['nipd','nis','nomorinduk']),nisn=index(['nisn']),gender=index(['jeniskelamin','jk','gender']),name=index(['nama','namasiswa','namamurid','namalengkap']),cls=index(['kelas','namakelas']),teacher=index(['walikelas','wali','guru']),room=index(['ruang','ruangan']);
 if(cls<0||(mode==='students'&&(nis<0||name<0)))throw Error(mode==='students'?'Kolom wajib: NIPD (atau NIS), Nama, Kelas.':'Kolom wajib: Kelas. Kolom opsional: Wali Kelas, Ruang.');
 return validateImport(mode,nonempty.slice(1).map(r=>mode==='students'?{nis:r[nis],nisn:nisn<0?'':r[nisn],gender:gender<0?'':r[gender],name:r[name],className:r[cls]}:{name:r[cls],teacher:teacher<0?'':r[teacher],room:room<0?'':r[room]}));
}
