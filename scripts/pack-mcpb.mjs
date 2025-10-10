#!/usr/bin/env node
import { existsSync } from 'fs';
import { cp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (exit code ${result.status ?? 'unknown'})`
    );
  }
  return result;
}

async function runWithOutput(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (exit code ${result.status ?? 'unknown'})`
    );
  }
  return result.stdout ?? '';
}

async function prepareBundle(serverName) {
  if (!serverName) {
    console.error('Usage: node scripts/pack-mcpb.mjs <server-name>');
    process.exit(1);
  }

  const serverDir = path.join(repoRoot, 'servers', serverName);
  if (!existsSync(serverDir)) {
    console.error(`Unknown server "${serverName}". Expected directory at ${serverDir}`);
    process.exit(1);
  }

  run('npm', ['run', '-w', '@cluster-mcp/core', 'build'], { cwd: repoRoot });

  const bundlesDir = path.join(repoRoot, 'bundles');
  const stagingDir = path.join(bundlesDir, '.staging', serverName);
  const bundlePath = path.join(bundlesDir, `${serverName}.mcpb`);

  await mkdir(bundlesDir, { recursive: true });
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  const filter = (src) => {
    const relative = path.relative(serverDir, src);
    if (!relative || relative === '') return true;
    const segments = relative.split(path.sep);
    return !segments.includes('node_modules');
  };

  await cp(serverDir, stagingDir, {
    recursive: true,
    filter,
  });

  const corePackageDir = path.join(repoRoot, 'packages', 'core');

  const packageJsonPath = path.join(stagingDir, 'package.json');
  let originalCoreVersion;
  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    originalCoreVersion = pkg.dependencies?.['@cluster-mcp/core'];

    const packOutput = await runWithOutput(
      'npm',
      ['pack', path.relative(stagingDir, corePackageDir), '--pack-destination', '.'],
      { cwd: stagingDir }
    );

    const tarballName = packOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith('.tgz'))
      .pop();

    if (!tarballName) {
      throw new Error('Unable to determine tarball name for @cluster-mcp/core');
    }

    if (pkg.dependencies && '@cluster-mcp/core' in pkg.dependencies) {
      pkg.dependencies['@cluster-mcp/core'] = `file:${tarballName}`;
    }

    await writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

    run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit'], {
      cwd: stagingDir,
    });

    await rm(path.join(stagingDir, tarballName), { force: true });

    if (pkg.dependencies && '@cluster-mcp/core' in pkg.dependencies) {
      pkg.dependencies['@cluster-mcp/core'] = originalCoreVersion ?? '*';
      await writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }

    await rm(path.join(stagingDir, 'package-lock.json'), { force: true });
  }

  await rm(bundlePath, { force: true });
  run('mcpb', ['pack', stagingDir, bundlePath], { cwd: repoRoot });

  await rm(path.join(bundlesDir, '.staging'), { recursive: true, force: true });
}

prepareBundle(process.argv[2]).catch((error) => {
  console.error(error);
  process.exit(1);
});
