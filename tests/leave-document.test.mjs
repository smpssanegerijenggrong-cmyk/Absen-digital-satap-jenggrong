import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateLeaveForm,renderLeaveDocument} from '../lib/leave-document.ts';
const valid={parentName:'Ibu Ana',relationship:'Ibu',confirmed:true,leaveDate:'2026-10-07',reason:'Keperluan keluarga',note:''};
test('leave form accepts no upload and preserves parent/date; requires confirmed consent',()=>{
 assert.deepEqual(validateLeaveForm(valid),{parentName:'Ibu Ana',relationship:'Ibu',date:'2026-10-07',reason:'Keperluan keluarga',note:''});
 for(const patch of [{parentName:''},{confirmed:false},{confirmed:'true'},{relationship:'Teman'},{leaveDate:'2026-02-30'},{leaveDate:'invalid'},{reason:'Lainnya',note:' '}])assert.throws(()=>validateLeaveForm({...valid,...patch}));
 assert.equal(validateLeaveForm({...valid,leaveDate:'2028-02-29'}).date,'2028-02-29');
});
test('generated document escapes submitted content and carries verification link and identity snapshot',async()=>{
 const url='https://school.example/api/letter?key=generated%3A123';
 const html=await renderLeaveDocument({version:1,id:'123',studentName:'Siswa <script>alert(1)</script>',nipd:'001',nisn:'0012345678',className:'VII A',...validateLeaveForm({...valid,parentName:'Ibu <img src=x>',note:'Alasan <b>keluarga</b>'}),createdAt:'2026-10-07T04:00:00Z'},url);
 assert.ok(html.includes('Siswa &lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.ok(!html.includes('<img src=x>'));assert.ok(html.includes('Ibu &lt;img src=x&gt;'));
 assert.ok(html.includes('0012345678'));assert.ok(html.includes('7 Oktober 2026'));
 assert.ok(html.includes('<svg'));assert.ok(html.includes(url));assert.ok(html.includes('Tercatat sebagai Izin'));
});
