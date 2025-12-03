import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validationSchemaForEnv } from './config/environment-variables';
import { PersistenceModule } from './persistence/persistence.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { TelegramModule } from './telegram/telegram.module';
import { IntrinsicValueModule } from './intrinsic-value/intrinsic-value.module';
import { KrxModule } from './krx/krx.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: validationSchemaForEnv,
    }),
    ScheduleModule.forRoot(),
    PersistenceModule,
    UsersModule,
    CompaniesModule,
    TelegramModule,
    IntrinsicValueModule,
    KrxModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
