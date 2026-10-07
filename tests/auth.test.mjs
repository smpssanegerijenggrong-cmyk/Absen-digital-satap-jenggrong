import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSession,validSession,passwordMatches,usernameMatches,operatorUsername,safeReturnTo,missingConfiguration} from '../lib/auth-core.ts';
test('operator session rejects missing secrets, forgery, expiry and changed password',()=>{
 const before={...process.env};try{
 process.env.AUTH_SECRET='test-only-secret-that-is-long-enough';process.env.ADMIN_PASSWORD='test-only-operator-password';process.env.ADMIN_USERNAME='operator';process.env.DATABASE_URL='test';
 const now=Date.now(),token=makeSession(now);assert.equal(validSession(token,now),true);assert.equal(validSession(token,now+9*3600000),false);assert.equal(validSession(token+'x',now),false);assert.equal(validSession('v1.9999999999.fake.fake',now),false);
 assert.equal(operatorUsername(),'operator');assert.equal(usernameMatches('operator'),true);assert.equal(usernameMatches('wrong'),false);
 assert.equal(passwordMatches('wrong'),false);assert.equal(passwordMatches(process.env.ADMIN_PASSWORD),true);assert.deepEqual(missingConfiguration(),[]);
 process.env.ADMIN_PASSWORD='a-different-operator-password';assert.equal(validSession(token,now),false);delete process.env.AUTH_SECRET;assert.equal(validSession(token,now),false);assert.ok(missingConfiguration().includes('AUTH_SECRET'));
 }finally{for(const key of ['AUTH_SECRET','ADMIN_PASSWORD','ADMIN_USERNAME','DATABASE_URL']){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
});
test('username defaults to operator when ADMIN_USERNAME is empty',()=>{
 const before=process.env.ADMIN_USERNAME;try{delete process.env.ADMIN_USERNAME;assert.equal(operatorUsername(),'operator');assert.equal(usernameMatches('operator'),true);}finally{if(before===undefined)delete process.env.ADMIN_USERNAME;else process.env.ADMIN_USERNAME=before;}
});
test('post-login redirect rejects external and protocol-relative URLs',()=>{assert.equal(safeReturnTo('//evil.example'),'/');assert.equal(safeReturnTo('https://evil.example'),'/');assert.equal(safeReturnTo('/api/letter?key=generated%3A11111111-1111-4111-8111-111111111111'),'/api/letter?key=generated%3A11111111-1111-4111-8111-111111111111');});
