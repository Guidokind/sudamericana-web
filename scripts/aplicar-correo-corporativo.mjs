import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OLD_EMAIL = 'stachaco@gmail.com';
const NEW_EMAIL = 'info@sudamericanasrl.com';
const SKIP_DIRS = new Set(['.git', 'node_modules', '.wrangler']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') files.push(fullPath);
  }

  return files;
}

const htmlFiles = await walk(ROOT);
let changedFiles = 0;
let replacements = 0;

for (const file of htmlFiles) {
  const source = await readFile(file, 'utf8');
  const matches = source.split(OLD_EMAIL).length - 1;
  if (!matches) continue;

  const updated = source.split(OLD_EMAIL).join(NEW_EMAIL);
  await writeFile(file, updated, 'utf8');
  changedFiles += 1;
  replacements += matches;
  console.log(`Actualizado: ${relative(ROOT, file)} (${matches})`);
}

console.log(`Listo: ${replacements} reemplazo(s) en ${changedFiles} archivo(s).`);
