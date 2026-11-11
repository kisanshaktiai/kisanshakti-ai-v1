#!/usr/bin/env node
/**
 * Mandatory allow-list gate for a staging-only Supabase deployment.
 * No fallback to supabase/config.toml because that file identifies production.
 */
import { readFileSync } from 'node:fs';
const PRODUCTION_REF = 'qfklkkzxemsbeniyugiz';
const gitRef = process.env.GITHUB_SHA ?? '';
const stagingRef = process.env.STAGING_SUPABASE_PROJECT_REF ?? '';
const expectedSha = process.env.EXPECTED_GIT_SHA ?? '';
const allow = (ref, sha, expected) => {
  if(!/^[a-z]{20}$/.test(ref) || ref === PRODUCTION_REF) return false;
  if(!/^[0-9a-f]{40}$/.test(sha) || !/^[0-9a-f]{40}$/.test(expected)) return false;
  if(sha !== expected) return false;
  const config=readFileSync('supabase/config.toml','utf8');
  const configured=config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  return !!configured && configured===PRODUCTION_REF && ref!==configured;
};
if(process.argv.includes('--self-test')){
 const sha='a'.repeat(40), other='b'.repeat(40);
 const good='x'.repeat(20);
 const checks=[
   ['accept isolated approved stage',allow(good,sha,sha),true],
   ['reject production project',allow(PRODUCTION_REF,sha,sha),false],
   ['reject unknown or missing stage',allow('',sha,sha),false],
   ['reject SHA mismatch',allow(good,sha,other),false],
   ['reject malformed ref',allow('prod.some.url',sha,sha),false],
   ['reject invalid SHA',allow(good,'not-a-sha',sha),false],
 ];
 for(const [name,got,expected] of checks){
   if(got!==expected)throw new Error('staging safety guard failed: '+name);
 }
 process.stdout.write('PASS: '+checks.length+' staging release guard cases\n');
 process.exit(0);
}
if(!allow(stagingRef,gitRef,expectedSha)){
 console.error('DEPLOYMENT DENIED: staging ref or approved git sha is missing, production, or inconsistent');
 process.exit(1);
}
console.log('Staging-only target verification passed; release SHA '+gitRef);
