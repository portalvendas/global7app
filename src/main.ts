import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CompanyType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { PrismaService } from './database/prisma.service';

/**
 * Seed idempotente no boot (útil no Free do Render, que não tem Shell).
 * Ativa com SEED_ON_BOOT=true. Cria a empresa OPERATOR (Global 7) e o 1º admin
 * a partir de ADMIN_EMAIL / ADMIN_PASSWORD. Rodar 1x e depois voltar SEED_ON_BOOT=false.
 */
async function seedOnBoot(app: INestApplication, config: ConfigService, logger: Logger): Promise<void> {
  if (config.get<string>('SEED_ON_BOOT') !== 'true') return;
  const prisma = app.get(PrismaService);
  const email = (config.get<string>('ADMIN_EMAIL') || '[email protected]').toLowerCase();
  const password = config.get<string>('ADMIN_PASSWORD') || 'ChangeMe@123';

  let operator = await prisma.company.findFirst({ where: { type: CompanyType.OPERATOR } });
  if (!operator) {
    operator = await prisma.company.create({ data: { type: CompanyType.OPERATOR, name: 'Global 7' } });
    logger.log('seed_on_boot: empresa OPERATOR (Global 7) criada');
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    logger.log('seed_on_boot: admin já existe, nada a fazer');
    return;
  }
  await prisma.user.create({
    data: {
      companyId: operator.id,
      role: UserRole.GLOBAL7_ADMIN,
      name: 'Admin Global 7',
      email,
      password: await bcrypt.hash(password, 10),
    },
  });
  logger.log(`seed_on_boot: admin criado (${email})`);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: config.get<string>('CORS_ORIGIN', '*'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());

  const swagger = new DocumentBuilder()
    .setTitle('Global 7 API')
    .setDescription('App operacional — Global 7')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await seedOnBoot(app, config, logger);

  const port = Number(config.get('PORT', 3001));
  await app.listen(port, '0.0.0.0');
  logger.log(`Global 7 API on :${port} — Swagger em /docs`);
}
void bootstrap();
