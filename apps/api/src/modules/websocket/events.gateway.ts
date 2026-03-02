import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  tenantId?: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Client ${client.id} connection rejected: no token`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.userId = payload.sub;
      client.tenantId = payload.tenantId;

      // Join tenant room
      if (client.tenantId) {
        client.join(`tenant:${client.tenantId}`);
      }

      // Join user-specific room
      client.join(`user:${client.userId}`);

      this.logger.log(
        `Client ${client.id} connected (user: ${client.userId}, tenant: ${client.tenantId})`,
      );
    } catch (error) {
      this.logger.warn(`Client ${client.id} connection rejected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe:instance')
  handleSubscribeInstance(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() instanceId: string,
  ) {
    client.join(`instance:${instanceId}`);
    this.logger.debug(`Client ${client.id} subscribed to instance ${instanceId}`);
    return { success: true };
  }

  @SubscribeMessage('unsubscribe:instance')
  handleUnsubscribeInstance(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() instanceId: string,
  ) {
    client.leave(`instance:${instanceId}`);
    return { success: true };
  }

  // Event emission methods (called by services)

  emitToTenant(tenantId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToInstance(instanceId: string, event: string, data: unknown) {
    this.server.to(`instance:${instanceId}`).emit(event, data);
  }

  // Typed event emitters

  emitTaskCreated(tenantId: string, taskData: Record<string, unknown>) {
    this.emitToTenant(tenantId, 'task:created', taskData);
  }

  emitTaskAssigned(userId: string, taskData: Record<string, unknown>) {
    this.emitToUser(userId, 'task:assigned', taskData);
  }

  emitTaskCompleted(tenantId: string, instanceId: string, taskData: Record<string, unknown>) {
    this.emitToTenant(tenantId, 'task:completed', taskData);
    this.emitToInstance(instanceId, 'task:completed', taskData);
  }

  emitInstanceStatus(tenantId: string, instanceId: string, status: string) {
    const data = { instanceId, status };
    this.emitToTenant(tenantId, 'instance:status', data);
    this.emitToInstance(instanceId, 'instance:status', data);
  }

  emitSlaWarning(tenantId: string, eventData: Record<string, unknown>) {
    this.emitToTenant(tenantId, 'sla:warning', eventData);
  }

  emitSlaBreach(tenantId: string, eventData: Record<string, unknown>) {
    this.emitToTenant(tenantId, 'sla:breach', eventData);
  }

  private extractToken(client: Socket): string | null {
    // Try Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Try query param
    const token = client.handshake.query.token;
    if (typeof token === 'string') {
      return token;
    }

    // Try auth object
    const auth = client.handshake.auth;
    if (auth?.token) {
      return auth.token;
    }

    return null;
  }
}
