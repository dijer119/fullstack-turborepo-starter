import { Module } from '@nestjs/common';
import { KrxSchedulerService } from './krx-scheduler.service';
import { KrxSafetyMarginService } from './krx-safety-margin.service';
import { KrxController } from './krx.controller';

@Module({
  controllers: [KrxController],
  providers: [KrxSchedulerService, KrxSafetyMarginService],
  exports: [KrxSchedulerService, KrxSafetyMarginService],
})
export class KrxModule {}

