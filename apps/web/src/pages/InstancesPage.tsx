import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface WorkflowInstance {
  id: string;
  workflowDefinitionId: string;
  status: string;
  variables: Record<string, unknown>;
  startedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  correlationId: string | null;
  createdAt: string;
  workflowDefinition?: {
    name: string;
    version: number;
  };
}

interface WorkflowSummary {
  id: string;
  name: string;
  version: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  created: 'bg-blue-100 text-blue-800',
  running: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  failed: 'bg-red-100 text-red-800',
  suspended: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-orange-100 text-orange-800',
};

export function InstancesPage() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showStartModal, setShowStartModal] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [startVariables, setStartVariables] = useState('{}');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  const fetchInstances = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/instances?${params}`);
      setInstances(data.data.items);
      setTotal(data.data.total);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  const fetchPublishedWorkflows = async () => {
    try {
      const { data } = await api.get('/workflows?status=published&pageSize=100');
      setWorkflows(data.data.items);
    } catch {
      // handled
    }
  };

  useEffect(() => { fetchInstances(); }, [page, statusFilter]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setStartError('');
    let variables: Record<string, unknown> = {};
    try {
      variables = JSON.parse(startVariables);
    } catch {
      setStartError('Invalid JSON for variables');
      return;
    }

    setStarting(true);
    try {
      const { data } = await api.post('/instances', {
        workflowDefinitionId: selectedWorkflowId,
        variables,
      });
      setShowStartModal(false);
      setStartVariables('{}');
      setSelectedWorkflowId('');
      navigate(`/instances/${data.data.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start instance';
      setStartError(msg);
    } finally {
      setStarting(false);
    }
  };

  const openStartModal = () => {
    fetchPublishedWorkflows();
    setShowStartModal(true);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Instances</h1>
          <p className="mt-1 text-sm text-gray-500">{total} instance(s)</p>
        </div>
        <button
          onClick={openStartModal}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
        >
          Start New Instance
        </button>
      </div>

      {/* Status filter */}
      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="created">Created</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Instance list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      ) : instances.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
          <p className="text-sm text-gray-500">No instances yet</p>
          <button onClick={openStartModal} className="mt-4 text-sm font-medium text-primary-600 hover:text-primary-700">
            Start your first workflow instance
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Workflow</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Started</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Completed</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {instances.map((inst) => (
                <tr key={inst.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/instances/${inst.id}`)}>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">
                      {inst.workflowDefinition?.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-500">
                      v{inst.workflowDefinition?.version || '?'} &middot; {inst.id.slice(0, 8)}...
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[inst.status] || 'bg-gray-100 text-gray-800'}`}>
                      {inst.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {inst.startedAt ? new Date(inst.startedAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {inst.completedAt ? new Date(inst.completedAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="mt-4 flex items-center justify-between">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">Previous</button>
          <span className="text-sm text-gray-500">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={instances.length < 20} className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">Next</button>
        </div>
      )}

      {/* Start instance modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Start Workflow Instance</h2>
            <form onSubmit={handleStart} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Workflow</label>
                <select
                  value={selectedWorkflowId}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select a published workflow...</option>
                  {workflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>{wf.name} (v{wf.version})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Variables (JSON)</label>
                <textarea
                  value={startVariables}
                  onChange={(e) => setStartVariables(e.target.value)}
                  rows={4}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              {startError && <p className="text-sm text-red-600">{startError}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowStartModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={starting || !selectedWorkflowId} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  {starting ? 'Starting...' : 'Start'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
