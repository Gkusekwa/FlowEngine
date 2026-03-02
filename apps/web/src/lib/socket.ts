import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export interface SocketOptions {
  token: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export function connectSocket(options: SocketOptions): Socket {
  if (socket?.connected) {
    return socket;
  }

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  socket = io(`${baseUrl}/events`, {
    auth: {
      token: options.token,
    },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('WebSocket connected');
    options.onConnect?.();
  });

  socket.on('disconnect', (reason: string) => {
    console.log('WebSocket disconnected:', reason);
    options.onDisconnect?.();
  });

  socket.on('connect_error', (error: Error) => {
    console.error('WebSocket connection error:', error);
    options.onError?.(error);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

// Typed event listeners

export function onTaskCreated(callback: (data: Record<string, unknown>) => void): void {
  socket?.on('task:created', callback);
}

export function onTaskAssigned(callback: (data: Record<string, unknown>) => void): void {
  socket?.on('task:assigned', callback);
}

export function onTaskCompleted(callback: (data: Record<string, unknown>) => void): void {
  socket?.on('task:completed', callback);
}

export function onInstanceStatus(callback: (data: { instanceId: string; status: string }) => void): void {
  socket?.on('instance:status', callback);
}

export function onSlaWarning(callback: (data: Record<string, unknown>) => void): void {
  socket?.on('sla:warning', callback);
}

export function onSlaBreach(callback: (data: Record<string, unknown>) => void): void {
  socket?.on('sla:breach', callback);
}

// Instance subscription

export function subscribeToInstance(instanceId: string): void {
  socket?.emit('subscribe:instance', instanceId);
}

export function unsubscribeFromInstance(instanceId: string): void {
  socket?.emit('unsubscribe:instance', instanceId);
}

// Remove listeners

export function removeListener(event: string): void {
  socket?.off(event);
}

export function removeAllListeners(): void {
  socket?.removeAllListeners();
}
