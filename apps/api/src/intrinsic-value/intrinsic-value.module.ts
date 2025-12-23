import { Module } from '@nestjs/common';
import { IntrinsicValueController } from './intrinsic-value.controller';
import { IntrinsicValueService } from './intrinsic-value.service';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  controllers: [IntrinsicValueController],
  providers: [IntrinsicValueService],
  exports: [IntrinsicValueService],
})
export class IntrinsicValueModule {}

