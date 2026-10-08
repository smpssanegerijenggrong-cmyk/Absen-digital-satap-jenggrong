import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildExcelTemplate} from '../lib/xlsx-template.ts';

test('generates real XLSX templates for students and classes',()=>{
 for(const mode of ['students','classes']){
  const file=buildExcelTemplate(mode);
  assert.ok(Buffer.isBuffer(file));
  assert.equal(file.subarray(0,2).toString(),'PK');
  assert.ok(file.length>1500);
 }
});
