import { Module } from '@nestjs/common';
import { IntrinsicValueController } from './intrinsic-value.controller';
import { IntrinsicValueService } from './intrinsic-value.service';

@Module({
  controllers: [IntrinsicValueController],
  providers: [IntrinsicValueService],
  exports: [IntrinsicValueService],
})
export class IntrinsicValueModule {}

