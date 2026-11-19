import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import {spawnSync,spawn} from "node:child_process";
const root=process.cwd(),tempBase=path.resolve(os.tmpdir());
const task=fs.mkdtempSync(path.join(tempBase,"aipdm-dev129-assembly-"));
const cluster=path.join(task,"cluster"),bin="C:\\Program Files\\PostgreSQL\\18\\bin";
let started=false,port;
function run(name,args,stdio="pipe") {const result=spawnSync(path.join(bin,name),args,{windowsHide:true,encoding:"utf8",stdio});if(result.status!==0)throw new Error(`${name}: ${result.stderr??result.status}`);}
async function localhostPreflight() {
  return new Promise(resolve=>{const server=net.createServer(socket=>socket.end());let finished=false;
    const finish=(allowed,reason)=>{if(finished)return;finished=true;server.close(()=>resolve({allowed,reason}));};
    server.once("error",error=>resolve({allowed:false,reason:error.code}));server.listen(0,"127.0.0.1",()=>{
      const client=net.createConnection({host:"127.0.0.1",port:server.address().port});client.setTimeout(3000);
      client.once("connect",()=>{client.destroy();finish(true,null);});client.once("error",error=>finish(false,error.code));client.once("timeout",()=>{client.destroy();finish(false,"LOCALHOST_TIMEOUT");});
    });
  });
}
try {
  const preflight=await localhostPreflight();
  if(!preflight.allowed){console.log(JSON.stringify({status:"NOT_RUN",preflight:"localhost",reason:preflight.reason,action:"run the same command in an approved host/CI environment"}));throw new Error("DEV129_LOCALHOST_PREFLIGHT_NOT_RUN");}
  port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const p=server.address().port;server.close(error=>error?reject(error):resolve(p));});});
  console.log(JSON.stringify({runtimeDeclaration:{project:root,purpose:"DEV-129 isolated PostgreSQL metadata and route integration; fixture principal admission",port,ownerPid:process.pid,taskRoot:task,cleanupCondition:"stop exact cluster, close child, release port, remove task root",productionWrites:false}}));
  run("initdb.exe",["-D",cluster,"--auth-local=trust","--auth-host=trust","--username=postgres","--encoding=UTF8","--no-locale"]);
  run("pg_ctl.exe",["-D",cluster,"-l",path.join(task,"postgres.log"),"-o",`-p ${port} -h 127.0.0.1`,"-w","start"],"ignore");started=true;
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(root,"node_modules/vitest/vitest.mjs"),"run","src/lib/drawing-assembly-package.postgres.test.ts","--no-cache","--pool=threads","--maxWorkers=1"],{cwd:root,stdio:"inherit",windowsHide:true,env:{...process.env,DEV129_TEST_PG:`postgresql://postgres@127.0.0.1:${port}/postgres`,PDM_DATA_DIR:path.join(task,"data"),PDM_REPOSITORY_DIR:path.join(task,"repository"),PDM_STORAGE_PROVIDER:"local_repository"}});
    const timer=setTimeout(()=>{child.kill();reject(new Error("DEV129_POSTGRES_TIMEOUT"));},180000);child.once("error",error=>{clearTimeout(timer);reject(error);});child.once("exit",code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`DEV129_POSTGRES_FAILED:${code}`));});
  });
} finally {
  if(started)run("pg_ctl.exe",["-D",cluster,"-m","fast","-w","stop"],"ignore");
  if(port) {
    const released=await new Promise(resolve=>{const socket=net.createConnection({host:"127.0.0.1",port});socket.once("connect",()=>{socket.destroy();resolve(false);});socket.once("error",()=>resolve(true));});
    if(!released)throw new Error("DEV129_POSTGRES_PORT_NOT_RELEASED");
  }
  if(!path.resolve(task).startsWith(tempBase+path.sep) || !path.basename(task).startsWith("aipdm-dev129-assembly-"))throw new Error("DEV129_CLEANUP_SCOPE_INVALID");
  fs.rmSync(task,{recursive:true,force:true});console.log(JSON.stringify({cleanup:"task-owned PostgreSQL stopped; port released; temporary data removed",port}));
}
