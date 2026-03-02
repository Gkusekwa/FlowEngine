import { Injectable, Logger } from '@nestjs/common';
import { SsrfGuard } from './ssrf.guard';

export interface HttpServiceConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  maxResponseSize?: number;
}

const DEFAULT_MAX_RESPONSE_SIZE = 1 * 1024 * 1024; // 1MB

@Injectable()
export class HttpServiceExecutor {
  private readonly logger = new Logger(HttpServiceExecutor.name);

  constructor(private readonly ssrfGuard: SsrfGuard) {}

  async execute(
    config: HttpServiceConfig,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Interpolate variables in URL, headers, and body
    const url = this.interpolate(config.url, variables);
    const method = (config.method || 'GET').toUpperCase();
    const headers: Record<string, string> = config.headers
      ? Object.fromEntries(
          Object.entries(config.headers).map(([k, v]) => [k, this.interpolate(v, variables)]),
        )
      : {};
    const body = config.body ? this.interpolateObject(config.body, variables) : undefined;
    const timeout = config.timeout || 30000;

    // Validate URL against SSRF
    await this.ssrfGuard.validateUrl(url);

    this.logger.log(`Executing HTTP ${method} ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      // Enforce response size limit to prevent DoS
      const maxSize = config.maxResponseSize || DEFAULT_MAX_RESPONSE_SIZE;
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxSize) {
        throw new Error(
          `HTTP ${method} ${url} response too large: ${contentLength} bytes (max ${maxSize})`,
        );
      }

      // Read body with size limit using streaming
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalSize += value.byteLength;
          if (totalSize > maxSize) {
            reader.cancel();
            throw new Error(
              `HTTP ${method} ${url} response too large: exceeded ${maxSize} bytes`,
            );
          }
          chunks.push(value);
        }
      }

      const responseBody = new TextDecoder().decode(
        chunks.length === 1
          ? chunks[0]
          : new Uint8Array(chunks.reduce((acc, c) => [...acc, ...c], [] as number[])),
      );

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        parsedBody = responseBody;
      }

      const result: Record<string, unknown> = {
        statusCode: response.status,
        body: parsedBody,
      };

      if (response.status >= 400) {
        throw new Error(`HTTP ${method} ${url} returned ${response.status}: ${responseBody}`);
      }

      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private interpolate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\$\{(\w+(?:\.\w+)*)}/g, (_match, path: string) => {
      const value = this.resolvePath(variables, path);
      return value !== undefined ? String(value) : '';
    });
  }

  private interpolateObject(obj: unknown, variables: Record<string, unknown>): unknown {
    if (typeof obj === 'string') return this.interpolate(obj, variables);
    if (Array.isArray(obj)) return obj.map((item) => this.interpolateObject(item, variables));
    if (obj && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, this.interpolateObject(v, variables)]),
      );
    }
    return obj;
  }

  private resolvePath(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((curr, key) => {
      if (curr && typeof curr === 'object') return (curr as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }
}
