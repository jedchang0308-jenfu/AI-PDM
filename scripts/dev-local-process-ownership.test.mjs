import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

test('Windows launcher proves external dependency workers through the recorded npm process instance', { skip: process.platform !== 'win32' }, () => {
  const root = process.cwd();
  const temporary = path.join(root, 'tmp', `dev126-owner-test-${randomUUID()}`);
  fs.mkdirSync(temporary, { recursive: true });
  try {
    const result = execFileSync('powershell.exe', ['-NoProfile', '-Command', `
$ErrorActionPreference='Stop'
$ProjectRoot=$env:DEV126_OWNER_ROOT
$ProjectRootLower=$ProjectRoot.ToLowerInvariant()
$Port=1020
$NodeExe='C:\\Program Files\\nodejs\\node.exe'
$npmArguments='"C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" --prefix "'+$ProjectRoot+'" run dev:server -- --webpack'
$StatusFile=Join-Path $env:DEV126_OWNER_TEMP 'status.json'
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $ProjectRoot 'scripts/start-localhost-3000.ps1'),[ref]$null,[ref]$null)
foreach($name in @('Test-IsProjectProcess','Test-ProcessCommandOwnsProject','Read-RecordedLauncherProof','Get-CurrentPortOwner','Get-UnverifiedPortOwners','Open-LocalPage')) {
  $definition=$ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
  if($definition.Count){. ([scriptblock]::Create($definition[0].Extent.Text))}
}
function Get-PortListeners { $script:listeners }
function Get-OwnerProcessInfo { param([int]$OwnerProcessId) $script:processes[$OwnerProcessId] }
function Get-NativeProcessStartToken { param([int]$OwnerProcessId) $script:tokens[$OwnerProcessId] }
function Fixture($id,$parent,$command,$seconds,$name='node.exe') {
  [pscustomobject]@{ProcessId=$id;ParentProcessId=$parent;CommandLine=$command;Name=$name;ExecutablePath=$NodeExe;CreationDate=([datetime]'2026-10-28T00:00:00Z').AddSeconds($seconds)}
}
$results=@()
foreach($case in @('owned-junction','owned-direct-anchor','windows-trailing-whitespace','foreign','stale-token','missing-parent','newer-parent','same-time-parent','cycle','depth-limit','path-prefix-collision','wrong-worktree','shell-is-not-node','direct-root-without-proof','parent-traversal','root-in-unrelated-argument','executable-path-mismatch','recorded-executable-mismatch','missing-recorded-executable')) {
  $script:processes=@{}
  $script:tokens=@{100='owned-start'}
  $proof=[ordered]@{app='AI_PDM';worktree=$ProjectRoot;port=1020;launcherProcessId=100;launcherStartToken='owned-start';launcherExecutablePath=$NodeExe}
  $script:processes[200]=Fixture 200 150 'node C:\\shared-dependencies\\next\\dist\\server\\lib\\start-server.js' 20
  $script:processes[150]=Fixture 150 100 'node C:\\shared-dependencies\\next\\dist\\bin\\next dev' 10
  $script:processes[100]=Fixture 100 0 ('"'+$NodeExe+'" '+$npmArguments) 1
  $listener=$script:processes[200]
  switch($case) {
    'owned-direct-anchor' {$listener=$script:processes[100]}
    'windows-trailing-whitespace' {$script:processes[100].CommandLine+=' '}
    'foreign' {$script:processes[100].CommandLine='node npm-cli.js --prefix C:\\other-project run dev:server'}
    'stale-token' {$script:tokens[100]='different-start'}
    'missing-parent' {$script:processes.Remove(150)}
    'newer-parent' {$script:processes[150].CreationDate=([datetime]'2026-10-28T00:01:00Z')}
    'same-time-parent' {$script:processes[150].CreationDate=$script:processes[200].CreationDate}
    'cycle' {$script:processes[150].ParentProcessId=200;$script:processes[200].CreationDate=$script:processes[150].CreationDate}
    'depth-limit' {for($i=201;$i -le 212;$i++){$script:processes[$i]=Fixture $i ($i+1) 'node external-worker.js' (220-$i)};$script:processes[200].ParentProcessId=201;$script:processes[212].ParentProcessId=100}
    'path-prefix-collision' {$script:processes[100].CommandLine='node npm-cli.js --prefix "'+$ProjectRoot+'-sibling" run dev:server'}
    'wrong-worktree' {$proof.worktree=$ProjectRoot+'-sibling'}
    'shell-is-not-node' {$script:processes[100].Name='powershell.exe'}
    'direct-root-without-proof' {$listener=Fixture 200 0 ('node unrelated.js --note "'+$ProjectRoot+'" --label next') 20}
    'parent-traversal' {$script:processes[100].CommandLine='"'+$NodeExe+'" "C:\\npm-cli.js" --prefix "'+$ProjectRoot+'\\..\\other" run dev:server'}
    'root-in-unrelated-argument' {$script:processes[100].CommandLine='node npm-cli.js --prefix C:\\other --note "'+$ProjectRoot+'" run dev:server'}
    'executable-path-mismatch' {$script:processes[100].ExecutablePath='C:\\foreign\\node.exe'}
    'recorded-executable-mismatch' {$proof.launcherExecutablePath='C:\\foreign\\node.exe'}
    'missing-recorded-executable' {$proof.Remove('launcherExecutablePath')}
  }
  $proof|ConvertTo-Json|Set-Content -LiteralPath $StatusFile -Encoding UTF8
  $results+=[pscustomobject]@{case=$case;owned=[bool](Test-IsProjectProcess $listener)}
}
$script:processes=@{}
$script:tokens=@{100='owned-start'}
$proof=[ordered]@{app='AI_PDM';worktree=$ProjectRoot;port=1020;launcherProcessId=100;launcherStartToken='owned-start';launcherExecutablePath=$NodeExe}
$proof|ConvertTo-Json|Set-Content -LiteralPath $StatusFile -Encoding UTF8
$script:processes[200]=Fixture 200 150 'node C:\\shared-dependencies\\next\\dist\\server\\lib\\start-server.js' 20
$script:processes[150]=Fixture 150 100 'node C:\\shared-dependencies\\next\\dist\\bin\\next dev' 10
$script:processes[100]=Fixture 100 0 ('"'+$NodeExe+'" '+$npmArguments) 1
$script:processes[300]=Fixture 300 0 'node foreign-server.js' 30
$script:listeners=@(
  [pscustomobject]@{LocalAddress='127.0.0.1';OwningProcess=200},
  [pscustomobject]@{LocalAddress='::1';OwningProcess=300}
)
$owners=@(Get-CurrentPortOwner)
$unverified=@(Get-UnverifiedPortOwners -Owners $owners)
$script:opened=0
$script:openError=''
$script:lastState=''
function Start-Process { param([string]$FilePath) $script:opened++ }
function Write-RuntimeStatus { param([string]$State,[int]$PortOwnerProcessId=0,$PortOwnerProcessInfo=$null,[string]$Message=''); $script:lastState=$State }
$NoBrowser=$false
$Url='http://localhost:1020/'
try { Open-LocalPage } catch { $script:openError=$_.Exception.Message }
$results+=[pscustomobject]@{
  case='dual-stack-foreign-later'
  ownerPids=@($owners|ForEach-Object{$_.ProcessId})
  verified=@($owners|ForEach-Object{$_.IsProject})
  unverifiedPids=@($unverified|ForEach-Object{$_.ProcessId})
  blocked=($unverified.Count -gt 0)
  openBlocked=[bool]$script:openError
  browserOpenCount=$script:opened
  runtimeState=$script:lastState
}
$results|ConvertTo-Json -Compress
`], { encoding: 'utf8', windowsHide: true, env: { ...process.env, DEV126_OWNER_ROOT: root, DEV126_OWNER_TEMP: temporary } });
    const cases = JSON.parse(result);
    const originalCases = cases.filter((row) => row.case !== 'dual-stack-foreign-later');
    assert.equal(originalCases.length, 19);
    for (const row of originalCases) assert.equal(row.owned, ['owned-junction', 'owned-direct-anchor', 'windows-trailing-whitespace'].includes(row.case), row.case);
    const dualStack = cases.find((row) => row.case === 'dual-stack-foreign-later');
    assert.deepEqual(dualStack.ownerPids, [200, 300]);
    assert.deepEqual(dualStack.verified, [true, false]);
    assert.deepEqual(dualStack.unverifiedPids, [300]);
    assert.equal(dualStack.blocked, true);
    assert.equal(dualStack.openBlocked, true);
    assert.equal(dualStack.browserOpenCount, 0);
    assert.equal(dualStack.runtimeState, 'blocked_foreign_process');
  } finally {
    assert.ok(temporary.startsWith(path.join(root, 'tmp') + path.sep));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
