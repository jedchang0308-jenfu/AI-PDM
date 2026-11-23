import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawnSync,spawn} from 'node:child_process';

const root=process.cwd(),temporaryBase=fs.realpathSync(os.tmpdir());
const temporary=fs.mkdtempSync(path.join(temporaryBase,'aipdm-dev130-pg-'));
const cluster=path.join(temporary,'cluster'),bin='C:/Program Files/PostgreSQL/18/bin';
let started=false,port;
function run(name,args){const result=spawnSync(path.join(bin,name),args,{windowsHide:true,encoding:'utf8',...(name==='pg_ctl.exe'?{stdio:'ignore'}:{})});if(result.status!==0)throw new Error(`${name}: ${result.stderr||result.stdout||result.status}`);}
try{
  port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
  console.log(JSON.stringify({project:root,purpose:'DEV-130 disposable PostgreSQL submission snapshot transaction',port,ownerPid:process.pid,temporary,cleanup:'stop exact cluster, verify port release, remove fixture'}));
  run('initdb.exe',['-D',cluster,'--auth-local=trust','--auth-host=trust','--username=postgres','--encoding=UTF8','--no-locale']);
  run('pg_ctl.exe',['-D',cluster,'-l',path.join(temporary,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1`,'-w','start']);started=true;
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','--exclude','output/**','src/lib/drawing-revision-work.principal.test.ts','--testNamePattern','submission transaction','--maxWorkers=1'],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,DEV130_TEST_PG:`postgresql://postgres@127.0.0.1:${port}/postgres`,PDM_DATA_DIR:path.join(temporary,'data'),PDM_REPOSITORY_DIR:path.join(temporary,'repository')}});
    const timer=setTimeout(()=>{child.kill();reject(new Error('DEV130_TEST_TIMEOUT'));},120000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`DEV130_TEST_FAILED:${code}`));});
  });
}finally{
  if(started)run('pg_ctl.exe',['-D',cluster,'-m','fast','-w','stop']);
  if(port){const released=await new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));});if(!released)throw new Error('DEV130_PORT_NOT_RELEASED');}
  if(path.dirname(temporary)!==temporaryBase||!path.basename(temporary).startsWith('aipdm-dev130-pg-'))throw new Error('DEV130_CLEANUP_SCOPE_INVALID');
  fs.rmSync(temporary,{recursive:true,force:true});console.log(JSON.stringify({cleanup:true,portReleased:true,port}));
}
