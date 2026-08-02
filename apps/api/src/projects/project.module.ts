import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectController } from './project.controller';
import { ProjectRepository } from './project.repository';
import { ProjectService } from './project.service';

@Module({
  imports: [AuthModule],
  controllers: [ProjectController],
  providers: [ProjectRepository, ProjectService],
})
export class ProjectModule {}
