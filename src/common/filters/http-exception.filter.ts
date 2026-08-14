import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';
    const message =
      typeof body === 'string' ? body : ((body as Record<string, unknown>).message ?? body);

    if (status >= 500) {
      this.logger.error(
        `status=${status} ${JSON.stringify(message)}`,
        (exception as Error)?.stack,
      );
    }
    res.status(status).json({ success: false, statusCode: status, error: message });
  }
}
