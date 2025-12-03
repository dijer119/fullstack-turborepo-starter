import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

declare const module: any;
async function bootstrap() {
  const logger = new Logger('EntryPoint');
  const app = await NestFactory.create(AppModule);

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS - 모든 출처 허용 (다른 컴퓨터에서 접속 가능)
  app.enableCors({
    origin: true, // 모든 출처 허용
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const config = new DocumentBuilder()
    .setTitle('Fullstack Turborepo API')
    .setDescription('API documentation for Fullstack Turborepo Starter')
    .setVersion('1.0')
    .addTag('users')
    .addTag('companies')
    .addTag('telegram')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const PORT = process.env.PORT || 3001;

  // 0.0.0.0으로 바인딩하여 외부 접속 허용
  await app.listen(PORT, '0.0.0.0');

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => app.close());
  }
  logger.log(`Server running on http://localhost:${PORT}`);
  logger.log(`API Documentation: http://localhost:${PORT}/docs`);
  logger.log(`Network access enabled - Server listening on 0.0.0.0:${PORT}`);
}
bootstrap();
