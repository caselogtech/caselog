import { importedModules } from './typescript-imports.mjs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const apiSource = resolve('apps/api/src');

const prismaImports = [
  /generated\/prisma(?:\/|$)/,
  /@prisma\/client(?:\/|$)/,
  /database\/infrastructure\/prisma(?:\/|$)/,
];
const tenantDatabaseImport = /tenant-database\.service$/;
const unsafeRawQueries = ['$queryRawUnsafe', '$executeRawUnsafe'];

const files = await typescriptFiles(apiSource);
const violations = [];
const prismaSchema = await readFile(resolve('apps/api/prisma/schema.prisma'), 'utf8');
const featureNames = new Set(
  (await readdir(apiSource, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isDirectory() && !['core', 'common', 'generated', 'openapi'].includes(entry.name),
    )
    .map((entry) => entry.name),
);
const moduleDependencies = new Map();

verifyWorkspaceCascadeRelations(prismaSchema, violations);

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const projectPath = normalize(relative(apiSource, file));
  const isTest = projectPath.includes('/tests/') || projectPath.endsWith('.spec.ts');
  const sourceFeature = projectPath.split('/')[0];
  const sourceLayer = projectPath.split('/')[1];
  if (
    !isTest &&
    featureNames.has(sourceFeature) &&
    !['application', 'domain', 'infrastructure', 'presentation', 'public-api.ts'].includes(
      sourceLayer,
    ) &&
    !projectPath.endsWith('.module.ts')
  ) {
    violations.push(`${projectPath}: production feature files must use the prescribed layers`);
  }
  if (!isTest && /\bforwardRef\s*\(/.test(source)) {
    violations.push(`${projectPath}: forwardRef is forbidden; correct the module boundary`);
  }
  for (const specifier of importedModules(source)) {
    if (isTest) continue;
    const targetPath = specifier.startsWith('.')
      ? normalize(relative(apiSource, resolve(dirname(file), specifier)))
      : specifier;
    const targetFeature = targetPath.split('/')[0];
    if (
      ['application', 'infrastructure'].includes(sourceLayer) &&
      targetPath.includes('/presentation/')
    ) {
      violations.push(`${projectPath}: ${sourceLayer} cannot import presentation ${specifier}`);
    }
    if (['core', 'common'].includes(sourceFeature) && featureNames.has(targetFeature)) {
      violations.push(`${projectPath}: ${sourceFeature} cannot import feature ${targetFeature}`);
    }
    if (
      projectPath.includes('/domain/') &&
      (specifier.startsWith('@nestjs/') ||
        /\/(application|presentation|infrastructure)\//.test(targetPath))
    ) {
      violations.push(`${projectPath}: domain cannot import ${specifier}`);
    }
    if (
      featureNames.has(sourceFeature) &&
      featureNames.has(targetFeature) &&
      sourceFeature !== targetFeature
    ) {
      if (targetPath.replace(/\.(ts|js)$/, '') !== `${targetFeature}/public-api`) {
        violations.push(
          `${projectPath}: cross-feature import '${specifier}' must use ${targetFeature}/public-api`,
        );
      }
      if (projectPath.endsWith('.module.ts')) {
        const dependencies = moduleDependencies.get(sourceFeature) ?? new Set();
        dependencies.add(targetFeature);
        moduleDependencies.set(sourceFeature, dependencies);
      }
    }
  }

  if (
    projectPath.includes('/presentation/controllers/') &&
    source.includes('OrganizationAuthGuard') &&
    !source.includes('OrganizationRoleGuard')
  ) {
    violations.push(
      `${projectPath}: tenant controllers must pair OrganizationAuthGuard with OrganizationRoleGuard`,
    );
  }

  for (const query of unsafeRawQueries) {
    if (source.includes(query)) {
      violations.push(`${projectPath}: ${query} is forbidden; use parameterized tagged SQL`);
    }
  }

  if (canAccessPersistence(projectPath)) continue;

  for (const specifier of importedModules(source)) {
    if (prismaImports.some((pattern) => pattern.test(specifier))) {
      violations.push(
        `${projectPath}: Prisma imports are restricted to infrastructure repositories and core database code`,
      );
    }
    if (tenantDatabaseImport.test(specifier)) {
      violations.push(
        `${projectPath}: TenantDatabaseService must be used behind an infrastructure repository`,
      );
    }
  }
}

for (const feature of moduleDependencies.keys()) {
  verifyAcyclic(feature, []);
}

function verifyAcyclic(feature, ancestors) {
  if (ancestors.includes(feature)) {
    violations.push(`Nest module dependency cycle: ${[...ancestors, feature].join(' -> ')}`);
    return;
  }
  for (const dependency of moduleDependencies.get(feature) ?? []) {
    verifyAcyclic(dependency, [...ancestors, feature]);
  }
}

if (violations.length > 0) {
  process.stderr.write(`Backend architecture boundary violations:\n${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Backend architecture boundaries verified.\n');
}

async function typescriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return entry.name === 'generated' ? [] : typescriptFiles(path);
      return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

function canAccessPersistence(projectPath) {
  return (
    projectPath.includes('/infrastructure/') ||
    projectPath.includes('/tests/') ||
    projectPath.endsWith('.spec.ts') ||
    projectPath.startsWith('core/database/') ||
    projectPath === 'core/health/application/services/health.service.ts'
  );
}

function normalize(path) {
  return path.split(sep).join('/');
}

function verifyWorkspaceCascadeRelations(schema, target) {
  for (const match of schema.matchAll(/model\s+(\w+)\s+\{([\s\S]*?)\n\}/g)) {
    const [, model = 'unknown', body = ''] = match;
    if (!/^\s*organizationId\s+/m.test(body)) continue;

    const organizationRelation = body.match(
      /^\s*organization\s+Organization\s+@relation\((.*)\)$/m,
    );
    if (!organizationRelation) {
      target.push(
        `prisma/schema.prisma: ${model} has organizationId without a direct Organization relation`,
      );
      continue;
    }
    if (!organizationRelation[1]?.includes('onDelete: Cascade')) {
      target.push(
        `prisma/schema.prisma: ${model}.organization must use onDelete: Cascade for workspace purge`,
      );
    }
  }
}
