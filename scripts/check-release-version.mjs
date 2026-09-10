import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const { version } = await readJson('package.json');
assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const api = await readJson('apps/api/package.json');
const zodVersion = api.dependencies.zod;
assert.match(zodVersion, /^\d+\.\d+\.\d+$/, 'Pin the schema runtime to an exact Zod version');
for (const manifest of ['apps/web/package.json', 'packages/schemas/package.json']) {
  const workspace = await readJson(manifest);
  assert.equal(
    workspace.dependencies.zod,
    zodVersion,
    `${manifest} must share the API schema runtime`,
  );
}
for (const directory of ['apps', 'packages']) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = `${directory}/${entry.name}/package.json`;
    const workspace = await readJson(manifest);
    assert.equal(workspace.version, version, `${manifest} must match the product version`);
  }
}
const openapi = await readJson('apps/api/openapi.json');
assert.equal(openapi.info.version, version, 'Regenerate OpenAPI with the product version');
const changelog = await readFile('CHANGELOG.md', 'utf8');
assert.ok(changelog.includes(`## ${version}`), 'Document this version in CHANGELOG.md');
console.log(`Release version ${version} is consistent across workspaces and OpenAPI.`);
