import { Injectable, Logger } from '@nestjs/common';
import { SsrfGuard } from './ssrf.guard';

export interface HttpServiceConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

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

      const responseBody = await response.text();
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
