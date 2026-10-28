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
$StatusFile=Join-Path $env:DEV126_OWNER_TEMP 'status.json'
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $ProjectRoot 'scripts/start-localhost-3000.ps1'),[ref]$null,[ref]$null)
foreach($name in @('Test-IsProjectProcess','Test-ProcessCommandOwnsProject','Read-RecordedLauncherProof')) {
  $definition=$ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
  if($definition.Count){. ([scriptblock]::Create($definition[0].Extent.Text))}
}
function Get-OwnerProcessInfo { param([int]$OwnerProcessId) $script:processes[$OwnerProcessId] }
function Get-NativeProcessStartToken { param([int]$OwnerProcessId) $script:tokens[$OwnerProcessId] }
function Fixture($id,$parent,$command,$seconds,$name='node.exe') {
  [pscustomobject]@{ProcessId=$id;ParentProcessId=$parent;CommandLine=$command;Name=$name;CreationDate=([datetime]'2026-10-28T00:00:00Z').AddSeconds($seconds)}
}
$results=@()
foreach($case in @('owned-junction','foreign','stale-token','missing-parent','newer-parent','cycle','depth-limit','path-prefix-collision','wrong-worktree','shell-is-not-node')) {
  $script:processes=@{}
  $script:tokens=@{100='owned-start'}
  $proof=[ordered]@{app='AI_PDM';worktree=$ProjectRoot;port=1020;launcherProcessId=100;launcherStartToken='owned-start'}
  $script:processes[200]=Fixture 200 150 'node C:\\shared-dependencies\\next\\dist\\server\\lib\\start-server.js' 20
  $script:processes[150]=Fixture 150 100 'node C:\\shared-dependencies\\next\\dist\\bin\\next dev' 10
  $script:processes[100]=Fixture 100 0 ('node npm-cli.js --prefix "'+$ProjectRoot+'" run dev:server') 1
  switch($case) {
    'foreign' {$script:processes[100].CommandLine='node npm-cli.js --prefix C:\\other-project run dev:server'}
    'stale-token' {$script:tokens[100]='different-start'}
    'missing-parent' {$script:processes.Remove(150)}
    'newer-parent' {$script:processes[150].CreationDate=([datetime]'2026-10-28T00:01:00Z')}
    'cycle' {$script:processes[150].ParentProcessId=200;$script:processes[200].CreationDate=$script:processes[150].CreationDate}
    'depth-limit' {for($i=201;$i -le 212;$i++){$script:processes[$i]=Fixture $i ($i+1) 'node external-worker.js' (220-$i)};$script:processes[200].ParentProcessId=201;$script:processes[212].ParentProcessId=100}
    'path-prefix-collision' {$script:processes[100].CommandLine='node npm-cli.js --prefix "'+$ProjectRoot+'-sibling" run dev:server'}
    'wrong-worktree' {$proof.worktree=$ProjectRoot+'-sibling'}
    'shell-is-not-node' {$script:processes[100].Name='powershell.exe'}
  }
  $proof|ConvertTo-Json|Set-Content -LiteralPath $StatusFile -Encoding UTF8
  $results+=[pscustomobject]@{case=$case;owned=[bool](Test-IsProjectProcess $script:processes[200])}
}
$results|ConvertTo-Json -Compress
`], { encoding: 'utf8', windowsHide: true, env: { ...process.env, DEV126_OWNER_ROOT: root, DEV126_OWNER_TEMP: temporary } });
    const cases = JSON.parse(result);
    assert.equal(cases.length, 10);
    for (const row of cases) assert.equal(row.owned, row.case === 'owned-junction', row.case);
  } finally {
    assert.ok(temporary.startsWith(path.join(root, 'tmp') + path.sep));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
