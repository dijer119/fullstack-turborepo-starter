import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppResolver } from './app.resolver';
import { validationSchemaForEnv } from './config/environment-variables';
import { PersistenceModule } from './persistence/persistence.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { TelegramModule } from './telegram/telegram.module';
import { IntrinsicValueModule } from './intrinsic-value/intrinsic-value.module';
import { KrxModule } from './krx/krx.module';
import { StockModule } from './stock/stock.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: validationSchemaForEnv,
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      introspection: true,
    }),
    ScheduleModule.forRoot(),
    PersistenceModule,
    UsersModule,
    CompaniesModule,
    TelegramModule,
    IntrinsicValueModule,
    KrxModule,
    StockModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppResolver],
})
export class AppModule { }
