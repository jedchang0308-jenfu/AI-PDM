import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

try {
  const pdmWorktree = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const platform = await realpath(path.join(pdmWorktree, '..', 'Jenfu-Platform'));
  const entry = pathToFileURL(path.join(platform, 'scripts', 'dev-local-daily.mjs'));
  const { runDailyLocal } = await import(entry.href);
  await runDailyLocal(process.argv.slice(2), platform, { pdmWorktree });
} catch (error) {
  console.error(`dev:local: ${error.message}`);
  process.exitCode = 1;
}
