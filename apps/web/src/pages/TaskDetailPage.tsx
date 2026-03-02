import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

interface SlaEvent {
  id: string;
  eventType: 'warning' | 'breach' | 'escalation';
  thresholdSeconds: number;
  actualDurationSeconds: number;
  escalationLevel: number;
  acknowledged: boolean;
  createdAt: string;
}

interface FormField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
}

interface TaskDetail {
  id: string;
  workflowInstanceId: string;
  status: string;
  assignedTo: string | null;
  assignedGroup: string | null;
  variables: Record<string, unknown>;
  completionResult: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  activityDefinition?: {
    name: string | null;
    bpmnElementId: string;
    type: string;
    config: {
      formFields?: FormField[];
      [key: string]: unknown;
    };
  };
  workflowInstance?: {
    id: string;
    workflowDefinition?: { name: string; version: number };
  };
  stateHistory?: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    changedBy: string | null;
    changedAt: string;
    reason: string | null;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-gray-100 text-gray-800',
  failed: 'bg-red-100 text-red-800',
};

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTask = async () => {
    try {
      const { data } = await api.get(`/tasks/${id}`);
      setTask(data.data);

      // Initialize form data from fields
      const fields = data.data.activityDefinition?.config?.formFields || [];
      const initial: Record<string, unknown> = {};
      for (const field of fields) {
        initial[field.id] = field.defaultValue ?? (field.type === 'boolean' ? false : '');
      }
      setFormData(initial);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTask(); }, [id]);

  // Fetch SLA events for this task
  const { data: slaEvents } = useQuery<SlaEvent[]>({
    queryKey: ['sla', 'events', id],
    queryFn: () =>
      api
        .get('/sla/events', { params: { taskInstanceId: id } })
        .then((r) => r.data.data?.items ?? r.data.data ?? []),
    enabled: !!task && task.status !== 'completed',
  });

  const handleFieldChange = (fieldId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/tasks/${id}/complete`, { result: formData });
      navigate('/tasks');
    } catch {
      // handled
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async () => {
    setActionLoading(true);
    try {
      await api.post(`/tasks/${id}/claim`);
      await fetchTask();
    } catch {
      // handled
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnclaim = async () => {
    setActionLoading(true);
    try {
      await api.post(`/tasks/${id}/unclaim`);
      await fetchTask();
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

  if (!task) {
    return <div className="py-12 text-center text-gray-500">Task not found</div>;
  }

  const formFields: FormField[] = task.activityDefinition?.config?.formFields || [];
  const isActive = task.status === 'active';
  const isPending = task.status === 'pending';
  const isCompleted = task.status === 'completed' || task.status === 'failed';

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => navigate('/tasks')} className="mb-4 text-sm text-gray-500 hover:text-gray-700">
        &larr; Back to Inbox
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {task.activityDefinition?.name || task.activityDefinition?.bpmnElementId || 'Task'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {task.workflowInstance?.workflowDefinition?.name || 'Workflow'} &middot; {task.id.slice(0, 8)}...
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-800'}`}>
            {task.status}
          </span>
          {isPending && !task.assignedTo && (
            <button onClick={handleClaim} disabled={actionLoading} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {actionLoading ? 'Claiming...' : 'Claim'}
            </button>
          )}
          {isActive && (
            <button onClick={handleUnclaim} disabled={actionLoading} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Unclaim
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Task metadata */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Assigned To</dt>
              <dd className="text-gray-900">{task.assignedTo ? task.assignedTo.slice(0, 8) + '...' : 'Unassigned'}</dd>
            </div>
            {task.assignedGroup && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Group</dt>
                <dd className="text-gray-900">{task.assignedGroup}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900">{new Date(task.createdAt).toLocaleString()}</dd>
            </div>
            {task.completedAt && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Completed</dt>
                <dd className="text-gray-900">{new Date(task.completedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* SLA Indicators */}
        {slaEvents && slaEvents.length > 0 && (
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">SLA Status</h2>
            <div className="mt-4 space-y-2">
              {slaEvents.map((event) => (
                <div
                  key={event.id}
                  className={`flex items-center justify-between rounded-lg p-3 ${
                    event.eventType === 'breach'
                      ? 'bg-red-50 ring-1 ring-red-200'
                      : event.eventType === 'escalation'
                        ? 'bg-purple-50 ring-1 ring-purple-200'
                        : 'bg-yellow-50 ring-1 ring-yellow-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {event.eventType === 'breach' ? (
                      <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    )}
                    <div>
                      <p className={`text-sm font-medium ${
                        event.eventType === 'breach' ? 'text-red-800' : event.eventType === 'escalation' ? 'text-purple-800' : 'text-yellow-800'
                      }`}>
                        SLA {event.eventType.charAt(0).toUpperCase() + event.eventType.slice(1)}
                        {event.escalationLevel > 0 ? ` (Level ${event.escalationLevel})` : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        Threshold: {formatSlaTime(event.thresholdSeconds)} | Actual: {formatSlaTime(event.actualDurationSeconds)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form or completion result */}
        {isActive && formFields.length > 0 && (
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Complete Task</h2>
            <form onSubmit={handleComplete} className="mt-4 space-y-4">
              {formFields.map((field) => (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-gray-700">
                    {field.label}
                    {field.required && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  {renderField(field, formData[field.id], (v) => handleFieldChange(field.id, v))}
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <button type="submit" disabled={submitting} className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  {submitting ? 'Completing...' : 'Complete Task'}
                </button>
              </div>
            </form>
          </div>
        )}

        {isActive && formFields.length === 0 && (
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Complete Task</h2>
            <p className="mt-2 text-sm text-gray-500">This task has no form fields. Click to complete it.</p>
            <div className="mt-4 flex justify-end">
              <button onClick={handleComplete} disabled={submitting} className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                {submitting ? 'Completing...' : 'Complete Task'}
              </button>
            </div>
          </div>
        )}

        {isCompleted && task.completionResult && (
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Result</h2>
            <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-gray-50 p-4 text-xs">
              {JSON.stringify(task.completionResult, null, 2)}
            </pre>
          </div>
        )}

        {/* History */}
        {task.stateHistory && task.stateHistory.length > 0 && (
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">History</h2>
            <div className="mt-4 space-y-3">
              {task.stateHistory.map((entry) => (
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
          </div>
        )}
      </div>
    </div>
  );
}

function formatSlaTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function renderField(
  field: FormField,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  const baseClass = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          rows={3}
          className={baseClass}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
          required={field.required}
          className={baseClass}
        />
      );
    case 'boolean':
      return (
        <label className="mt-1 flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600"
          />
          <span className="text-sm text-gray-700">{field.label}</span>
        </label>
      );
    case 'date':
      return (
        <input
          type="date"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={baseClass}
        />
      );
    case 'datetime':
      return (
        <input
          type="datetime-local"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={baseClass}
        />
      );
    case 'select':
    case 'radio':
      if (field.type === 'select') {
        return (
          <select
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            className={baseClass}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      }
      return (
        <div className="mt-1 space-y-2">
          {field.options?.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2">
              <input
                type="radio"
                name={field.id}
                value={opt.value}
                checked={value === opt.value}
                onChange={(e) => onChange(e.target.value)}
                className="h-4 w-4 border-gray-300 text-primary-600"
              />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      );
    case 'multiselect':
      return (
        <select
          multiple
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
            onChange(selected);
          }}
          required={field.required}
          className={baseClass + ' h-24'}
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    default: // text
      return (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={baseClass}
        />
      );
  }
}
