import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes } from '@flowengine/shared';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId || 'unknown';

    let status: number;
    let code: string;
    let message: string;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, any>;
        code = resp.code || this.statusToErrorCode(status);
        message = resp.message || exception.message;
        details = resp.details;

        // Handle class-validator errors
        if (Array.isArray(resp.message)) {
          code = ErrorCodes.VALIDATION_FAILED;
          message = 'Validation failed';
          details = { errors: resp.message };
        }
      } else {
        code = this.statusToErrorCode(status);
        message = String(exceptionResponse);
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = ErrorCodes.INTERNAL_ERROR;
      message = 'An unexpected error occurred';

      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      requestId,
    });
  }

  private statusToErrorCode(status: number): string {
    switch (status) {
      case 400:
        return ErrorCodes.VALIDATION_FAILED;
      case 401:
        return ErrorCodes.AUTH_TOKEN_INVALID;
      case 403:
        return ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS;
      case 404:
        return 'RESOURCE_NOT_FOUND';
      case 409:
        return ErrorCodes.CONCURRENCY_VERSION_CONFLICT;
      case 429:
        return ErrorCodes.RATE_LIMIT_EXCEEDED;
      default:
        return ErrorCodes.INTERNAL_ERROR;
    }
  }
}
