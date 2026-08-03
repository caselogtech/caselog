import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectController } from './presentation/controllers/project.controller';
import { ProjectRepository } from './infrastructure/repositories/project.repository';
import { ProjectService } from './application/services/project.service';

@Module({
  imports: [AuthModule],
  controllers: [ProjectController],
  providers: [ProjectRepository, ProjectService],
})
export class ProjectModule {}
