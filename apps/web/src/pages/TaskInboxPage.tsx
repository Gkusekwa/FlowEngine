import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface TaskItem {
  id: string;
  status: string;
  assignedTo: string | null;
  assignedGroup: string | null;
  createdAt: string;
  startedAt: string | null;
  activityDefinition?: {
    name: string | null;
    bpmnElementId: string;
    type: string;
  };
  workflowInstance?: {
    id: string;
    workflowDefinition?: {
      name: string;
      version: number;
    };
  };
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-gray-100 text-gray-800',
  failed: 'bg-red-100 text-red-800',
};

export function TaskInboxPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      const { data } = await api.get(`/tasks/inbox?${params}`);
      setTasks(data.data.items);
      setTotal(data.data.total);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); }, [page]);

  const handleClaim = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setClaiming(taskId);
    try {
      await api.post(`/tasks/${taskId}/claim`);
      await fetchTasks();
    } catch {
      // handled
    } finally {
      setClaiming(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Task Inbox</h1>
        <p className="mt-1 text-sm text-gray-500">{total} task(s) available</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p className="mt-4 text-sm text-gray-500">No tasks in your inbox</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Task</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Workflow</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Created</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tasks.map((task) => (
                <tr key={task.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/tasks/${task.id}`)}>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">
                      {task.activityDefinition?.name || task.activityDefinition?.bpmnElementId || 'Task'}
                    </p>
                    <p className="text-xs text-gray-500">{task.id.slice(0, 8)}...</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {task.workflowInstance?.workflowDefinition?.name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-800'}`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(task.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {task.status === 'pending' && !task.assignedTo && (
                      <button
                        onClick={(e) => handleClaim(task.id, e)}
                        disabled={claiming === task.id}
                        className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {claiming === task.id ? 'Claiming...' : 'Claim'}
                      </button>
                    )}
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
          <button onClick={() => setPage((p) => p + 1)} disabled={tasks.length < 20} className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
