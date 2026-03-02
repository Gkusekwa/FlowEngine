import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { addToast } from '../components/common/ToastContainer';

export function useWebSocket(isAuthenticated: boolean) {
  const queryClient = useQueryClient();
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      connectedRef.current = false;
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token || connectedRef.current) return;

    const socket = connectSocket({
      token,
      onConnect: () => {
        connectedRef.current = true;
      },
      onDisconnect: () => {
        connectedRef.current = false;
      },
    });

    // Task events
    socket.on('task:created', (data: Record<string, unknown>) => {
      addToast('info', 'New Task', `Task "${data.activityName || 'Unnamed'}" is available`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    socket.on('task:assigned', (data: Record<string, unknown>) => {
      const action = data.action === 'claimed' ? 'claimed' : 'assigned to you';
      addToast('info', 'Task Assigned', `A task has been ${action}`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    socket.on('task:completed', (data: Record<string, unknown>) => {
      addToast('success', 'Task Completed', `Task ${String(data.taskId).slice(0, 8)}... completed`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['instances'] });
    });

    // Instance events
    socket.on('instance:status', (data: { instanceId: string; status: string }) => {
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      queryClient.invalidateQueries({ queryKey: ['instance', data.instanceId] });
    });

    // SLA events
    socket.on('sla:warning', (data: Record<string, unknown>) => {
      addToast('warning', 'SLA Warning', `Task approaching SLA threshold`);
      queryClient.invalidateQueries({ queryKey: ['sla'] });
    });

    socket.on('sla:breach', (data: Record<string, unknown>) => {
      addToast('error', 'SLA Breach', `Task has exceeded its SLA deadline`);
      queryClient.invalidateQueries({ queryKey: ['sla'] });
    });

    return () => {
      disconnectSocket();
      connectedRef.current = false;
    };
  }, [isAuthenticated, queryClient]);
}
