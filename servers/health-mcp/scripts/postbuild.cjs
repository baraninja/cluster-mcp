#!/usr/bin/env node

const { mkdir, copyFile, readdir, stat } = require('fs/promises');
const { join, dirname } = require('path');

async function main() {
  const root = dirname(__dirname);
  const srcDir = join(root, 'src');
  const distDir = join(root, 'dist');

  await copyIfExists(join(srcDir, 'equivalence.yml'), join(distDir, 'equivalence.yml'));
  await copyCsvDirectory(join(srcDir, 'data'), join(distDir, 'data'));
}

async function copyIfExists(source, destination) {
  try {
    await copyFile(source, destination);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[health-mcp] Optional file missing: ${source}`);
      return;
    }
    throw error;
  }
}

async function copyCsvDirectory(sourceDir, destinationDir) {
  try {
    const stats = await stat(sourceDir);
    if (!stats.isDirectory()) {
      return;
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[health-mcp] Data directory missing: ${sourceDir}`);
      return;
    }
    throw error;
  }

  await mkdir(destinationDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
      .map((entry) => copyFile(join(sourceDir, entry.name), join(destinationDir, entry.name)))
  );
}

main().catch((error) => {
  console.error('[health-mcp] postbuild failed:', error);
  process.exitCode = 1;
});
