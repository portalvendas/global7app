import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawBody =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';
    let message: unknown =
      typeof rawBody === 'string' ? rawBody : ((rawBody as Record<string, unknown>).message ?? rawBody);

    // Traduz erros conhecidos do Prisma p/ status de negócio (senão viram 500).
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT; // 409
        const target = (exception.meta?.target as string[] | string | undefined);
        const field = Array.isArray(target) ? target.join(', ') : target;
        message = field ? `Já existe um registro com este valor único (${field})` : 'Registro duplicado (valor único)';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST; // 400
        message = 'Referência inválida (registro relacionado não existe)';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND; // 404
        message = 'Registro não encontrado';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Dados inválidos para a operação';
    }

    if (status >= 500) {
      this.logger.error(
        `status=${status} ${JSON.stringify(message)}`,
        (exception as Error)?.stack,
      );
    }
    res.status(status).json({ success: false, statusCode: status, error: message });
  }
}
