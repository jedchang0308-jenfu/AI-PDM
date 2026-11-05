#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { runDev127LocalOwner } from './lib/dev127-local-owner-bridge.mjs'

export function parseDev127LocalOwnerArgs(args) {
  const result={}
  for(let index=0;index<args.length;index+=2) {
    const key={'--profile':'profilePath','--phase':'phase','--plan-sha256':'planSha256'}[args[index]]
    if(!key || result[key] || !args[index+1] || args[index+1].startsWith('--'))throw new Error('DEV127_LOCAL_ARGUMENT_INVALID')
    result[key]=args[index+1]
  }
  if(!result.profilePath || !result.phase)throw new Error('DEV127_LOCAL_ARGUMENT_INVALID')
  return result
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try{console.log(JSON.stringify(await runDev127LocalOwner(parseDev127LocalOwnerArgs(process.argv.slice(2)))))}
  catch(error){console.error(/^DEV127_LOCAL_[A-Z_]+$/u.test(error?.code??error?.message??'')?(error.code??error.message):'DEV127_LOCAL_DEPENDENCY_UNAVAILABLE');process.exitCode=1}
}
