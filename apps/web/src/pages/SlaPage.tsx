import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import { api } from '../services/api';

interface SlaEvent {
  id: string;
  eventType: 'warning' | 'breach' | 'escalation';
  thresholdSeconds: number;
  actualDurationSeconds: number;
  escalationLevel: number;
  acknowledged: boolean;
  createdAt: string;
  taskInstance: {
    id: string;
    activityName: string;
  };
  acknowledgedBy?: {
    id: string;
    name: string;
  };
}

interface DashboardStats {
  totalEvents: number;
  warnings: number;
  breaches: number;
  escalations: number;
  unacknowledged: number;
  complianceRate: number;
}

export function SlaPage() {
  const [filter, setFilter] = useState<'all' | 'warning' | 'breach' | 'escalation'>('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['sla', 'dashboard'],
    queryFn: () => api.get('/sla/dashboard').then((r: AxiosResponse) => r.data.data),
  });

  const { data: events, isLoading } = useQuery<SlaEvent[]>({
    queryKey: ['sla', 'events', filter, showAcknowledged],
    queryFn: () =>
      api
        .get('/sla/events', {
          params: {
            eventType: filter !== 'all' ? filter : undefined,
            acknowledged: showAcknowledged ? undefined : false,
          },
        })
        .then((r: AxiosResponse) => r.data.data?.items ?? r.data.data ?? []),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (eventId: string) =>
      api.post(`/sla/events/${eventId}/acknowledge`, { note: 'Acknowledged via dashboard' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla'] });
    },
  });

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const getEventBadge = (eventType: string) => {
    const styles: Record<string, string> = {
      warning: 'bg-yellow-100 text-yellow-800',
      breach: 'bg-red-100 text-red-800',
      escalation: 'bg-purple-100 text-purple-800',
    };
    return (
      <span className={`rounded-full px-2 py-1 text-xs font-medium ${styles[eventType]}`}>
        {eventType.toUpperCase()}
      </span>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">SLA Monitoring</h1>
      <p className="mt-1 text-gray-600">Track SLA warnings, breaches, and escalations</p>

      {/* Stats Cards */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Events"
          value={stats?.totalEvents?.toString() ?? '--'}
          description="All time"
        />
        <StatCard
          title="Warnings"
          value={stats?.warnings?.toString() ?? '--'}
          description="Approaching SLA"
          className="border-l-4 border-l-yellow-400"
        />
        <StatCard
          title="Breaches"
          value={stats?.breaches?.toString() ?? '--'}
          description="SLA exceeded"
          className="border-l-4 border-l-red-400"
        />
        <StatCard
          title="Compliance Rate"
          value={stats ? `${stats.complianceRate}%` : '--'}
          description="Tasks within SLA"
          className="border-l-4 border-l-green-400"
        />
      </div>

      {/* Filters */}
      <div className="mt-8 flex items-center gap-4">
        <div className="flex gap-2">
          {(['all', 'warning', 'breach', 'escalation'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                filter === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showAcknowledged}
            onChange={(e) => setShowAcknowledged(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show acknowledged
        </label>
      </div>

      {/* Events Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Event
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Task
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Threshold
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Actual
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Time
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : events?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No SLA events found
                </td>
              </tr>
            ) : (
              events?.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap px-6 py-4">
                    {getEventBadge(event.eventType)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900">
                      {event.taskInstance?.activityName ?? 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {formatDuration(event.thresholdSeconds)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {formatDuration(event.actualDurationSeconds)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    {event.acknowledged ? (
                      <span className="text-sm text-gray-400">Acknowledged</span>
                    ) : (
                      <button
                        onClick={() => acknowledgeMutation.mutate(event.id)}
                        disabled={acknowledgeMutation.isPending}
                        className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  className = '',
}: {
  title: string;
  value: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-6 ${className}`}>
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}
