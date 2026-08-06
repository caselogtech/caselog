import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CsvImportService } from './application/services/csv-import.service';
import { CsvImportRepository } from './infrastructure/repositories/csv-import.repository';
import { CsvImportController } from './presentation/controllers/csv-import.controller';

@Module({
  imports: [AuthModule],
  controllers: [CsvImportController],
  providers: [CsvImportRepository, CsvImportService],
})
export class ImportModule {}
