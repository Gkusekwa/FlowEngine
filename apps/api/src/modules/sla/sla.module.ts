import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlaEventEntity, SlaDefinitionEntity, TaskInstanceEntity } from '../../infrastructure/database/entities';
import { SlaService } from './sla.service';
import { SlaController } from './sla.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SlaEventEntity, SlaDefinitionEntity, TaskInstanceEntity]),
  ],
  controllers: [SlaController],
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}
