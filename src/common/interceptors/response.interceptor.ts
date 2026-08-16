import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, { success: true; data: T } | StreamableFile>
{
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ success: true; data: T } | StreamableFile> {
    return next.handle().pipe(
      // Respostas binárias (download do original) passam direto, sem envelope.
      map((data) =>
        data instanceof StreamableFile ? data : { success: true as const, data },
      ),
    );
  }
}
