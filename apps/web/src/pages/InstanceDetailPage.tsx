import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface TaskInstance {
  id: string;
  activityDefinitionId: string;
  status: string;
  assignedTo: string | null;
  assignedGroup: string | null;
  startedAt: string | null;
  completedAt: string | null;
  activityDefinition?: { name: string | null; bpmnElementId: string; type: string };
}

interface ExecutionToken {
  id: string;
  currentActivityId: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

interface InstanceDetail {
  id: string;
  workflowDefinitionId: string;
  status: string;
  variables: Record<string, unknown>;
  startedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  workflowDefinition?: { name: string; version: number };
  tasks: TaskInstance[];
  tokens: ExecutionToken[];
}

interface TimelineEntry {
  id: string;
  taskInstanceId: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string | null;
  changedAt: string;
  reason: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  created: 'bg-blue-100 text-blue-800',
  running: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  failed: 'bg-red-100 text-red-800',
  suspended: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-orange-100 text-orange-800',
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-blue-100 text-blue-800',
};

export function InstanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [instance, setInstance] = useState<InstanceDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchInstance = async () => {
    try {
      const { data } = await api.get(`/instances/${id}`);
      setInstance(data.data);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    try {
      const { data } = await api.get(`/instances/${id}/timeline`);
      setTimeline(data.data);
    } catch {
      // handled
    }
  };

  useEffect(() => {
    fetchInstance();
    fetchTimeline();
  }, [id]);

  const handleAction = async (action: 'cancel' | 'suspend' | 'resume') => {
    setActionLoading(true);
    try {
      await api.post(`/instances/${id}/${action}`);
      await fetchInstance();
    } catch {
      // handled
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!instance) {
    return <div className="py-12 text-center text-gray-500">Instance not found</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => navigate('/instances')} className="mb-4 text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to Instances
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {instance.workflowDefinition?.name || 'Workflow Instance'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              v{instance.workflowDefinition?.version || '?'} &middot; {instance.id.slice(0, 8)}...
              {instance.correlationId && ` &middot; ${instance.correlationId}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[instance.status] || 'bg-gray-100 text-gray-800'}`}>
              {instance.status}
            </span>
            {instance.status === 'running' && (
              <>
                <button onClick={() => handleAction('suspend')} disabled={actionLoading} className="rounded-lg border border-yellow-300 px-3 py-1.5 text-sm font-medium text-yellow-700 hover:bg-yellow-50 disabled:opacity-50">Suspend</button>
                <button onClick={() => handleAction('cancel')} disabled={actionLoading} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Cancel</button>
              </>
            )}
            {instance.status === 'suspended' && (
              <button onClick={() => handleAction('resume')} disabled={actionLoading} className="rounded-lg border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50">Resume</button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Instance details */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Started At</dt>
              <dd className="text-gray-900">{instance.startedAt ? new Date(instance.startedAt).toLocaleString() : '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Completed At</dt>
              <dd className="text-gray-900">{instance.completedAt ? new Date(instance.completedAt).toLocaleString() : '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created At</dt>
              <dd className="text-gray-900">{new Date(instance.createdAt).toLocaleString()}</dd>
            </div>
            {(instance.metadata as Record<string, string>).failureReason ? (
              <div>
                <dt className="text-gray-500">Failure Reason</dt>
                <dd className="mt-1 rounded bg-red-50 p-2 text-sm text-red-700">{String((instance.metadata as Record<string, string>).failureReason)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {/* Variables */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Variables</h2>
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-gray-50 p-4 text-xs">
            {JSON.stringify(instance.variables, null, 2)}
          </pre>
        </div>

        {/* Active tasks */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Tasks ({instance.tasks.length})</h2>
          {instance.tasks.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No tasks yet</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Activity</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Assigned To</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Started</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {instance.tasks.map((task) => (
                    <tr key={task.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/tasks/${task.id}`)}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {task.activityDefinition?.name || task.activityDefinition?.bpmnElementId || '?'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-800'}`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{task.assignedTo?.slice(0, 8) || task.assignedGroup || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{task.startedAt ? new Date(task.startedAt).toLocaleString() : '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
          {timeline.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No events yet</p>
          ) : (
            <div className="mt-4 space-y-3">
              {timeline.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary-500" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">
                      {entry.fromStatus && <span className="text-gray-500">{entry.fromStatus} &rarr; </span>}
                      <span className="font-medium">{entry.toStatus}</span>
                    </p>
                    {entry.reason && <p className="mt-0.5 text-xs text-gray-500">{entry.reason}</p>}
                  </div>
                  <span className="text-xs text-gray-400">{new Date(entry.changedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
