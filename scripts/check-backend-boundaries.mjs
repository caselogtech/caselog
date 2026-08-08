import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const apiSource = resolve('apps/api/src');
const importPattern = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;
const prismaImports = [
  /generated\/prisma(?:\/|$)/,
  /@prisma\/client(?:\/|$)/,
  /database\/infrastructure\/prisma(?:\/|$)/,
];
const tenantDatabaseImport = /tenant-database\.service$/;
const unsafeRawQueries = ['$queryRawUnsafe', '$executeRawUnsafe'];

const files = await typescriptFiles(apiSource);
const violations = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const projectPath = normalize(relative(apiSource, file));

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

function importedModules(source) {
  return [...source.matchAll(importPattern)].map((match) => match[1] ?? '');
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
