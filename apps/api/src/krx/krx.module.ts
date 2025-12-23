import { Module } from '@nestjs/common';
import { KrxSchedulerService } from './krx-scheduler.service';
import { KrxSafetyMarginService } from './krx-safety-margin.service';
import { KrxController } from './krx.controller';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  controllers: [KrxController],
  providers: [KrxSchedulerService, KrxSafetyMarginService],
  exports: [KrxSchedulerService, KrxSafetyMarginService],
})
export class KrxModule {}

