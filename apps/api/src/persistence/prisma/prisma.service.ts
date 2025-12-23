import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      // 데이터베이스 연결 타임아웃 설정
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // 로그 설정 (디버깅용)
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });

    // 타임아웃 이벤트 처리
    this.$on('warn' as never, (e: any) => {
      console.warn('Prisma Warning:', e);
    });

    this.$on('error' as never, (e: any) => {
      console.error('Prisma Error:', e);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
