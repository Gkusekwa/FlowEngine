import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface InviteCode {
  id: string;
  code: string;
  maxUses: number;
  useCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface JoinRequest {
  id: string;
  email: string;
  name: string;
  status: string;
  inviteCode: string;
  createdAt: string;
  reviewedAt: string | null;
}

export function AdminPage() {
  const [tab, setTab] = useState<'codes' | 'requests'>('codes');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="mt-1 text-sm text-gray-600">Manage invite codes and join requests</p>
      </div>

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setTab('codes')}
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              tab === 'codes'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Invite Codes
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              tab === 'requests'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Join Requests
          </button>
        </nav>
      </div>

      {tab === 'codes' ? <InviteCodesTab /> : <JoinRequestsTab />}
    </div>
  );
}

function InviteCodesTab() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [maxUses, setMaxUses] = useState(0);
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [error, setError] = useState('');

  const loadCodes = useCallback(async () => {
    try {
      const { data } = await api.get<{ success: boolean; data: InviteCode[] }>(
        '/tenants/current/invite-codes',
      );
      setCodes(data.data);
    } catch {
      setError('Failed to load invite codes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');
    try {
      await api.post('/tenants/current/invite-codes', {
        maxUses: maxUses || 0,
        expiresInDays: expiresInDays || null,
      });
      setShowForm(false);
      setMaxUses(0);
      setExpiresInDays('');
      await loadCodes();
    } catch {
      setError('Failed to generate invite code');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevoke = async (codeId: string) => {
    try {
      await api.post(`/tenants/current/invite-codes/${codeId}/revoke`);
      await loadCodes();
    } catch {
      setError('Failed to revoke invite code');
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  if (isLoading) {
    return <div className="text-center text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Invite Codes</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Generate Code
        </button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Max Uses (0 = unlimited)
              </label>
              <input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(parseInt(e.target.value) || 0)}
                min={0}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Expires in (days, empty = never)
              </label>
              <input
                type="number"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value) : '')}
                min={1}
                placeholder="No expiration"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {codes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">No invite codes yet. Generate one to let users join your organization.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Uses</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Expires</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {codes.map((code) => {
                const isExpired = code.expiresAt && new Date(code.expiresAt) < new Date();
                const isExhausted = code.maxUses > 0 && code.useCount >= code.maxUses;
                const status = !code.isActive
                  ? 'Revoked'
                  : isExpired
                    ? 'Expired'
                    : isExhausted
                      ? 'Exhausted'
                      : 'Active';
                const statusColor = status === 'Active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800';

                return (
                  <tr key={code.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-gray-100 px-2 py-0.5 text-sm font-mono">
                          {code.code}
                        </code>
                        <button
                          onClick={() => copyToClipboard(code.code)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Copy to clipboard"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {code.useCount}{code.maxUses > 0 ? ` / ${code.maxUses}` : ' / unlimited'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {code.expiresAt
                        ? new Date(code.expiresAt).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {code.isActive && !isExpired && (
                        <button
                          onClick={() => handleRevoke(code.id)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function JoinRequestsTab() {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRequests = useCallback(async () => {
    try {
      const { data } = await api.get<{ success: boolean; data: JoinRequest[] }>(
        '/tenants/current/join-requests',
      );
      setRequests(data.data);
    } catch {
      setError('Failed to load join requests');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApprove = async (requestId: string) => {
    try {
      await api.post(`/tenants/current/join-requests/${requestId}/approve`);
      await loadRequests();
    } catch {
      setError('Failed to approve request');
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await api.post(`/tenants/current/join-requests/${requestId}/reject`);
      await loadRequests();
    } catch {
      setError('Failed to reject request');
    }
  };

  if (isLoading) {
    return <div className="text-center text-sm text-gray-500">Loading...</div>;
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const processedRequests = requests.filter((r) => r.status !== 'pending');

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <h2 className="mb-4 text-lg font-medium text-gray-900">
        Pending Requests ({pendingRequests.length})
      </h2>

      {pendingRequests.length === 0 ? (
        <div className="mb-8 rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">No pending join requests</p>
        </div>
      ) : (
        <div className="mb-8 space-y-3">
          {pendingRequests.map((req) => (
            <div
              key={req.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-gray-900">{req.name}</p>
                <p className="text-sm text-gray-500">{req.email}</p>
                <p className="mt-1 text-xs text-gray-400">
                  Requested {new Date(req.createdAt).toLocaleDateString()} via code {req.inviteCode}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(req.id)}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(req.id)}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {processedRequests.length > 0 && (
        <>
          <h2 className="mb-4 text-lg font-medium text-gray-900">History</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {processedRequests.map((req) => (
                  <tr key={req.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{req.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{req.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          req.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {req.reviewedAt ? new Date(req.reviewedAt).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
