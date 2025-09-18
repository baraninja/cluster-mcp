#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT_DIR, 'servers', 'environment-mcp', 'src', 'data', 'openaq_countries.json');

const BASE_URL = 'https://api.openaq.org/v3';
const PAGE_LIMIT = 100;
const REQUEST_DELAY_MS = 125;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCountriesPage(page, apiKey) {
  const url = `${BASE_URL}/countries?page=${page}&limit=${PAGE_LIMIT}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-API-Key': apiKey
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed fetching ${url} -> ${response.status} ${response.statusText}. Body: ${body}`);
  }

  return response.json();
}

async function fetchAllCountries(apiKey) {
  const countries = [];
  let page = 1;

  while (true) {
    console.log(`Fetching OpenAQ countries page ${page}...`);
    const payload = await fetchCountriesPage(page, apiKey);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    countries.push(...results);
    console.log(`  received ${results.length} items (total so far: ${countries.length})`);

    if (results.length < PAGE_LIMIT) {
      break;
    }

    page += 1;
    await delay(REQUEST_DELAY_MS);
  }

  return countries;
}

function buildMappings(countries) {
  const countriesMapping = {};
  const reverseMapping = {};

  for (const entry of countries) {
    if (!entry || typeof entry !== 'object') continue;
    const code = typeof entry.code === 'string' ? entry.code.toUpperCase() : undefined;
    const id = typeof entry.id === 'number' ? entry.id : undefined;
    const name = typeof entry.name === 'string' ? entry.name : undefined;

    if (!id || !name) continue;

    if (code) {
      countriesMapping[code] = { id, code, name };
    }

    reverseMapping[id] = { id, code: code ?? null, name };
  }

  return { countriesMapping, reverseMapping };
}

async function ensureOutputDirectory() {
  const dir = path.dirname(OUTPUT_PATH);
  await fs.mkdir(dir, { recursive: true });
}

async function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  try {
    const content = await fs.readFile(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      if (!key) continue;
      if (process.env[key] !== undefined) continue;
      const value = line.slice(idx + 1).trim();
      process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Unable to read .env file: ${error.message}`);
    }
  }
}

async function main() {
  await loadDotEnv();
  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) {
    console.error('OPENAQ_API_KEY is required (set it in your environment or .env file).');
    process.exit(1);
  }

  try {
    const countries = await fetchAllCountries(apiKey);
    console.log(`Fetched ${countries.length} countries from OpenAQ.`);

    const { countriesMapping, reverseMapping } = buildMappings(countries);

    const payload = {
      generatedAt: new Date().toISOString(),
      totalCount: countries.length,
      countries: countriesMapping,
      reverse: reverseMapping
    };

    await ensureOutputDirectory();
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Saved mapping to ${path.relative(ROOT_DIR, OUTPUT_PATH)}`);

    const showcase = ['NO', 'SE', 'DK', 'FI', 'DE', 'GB', 'US'];
    console.log('\nSample country IDs:');
    for (const code of showcase) {
      const info = countriesMapping[code];
      if (info) {
        console.log(`  ${code} -> id ${info.id} (${info.name})`);
      } else {
        console.log(`  ${code} -> not found in OpenAQ dataset`);
      }
    }
  } catch (error) {
    console.error('Failed to generate OpenAQ country mapping:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
