# Repository Guidelines

## Project Structure & Module Organization
The repository is an npm workspace. Shared routing, caching, and transport helpers live in `packages/core/src/`; export new utilities from `src/index.ts` before consuming them in servers. Each MCP server resides under `servers/<domain>/` (research, socioeconomy, news, health, environment, trade) with a `src/` tree, TypeScript config, and STDIO entry in `dist/server.js`. Treat every `dist/` folder as generated output. Duplicate the existing layout when you add a server and reuse core modules instead of copying logic.

## Build, Test, and Development Commands
Install dependencies once (`npm install`). `npm run build` compiles every workspace with TypeScript, while `npm run dev` keeps `tsc --watch` running. Target a single package with workspace flags, e.g. `npm run build -w socioeconomy-mcp` or `npm run -w research-mcp start` to launch the compiled server. `npm run clean` (optionally with `-w <workspace>`) removes stale builds, and `npm test` forwards to package `test` scripts when they exist.

## Coding Style & Naming Conventions
We ship strict ESM TypeScript (`tsconfig.base.json`). Use two-space indentation, keep relative imports pointing to `.js`, and prefer named exports. Apply `PascalCase` to classes, `camelCase` elsewhere, and reserve uppercase for constants. Split helpers into subfolders such as `util/` when modules grow. Run `npm run build` before submitting; no repo formatter is mandated, so align with the surrounding style.

## Testing Guidelines
No automated suite exists yet, but the root `npm test` orchestrates any workspace `test` script. Add `vitest run` (or similar) to the package you touch, co-locate `*.test.ts` with the code, and mock HTTP calls to avoid upstream rate limits. Document fixtures in the package README so contributors can reproduce failures quickly.

## Commit & Pull Request Guidelines
Keep commits small with imperative, sub-60-character subjects (e.g. `Add Eurostat equivalence map`); add body text only when the diff is non-obvious. Pull requests must state affected servers, verification steps (`npm run build`, manual STDIO checks), and config changes such as new environment variables (`CONTACT_EMAIL`, `CLUSTER_MCP_CACHE_PATH`). Link revised manifests or screenshots when behavior shifts.

## Server Configuration Tips
All servers run via STDIO. Update `manifest.json` and `mcp.json` with code changes, and surface new parameters in the README. Set `CONTACT_EMAIL` for polite Crossref/OpenAlex traffic, and enable persistent caching with `CLUSTER_MCP_CACHE_PATH`. When cloning a server for a new data source, start from the nearest folder and wire provider clients through `@cluster-mcp/core` to inherit caching and routing.
Environment-specific keys live in `.env` or your launch config; for example set `OPENAQ_API_KEY` before running `environment-mcp` and `COMTRADE_API_KEY` for `trade-mcp` to unlock authenticated throughput.
