#!/usr/bin/env node

const { mkdir, readdir, stat, copyFile } = require('fs/promises');
const { dirname, join } = require('path');

async function main() {
  const root = dirname(__dirname);
  const srcDir = join(root, 'src', 'comtrade_data');
  const distDir = join(root, 'dist', 'comtrade_data');

  try {
    const info = await stat(srcDir);
    if (!info.isDirectory()) {
      return;
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('[trade-mcp] No comtrade_data directory to copy');
      return;
    }
    throw error;
  }

  await mkdir(distDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => copyFile(join(srcDir, entry.name), join(distDir, entry.name)))
  );
}

main().catch((error) => {
  console.error('[trade-mcp] postbuild failed:', error);
  process.exitCode = 1;
});
