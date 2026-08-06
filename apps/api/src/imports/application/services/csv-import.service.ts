import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  csvImportPreviewResponseSchema,
  csvImportResponseSchema,
  type CsvImportPreviewResponse,
  type CsvImportRequest,
  type CsvImportResponse,
  type OrganizationAccessPrincipal,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  InvalidPayloadError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { CsvImportParseError } from '../../domain/errors/csv-import-parse.error';
import { parseCsvImport } from '../../domain/parsers/csv-import.parser';
import { CsvImportRepository } from '../../infrastructure/repositories/csv-import.repository';

@Injectable()
export class CsvImportService {
  constructor(@Inject(CsvImportRepository) private readonly imports: CsvImportRepository) {}

  async preview(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    request: CsvImportRequest,
  ): Promise<CsvImportPreviewResponse> {
    const preview = this.parse(request);
    const sectionIds = [
      ...new Set(preview.rows.flatMap((row) => (row.value ? [row.value.sectionId] : []))),
    ];
    const sections = await this.imports.missingSections(
      principal.organizationId,
      projectSlug,
      sectionIds,
    );
    if (sections.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (sections.sectionIds.length === 0) return preview;

    const missing = new Set(sections.sectionIds);
    const rows = preview.rows.map((row) =>
      row.value && missing.has(row.value.sectionId)
        ? {
            rowNumber: row.rowNumber,
            valid: false as const,
            issues: [{ field: 'sectionId', message: 'Section does not exist in this project' }],
          }
        : row,
    );
    const valid = rows.filter((row) => row.valid).length;
    return csvImportPreviewResponseSchema.parse({
      ...preview,
      summary: { total: rows.length, valid, invalid: rows.length - valid },
      rows,
    });
  }

  async commit(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    idempotencyKey: string,
    request: CsvImportRequest,
  ): Promise<CsvImportResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const preview = await this.preview(principal, projectSlug, request);
    if (preview.summary.total === 0) {
      throw new InvalidPayloadError('empty_csv_import', 'The CSV file contains no data rows');
    }
    if (preview.summary.invalid > 0) {
      throw new InvalidPayloadError('invalid_csv_rows', 'The CSV file contains invalid rows', {
        invalid: preview.summary.invalid,
        rows: preview.rows.filter((row) => !row.valid).slice(0, 100),
      });
    }
    const rows = preview.rows.flatMap((row) => (row.value ? [row.value] : []));
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const result = await this.imports.import(
      principal.organizationId,
      principal.sub,
      projectSlug,
      idempotencyKey,
      requestHash,
      rows,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'section_not_found') {
      throw new ResourceNotFoundError('section');
    }
    if (result.kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_key_reused',
        'The idempotency key was already used with a different request',
      );
    }
    return csvImportResponseSchema.parse(result.value);
  }

  private parse(request: CsvImportRequest): CsvImportPreviewResponse {
    try {
      return csvImportPreviewResponseSchema.parse(parseCsvImport(request));
    } catch (error) {
      if (error instanceof CsvImportParseError) {
        throw new InvalidPayloadError('invalid_csv', error.message, error.details);
      }
      throw error;
    }
  }
}
