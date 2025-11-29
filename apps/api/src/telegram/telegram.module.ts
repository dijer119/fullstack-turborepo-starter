import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramGateway } from './telegram.gateway';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramGateway],
  exports: [TelegramService, TelegramGateway],
})
export class TelegramModule {}

