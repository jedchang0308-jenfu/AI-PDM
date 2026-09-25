import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dockerfile = fs.readFileSync(path.join(root,
  'infra/google-cloud/dev-117-production-release/principal-inventory.Dockerfile'), 'utf8')
const copied = new Set([...dockerfile.matchAll(/^COPY\s+(\S+)\s+\S+\s*$/gmu)]
  .map((match) => match[1]))

function localImport(from, specifier) {
  const base = specifier.startsWith('@/')
    ? path.join(root, 'src', specifier.slice(2))
    : specifier.startsWith('.') ? path.resolve(path.dirname(from), specifier) : null
  if (!base) return null
  const result = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`,
    path.join(base, 'index.ts')].find((candidate) => fs.existsSync(candidate))
  assert.ok(result, `operator import missing: ${specifier} from ${from}`)
  assert.ok(result.startsWith(`${root}${path.sep}`), 'operator import escaped source tree')
  return result
}

function runtimeImports(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest, true)
  const names = []
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const clause = node.importClause
      const typeOnlyNames = clause && !clause.name &&
        clause.namedBindings && ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.every((item) => item.isTypeOnly)
      if (!node.isTypeOnly && !clause?.isTypeOnly && !typeOnlyNames &&
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        names.push(node.moduleSpecifier.text)
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      names.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

test('principal inventory image binds source and includes every runtime import', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root,
    'infra/google-cloud/dev-117-production-release/principal-cutover-preview/package.json'), 'utf8'))
  const lock = JSON.parse(fs.readFileSync(path.join(root,
    'infra/google-cloud/dev-117-production-release/migration-runner/package-lock.json'), 'utf8'))
  assert.equal(packageJson.type, 'module')
  assert.deepEqual(packageJson.dependencies, lock.packages[''].dependencies)
  assert.match(dockerfile, /USER node/u)
  assert.match(dockerfile, /PDM_SOURCE_REVISION=\$\{SOURCE_REVISION\}/u)
  assert.match(dockerfile, /ENTRYPOINT \["node", "--experimental-transform-types"/u)
  const buildConfig = fs.readFileSync(path.join(root,
    'infra/google-cloud/dev-117-production-release/principal-inventory-cloudbuild.yaml'), 'utf8')
  assert.match(buildConfig, /principal-inventory\.Dockerfile/u)
  assert.match(buildConfig, /SOURCE_REVISION=\$\{_SOURCE_REVISION\}/u)
  const queue = ['scripts/dev121-production-principal-inventory-runner.mjs']
  const seen = new Set()
  while (queue.length) {
    const relative = queue.shift()
    if (seen.has(relative)) continue
    seen.add(relative)
    assert.ok(copied.has(relative), `operator image omits ${relative}`)
    for (const specifier of runtimeImports(path.join(root, relative))) {
      if (specifier.startsWith('node:') || specifier === 'pg') continue
      const imported = localImport(path.join(root, relative), specifier)
      assert.ok(imported, `operator external dependency is not declared: ${specifier}`)
      queue.push(path.relative(root, imported).replaceAll('\\', '/'))
    }
  }
  assert.ok(seen.has('src/lib/jenfu-principal-inventory-coverage.ts'))
  assert.ok(seen.has('src/lib/jenfu-principal-inventory-registration.ts'))
})
