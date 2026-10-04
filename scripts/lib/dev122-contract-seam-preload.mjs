// Imported only by the explicit DEV-122 task runner's child process.
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalSeamEnvironment, loadSeamAllowlist, mapContractQuery, verifySeamReadback } from './dev122-contract-seam.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = assertLocalSeamEnvironment(process.env, root);
const config = loadSeamAllowlist(root);
const originalQuery = pg.Client.prototype.query;
const originalConnect = pg.Client.prototype.connect;
pg.Client.prototype.connect = function (callback) {
  const operation = (async () => {
    // Validate connection options too: env gating must not authorize another Pool.
    const parameters = this.connectionParameters;
    if (parameters.host !== target.host || Number(parameters.port) !== target.port ||
        parameters.database !== target.database || parameters.user !== target.user) throw new Error('DEV122_SEAM_CONNECTION_REJECTED');
    await originalConnect.call(this);
    await verifySeamReadback(this, originalQuery, target);
  })();
  if (typeof callback === 'function') { operation.then(() => callback(null), error => callback(error)); return; }
  return operation;
};
pg.Client.prototype.query = function (query, values, callback) {
  let mapped;
  try {
    mapped = typeof query === 'string' ? mapContractQuery(query, config)
      : { ...query, text: mapContractQuery(query.text, config) };
  } catch (error) {
    const cb = typeof values === 'function' ? values : callback;
    if (typeof cb === 'function') { queueMicrotask(() => cb(error)); return; }
    return Promise.reject(error);
  }
  return originalQuery.call(this, mapped, values, callback);
};
