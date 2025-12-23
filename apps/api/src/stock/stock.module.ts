import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockResolver } from './stock.resolver';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
    imports: [PersistenceModule],
    providers: [StockService, StockResolver],
    exports: [StockService],
})
export class StockModule { }
