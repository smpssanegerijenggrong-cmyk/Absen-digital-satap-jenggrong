import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSession,validSession,passwordMatches,usernameMatches,operatorUsername,safeReturnTo,missingConfiguration,authSecretMaterial} from '../lib/auth-core.ts';

test('operator session works with database-derived secret and optional env overrides',()=>{
 const before={...process.env};
 try{
  process.env.DATABASE_URL='postgresql://user:pass@example.test/db';
  delete process.env.AUTH_SECRET;
  delete process.env.ADMIN_PASSWORD;
  process.env.ADMIN_USERNAME='operator';

  const now=Date.now();
  const token=makeSession(now);

  assert.equal(validSession(token,now),true);
  assert.equal(validSession(token,now+9*3600000),false);
  assert.equal(validSession(token+'x',now),false);
  assert.equal(validSession('v1.9999999999.fake.fake',now),false);
  assert.equal(operatorUsername(),'operator');
  assert.equal(usernameMatches('operator'),true);
  assert.equal(usernameMatches('wrong'),false);
  assert.deepEqual(missingConfiguration(),[]);
  assert.ok(authSecretMaterial().length>=32);

  process.env.ADMIN_PASSWORD='test-only-operator-password';
  process.env.AUTH_SECRET='test-only-secret-that-is-long-enough';
  assert.equal(passwordMatches('wrong'),false);
  assert.equal(passwordMatches(process.env.ADMIN_PASSWORD),true);
 }finally{
  for(const key of ['AUTH_SECRET','ADMIN_PASSWORD','ADMIN_USERNAME','DATABASE_URL']){
   if(before[key]===undefined)delete process.env[key];
   else process.env[key]=before[key];
  }
 }
});

test('missing configuration only requires database',()=>{
 const before=process.env.DATABASE_URL;
 try{
  delete process.env.DATABASE_URL;
  assert.deepEqual(missingConfiguration(),['DATABASE_URL']);
 }finally{
  if(before===undefined)delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL=before;
 }
});

test('username defaults to operator when ADMIN_USERNAME is empty',()=>{
 const before=process.env.ADMIN_USERNAME;
 try{
  delete process.env.ADMIN_USERNAME;
  assert.equal(operatorUsername(),'operator');
  assert.equal(usernameMatches('operator'),true);
 }finally{
  if(before===undefined)delete process.env.ADMIN_USERNAME;
  else process.env.ADMIN_USERNAME=before;
 }
});

test('post-login redirect rejects external and protocol-relative URLs',()=>{
 assert.equal(safeReturnTo('//evil.example'),'/');
 assert.equal(safeReturnTo('https://evil.example'),'/');
 assert.equal(
  safeReturnTo('/api/letter?key=generated%3A11111111-1111-4111-8111-111111111111'),
  '/api/letter?key=generated%3A11111111-1111-4111-8111-111111111111'
 );
});
