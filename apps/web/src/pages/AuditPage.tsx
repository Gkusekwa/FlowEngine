import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import { api } from '../services/api';

interface AuditEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  ipAddress: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'user.login': { label: 'Login', color: 'bg-purple-100 text-purple-800' },
  'user.logout': { label: 'Logout', color: 'bg-gray-100 text-gray-800' },
  'workflow.created': { label: 'Created', color: 'bg-green-100 text-green-800' },
  'workflow.updated': { label: 'Updated', color: 'bg-blue-100 text-blue-800' },
  'workflow.published': { label: 'Published', color: 'bg-indigo-100 text-indigo-800' },
  'workflow.deprecated': { label: 'Deprecated', color: 'bg-orange-100 text-orange-800' },
  'workflow.archived': { label: 'Archived', color: 'bg-gray-100 text-gray-800' },
  'workflow.deleted': { label: 'Deleted', color: 'bg-red-100 text-red-800' },
  'instance.started': { label: 'Started', color: 'bg-blue-100 text-blue-800' },
  'instance.cancelled': { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  'instance.suspended': { label: 'Suspended', color: 'bg-yellow-100 text-yellow-800' },
  'instance.resumed': { label: 'Resumed', color: 'bg-green-100 text-green-800' },
  'task.created': { label: 'Created', color: 'bg-green-100 text-green-800' },
  'task.claimed': { label: 'Claimed', color: 'bg-yellow-100 text-yellow-800' },
  'task.unclaimed': { label: 'Unclaimed', color: 'bg-gray-100 text-gray-800' },
  'task.completed': { label: 'Completed', color: 'bg-green-100 text-green-800' },
  'task.assigned': { label: 'Assigned', color: 'bg-blue-100 text-blue-800' },
  'tenant.created': { label: 'Created', color: 'bg-green-100 text-green-800' },
};

const RESOURCE_TYPES = [
  'all',
  'user',
  'workflow',
  'instance',
  'task',
  'tenant',
];

export function AuditPage() {
  const [resourceType, setResourceType] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ items: AuditEntry[]; total: number; totalPages: number }>({
    queryKey: ['audit', resourceType, page],
    queryFn: () =>
      api
        .get('/audit', {
          params: {
            resourceType: resourceType !== 'all' ? resourceType : undefined,
            page,
            pageSize: 50,
          },
        })
        .then((r: AxiosResponse) => r.data.data),
  });

  const entries = data?.items ?? [];

  const getActionBadge = (action: string) => {
    const config = ACTION_LABELS[action] ?? { label: action, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`rounded-full px-2 py-1 text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
      <p className="mt-1 text-gray-600">Track all system actions and changes</p>

      {/* Filters */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {RESOURCE_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => { setResourceType(type); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                resourceType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-8">
        {isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-8 text-center text-gray-500">
            Loading audit entries...
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-8 text-center text-gray-500">
            No audit entries found
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getActionBadge(entry.action)}
                    <span className="text-sm font-medium text-gray-900">
                      {entry.resourceType}
                      {entry.resourceId ? `: ${entry.resourceId.slice(0, 8)}...` : ''}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                  {entry.userId && (
                    <span>
                      By: <span className="font-medium">{entry.userId.slice(0, 8)}...</span>
                    </span>
                  )}
                  {entry.ipAddress && <span>IP: {entry.ipAddress}</span>}
                </div>

                {entry.newValues && Object.keys(entry.newValues).length > 0 && (
                  <div className="mt-3 rounded-lg bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-medium uppercase text-gray-500">Details</p>
                    <div className="space-y-1">
                      {Object.entries(entry.newValues).map(([field, value]) => (
                        <div key={field} className="text-sm">
                          <span className="font-medium text-gray-700">{field}:</span>{' '}
                          <span className="text-green-600">{JSON.stringify(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {data.totalPages} ({data.total} entries)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
