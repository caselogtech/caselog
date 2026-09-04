import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(projectRoot, 'src', 'app');

function readJson(path) {
  return JSON.parse(readFileSync(join(projectRoot, path), 'utf8'));
}

const translations = {
  ...readJson('public/i18n/en.json'),
  auth: readJson('public/i18n/auth/en.json'),
  projectSettings: readJson('public/i18n/projectSettings/en.json'),
  readiness: readJson('public/i18n/readiness/en.json'),
  releases: readJson('public/i18n/releases/en.json'),
  staff: readJson('public/i18n/staff/en.json'),
  workspace: readJson('public/i18n/workspace/en.json'),
  workspaceSettings: readJson('public/i18n/workspaceSettings/en.json'),
};

function flattenKeys(value, prefix = '', result = new Set()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      if (child.trim().length === 0) {
        throw new Error(`Translation "${path}" is empty`);
      }
      result.add(path);
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenKeys(child, path, result);
    } else {
      throw new Error(`Translation "${path}" must be a string or an object`);
    }
  }
  return result;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return ['.html', '.ts'].includes(extname(entry.name)) && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

const availableKeys = flattenKeys(translations);
const usedKeys = new Set();
const hardcodedTemplateText = [];
const translationKeyPattern =
  /['"]((?:app|auth|errors|projectSettings|readiness|releases|staff|workspace|workspaceSettings)\.[A-Za-z0-9_.-]+)['"]/g;
const visibleTextPattern = />\s*([^<>{]*[A-Za-z][^<>{]*)\s*</g;

for (const path of sourceFiles(sourceRoot)) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(translationKeyPattern)) {
    usedKeys.add(match[1]);
  }
  if (extname(path) === '.html') {
    for (const match of source.matchAll(visibleTextPattern)) {
      hardcodedTemplateText.push(`${path.slice(projectRoot.length + 1)}: ${match[1].trim()}`);
    }
  }
}

const missingKeys = [...usedKeys].filter((key) => !availableKeys.has(key)).sort();
const unusedKeys = [...availableKeys].filter((key) => !usedKeys.has(key)).sort();

if (missingKeys.length || unusedKeys.length || hardcodedTemplateText.length) {
  if (missingKeys.length) {
    console.error(`Missing English translations:\n${missingKeys.join('\n')}`);
  }
  if (unusedKeys.length) {
    console.error(`Unused English translations:\n${unusedKeys.join('\n')}`);
  }
  if (hardcodedTemplateText.length) {
    console.error(`Hardcoded visible template text:\n${hardcodedTemplateText.join('\n')}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Validated ${availableKeys.size} English translation keys.`);
}
