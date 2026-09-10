import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkStartup, startupBundle } from '../check-web-startup.mjs';

const fixture = () => ({
  outputs: {
    'main.js': {
      entryPoint: 'src/main.ts',
      bytes: 10,
      imports: [
        { path: 'shared.js', kind: 'import-statement' },
        { path: 'feature.js', kind: 'dynamic-import' },
      ],
      inputs: {},
    },
    'shared.js': {
      bytes: 20,
      imports: [{ path: 'nested.js', kind: 'import-statement' }],
      inputs: { '../../packages/schemas/src/auth.ts': { bytesInOutput: 5 } },
    },
    'nested.js': {
      bytes: 30,
      imports: [{ path: 'shared.js', kind: 'import-statement' }],
      inputs: {},
    },
    'feature.js': {
      bytes: 2_000_000,
      imports: [],
      inputs: { '../../packages/schemas/src/readiness.ts': { bytesInOutput: 100 } },
    },
  },
});

test('startup accounting includes transitive static chunks once and excludes dynamic imports', () => {
  const bundle = startupBundle(fixture());
  assert.deepEqual(bundle, { bytes: 60, files: 3, schemas: ['auth'] });
  assert.doesNotThrow(() => checkStartup(bundle));
});

test('startup gate rejects hidden shared-chunk growth and eager feature schemas', () => {
  const stats = fixture();
  stats.outputs['main.js'].imports[1].kind = 'import-statement';
  assert.throws(() => checkStartup(startupBundle(stats)), /budget/u);
  stats.outputs['feature.js'].bytes = 100;
  assert.throws(() => checkStartup(startupBundle(stats)), /readiness/u);
  delete stats.outputs['shared.js'];
  assert.throws(() => startupBundle(stats), /Missing static import/u);
});
