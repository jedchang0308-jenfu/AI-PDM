import fs from 'node:fs';
import path from 'node:path';
import { sha256, marker } from './dev122-own-postgres-fixture.mjs';

export const seamVersion = 'ai-pdm.dev122.local-contract-seam.v1';
const foreign = /\b"?([a-z][a-z0-9_]*_(?:core|contract))"?\s*\./giu;

export function assertLocalSeamEnvironment(env, root) {
  if (env.DEV122_LOCAL_CONTRACT_SEAM !== seamVersion || env.PDM_DEPLOYMENT_ENV !== 'local' ||
      env.K_SERVICE || env.GOOGLE_CLOUD_PROJECT || env.PDM_DB_PROVIDER !== 'postgres') throw new Error('DEV122_SEAM_ENVIRONMENT_REJECTED');
  const dsn = new URL(env.PDM_POSTGRES_URL ?? '');
  if (dsn.protocol !== 'postgresql:' || dsn.hostname !== '127.0.0.1' ||
      !/^\/dev122_[a-f0-9]{16}$/u.test(dsn.pathname) || dsn.username !== 'dev122_runtime' || dsn.search || dsn.hash || dsn.password) throw new Error('DEV122_SEAM_DSN_REJECTED');
  const runtimeRoot = fs.realpathSync(env.DEV122_RUNTIME_ROOT ?? '');
  const allowed = path.join(fs.realpathSync(root), '.tmp', 'dev122') + path.sep;
  if (!runtimeRoot.startsWith(allowed) || fs.readFileSync(path.join(runtimeRoot, 'owner-marker'), 'utf8') !== marker) throw new Error('DEV122_SEAM_TASK_DIRECTORY_REJECTED');
  let nextProjectRoot=root;
  if(env.DEV122_NEXT_PROJECT_ROOT!==undefined) {
    if(!path.isAbsolute(env.DEV122_NEXT_PROJECT_ROOT)||fs.lstatSync(env.DEV122_NEXT_PROJECT_ROOT).isSymbolicLink())throw new Error('DEV122_SEAM_NEXT_PROJECT_REJECTED');
    nextProjectRoot=fs.realpathSync(env.DEV122_NEXT_PROJECT_ROOT);
    if(nextProjectRoot!==path.join(runtimeRoot,'app-project')||fs.realpathSync(process.cwd())!==nextProjectRoot||
      path.resolve(env.DEV122_NEXT_PROJECT_ROOT)!==nextProjectRoot||fs.readFileSync(path.join(nextProjectRoot,'owner-marker'),'utf8')!==marker||
      env.PDM_NEXT_DIST_DIR!=='.tmp/next-dist'||env.PDM_NEXT_TSCONFIG_PATH!=='tsconfig.next.json')throw new Error('DEV122_SEAM_NEXT_PROJECT_REJECTED');
  }
  for (const name of ['PDM_DATA_DIR','PDM_REPOSITORY_DIR','PDM_NEXT_DIST_DIR']) {
    const resolved = path.resolve(name==='PDM_NEXT_DIST_DIR'?nextProjectRoot:root, env[name] ?? '');
    if (!resolved.startsWith(runtimeRoot + path.sep)) throw new Error(`DEV122_SEAM_DIRECTORY_REJECTED:${name}`);
  }
  return { database: dsn.pathname.slice(1), user: dsn.username, host: dsn.hostname, port: Number(dsn.port), runtimeRoot };
}

export function loadSeamAllowlist(root) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config/local/dev122-native-postgres.v1.json'), 'utf8'));
  if (config.seamVersion !== seamVersion || config.marker !== marker || config.templates.length < 1) throw new Error('DEV122_SEAM_CONFIG_INVALID');
  for (const source of config.sources) if (sha256(fs.readFileSync(path.join(root, source.path))) !== source.sha256) throw new Error(`DEV122_SEAM_SOURCE_DRIFT:${source.path}`);
  for (const template of config.templates) if (sha256(template.sql) !== template.sha256 || !/^SELECT\b/u.test(template.sql)) throw new Error('DEV122_SEAM_TEMPLATE_INVALID');
  return config;
}

export function mapContractQuery(sql, config) {
  if (typeof sql !== 'string') throw new Error('DEV122_SEAM_QUERY_TEXT_REQUIRED');
  const text = sql.replaceAll('\r\n', '\n').trim();
  const references = [...text.matchAll(foreign)].map(match => match[1].toLowerCase());
  if (references.some(schema => schema.endsWith('_core') && schema !== 'ai_pdm_core')) throw new Error('DEV122_FOREIGN_CORE_REJECTED');
  if (!references.some(schema => schema !== 'ai_pdm_core' && schema !== 'ai_pdm_contract')) return sql;
  if (!/^SELECT\b/u.test(text) || /;|\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|COPY|CALL)\b/iu.test(text)) throw new Error('DEV122_CONTRACT_MUTATION_REJECTED');
  const template = config.templates.find(entry => entry.sha256 === sha256(text) && entry.sql === text);
  if (!template) throw new Error('DEV122_CONTRACT_TEMPLATE_NOT_ALLOWLISTED');
  return template.mappedSql;
}

export async function verifySeamReadback(client, rawQuery, target) {
  const result = await rawQuery.call(client, `SELECT current_database() AS database,current_user AS user,
    pg_catalog.shobj_description(d.oid,'pg_database') AS marker,
    r.rolsuper,r.rolcreatedb,r.rolcreaterole,
    has_schema_privilege(current_user,'ai_pdm_core','CREATE') AS ddl,
    pg_has_role(current_user,'jenfu_ai_pdm_migrator','MEMBER') AS migrator
    FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`);
  const row = result.rows[0];
  if (!row || row.database !== target.database || row.user !== target.user || row.marker !== marker ||
      row.rolsuper || row.rolcreatedb || row.rolcreaterole || row.ddl || row.migrator) throw new Error('DEV122_SEAM_PROVIDER_READBACK_REJECTED');
  const schemas = (await rawQuery.call(client, `SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%'
    AND nspname NOT IN ('public','information_schema','ai_pdm_core','ai_pdm_contract')`)).rows;
  if (schemas.length) throw new Error('DEV122_SEAM_FOREIGN_SCHEMA_REJECTED');
}
