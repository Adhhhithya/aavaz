import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips any request-body field not declared on the DTO —
      // the same "unknown fields are ignored, never trusted" behavior the
      // Python side relies on for e.g. rejecting a client-supplied user_id.
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`core-api listening on port ${port}`);
}

bootstrap();
