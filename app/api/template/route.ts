import {buildExcelTemplate,type TemplateMode} from '../../../lib/xlsx-template';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request){
 const mode=new URL(req.url).searchParams.get('mode');
 if(mode!=='students'&&mode!=='classes')return new Response('Mode template tidak valid.',{status:400});
 const file=buildExcelTemplate(mode as TemplateMode);
 const name=mode==='students'?'Template-Siswa.xlsx':'Template-Kelas.xlsx';
 return new Response(file,{
  headers:{
   'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'Content-Disposition':`attachment; filename="${name}"`,
   'Cache-Control':'public, max-age=3600',
   'X-Content-Type-Options':'nosniff',
  },
 });
}
