import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../infrastructure/redis/redis.module';
import { DistributedLockService } from '../infrastructure/redis/distributed-lock.service';
import { TransitionDefinitionEntity } from '../infrastructure/database/entities/transition-definition.entity';

export interface GatewayMergeResult {
  allArrived: boolean;
  arrivedCount: number;
  expectedCount: number;
}

@Injectable()
export class GatewayEvaluator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly lockService: DistributedLockService,
  ) {}

  /**
   * XOR diverging: evaluate conditions in order, return first truthy transition.
   * Falls back to default transition if no condition matches.
   */
  evaluateExclusiveDiverging(
    transitions: TransitionDefinitionEntity[],
    variables: Record<string, unknown>,
  ): TransitionDefinitionEntity | null {
    // Try each non-default transition in order
    const conditionalTransitions = transitions.filter((t) => !t.isDefault && t.conditionExpression);
    const defaultTransition = transitions.find((t) => t.isDefault) ?? null;

    for (const transition of conditionalTransitions) {
      if (this.evaluateCondition(transition.conditionExpression!, variables)) {
        return transition;
      }
    }

    // Fall back to default
    return defaultTransition;
  }

  /**
   * AND diverging: return all outgoing transitions (all branches execute).
   */
  evaluateParallelDiverging(
    transitions: TransitionDefinitionEntity[],
  ): TransitionDefinitionEntity[] {
    return transitions;
  }

  /**
   * Register a token arriving at a converging gateway.
   * Returns whether all expected tokens have arrived.
   */
  async registerTokenArrival(
    instanceId: string,
    gatewayId: string,
    tokenId: string,
    expectedCount: number,
  ): Promise<GatewayMergeResult> {
    const setKey = `gateway:merge:${instanceId}:${gatewayId}`;
    const lockKey = `gateway-merge:${instanceId}:${gatewayId}`;

    return this.lockService.withLock(lockKey, 5000, async () => {
      await this.redis.sadd(setKey, tokenId);
      const arrivedCount = await this.redis.scard(setKey);

      const allArrived = arrivedCount >= expectedCount;

      if (allArrived) {
        // Set expiry for cleanup — will be cleared explicitly too
        await this.redis.expire(setKey, 60);
      }

      return { allArrived, arrivedCount, expectedCount };
    });
  }

  /**
   * Clear merge state for a gateway after successful merge.
   */
  async clearMergeState(instanceId: string, gatewayId: string): Promise<void> {
    const setKey = `gateway:merge:${instanceId}:${gatewayId}`;
    await this.redis.del(setKey);
  }

  /**
   * Evaluate a condition expression against variables using a safe parser.
   * Supports: ==, !=, >, <, >=, <=, &&, ||, !, parentheses, strings, numbers, booleans, null.
   */
  private evaluateCondition(expression: string, variables: Record<string, unknown>): boolean {
    try {
      return !!this.safeEval(expression.trim(), variables);
    } catch {
      return false;
    }
  }

  private safeEval(expr: string, vars: Record<string, unknown>): unknown {
    const tokens = this.tokenize(expr);
    let pos = 0;

    const peek = () => tokens[pos] || '';
    const consume = (expected?: string) => {
      const t = tokens[pos++];
      if (expected && t !== expected) throw new Error(`Expected '${expected}', got '${t}'`);
      return t;
    };

    const parseOr = (): unknown => {
      let left = parseAnd();
      while (peek() === '||') { consume(); left = !!(left) || !!(parseAnd()); }
      return left;
    };

    const parseAnd = (): unknown => {
      let left = parseComparison();
      while (peek() === '&&') { consume(); left = !!(left) && !!(parseComparison()); }
      return left;
    };

    const parseComparison = (): unknown => {
      let left = parseUnary();
      const op = peek();
      if (['==', '===', '!=', '!==', '>', '<', '>=', '<='].includes(op)) {
        consume();
        const right = parseUnary();
        switch (op) {
          case '==': case '===': return left === right;
          case '!=': case '!==': return left !== right;
          case '>': return (left as number) > (right as number);
          case '<': return (left as number) < (right as number);
          case '>=': return (left as number) >= (right as number);
          case '<=': return (left as number) <= (right as number);
        }
      }
      return left;
    };

    const parseUnary = (): unknown => {
      if (peek() === '!') { consume(); return !parseUnary(); }
      return parsePrimary();
    };

    const parsePrimary = (): unknown => {
      const t = peek();
      if (t === '(') { consume(); const v = parseOr(); consume(')'); return v; }
      consume();
      if (t === 'true') return true;
      if (t === 'false') return false;
      if (t === 'null' || t === 'undefined') return null;
      if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')))
        return t.slice(1, -1);
      if (!isNaN(Number(t)) && t !== '') return Number(t);
      // Variable path (e.g., "status" or "order.amount")
      return this.resolveVarPath(t, vars);
    };

    const result = parseOr();
    return result;
  }

  private resolveVarPath(path: string, vars: Record<string, unknown>): unknown {
    return path.split('.').reduce<unknown>((obj, key) => {
      if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
      return undefined;
    }, vars);
  }

  private tokenize(expr: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < expr.length) {
      if (/\s/.test(expr[i])) { i++; continue; }
      if ('()'.includes(expr[i])) { tokens.push(expr[i++]); continue; }
      if (expr[i] === '!' && expr[i + 1] === '=') {
        tokens.push(expr[i + 2] === '=' ? '!==' : '!=');
        i += expr[i + 2] === '=' ? 3 : 2; continue;
      }
      if (expr[i] === '!' ) { tokens.push('!'); i++; continue; }
      if (expr[i] === '=' && expr[i + 1] === '=') {
        tokens.push(expr[i + 2] === '=' ? '===' : '==');
        i += expr[i + 2] === '=' ? 3 : 2; continue;
      }
      if (expr[i] === '&' && expr[i + 1] === '&') { tokens.push('&&'); i += 2; continue; }
      if (expr[i] === '|' && expr[i + 1] === '|') { tokens.push('||'); i += 2; continue; }
      if (expr[i] === '>' || expr[i] === '<') {
        if (expr[i + 1] === '=') { tokens.push(expr[i] + '='); i += 2; }
        else { tokens.push(expr[i]); i++; }
        continue;
      }
      if (expr[i] === "'" || expr[i] === '"') {
        const q = expr[i]; let s = q; i++;
        while (i < expr.length && expr[i] !== q) s += expr[i++];
        s += q; i++; tokens.push(s); continue;
      }
      // Number or identifier (variable path)
      let tok = '';
      while (i < expr.length && /[\w.]/.test(expr[i])) tok += expr[i++];
      if (tok) tokens.push(tok);
    }
    return tokens;
  }
}
