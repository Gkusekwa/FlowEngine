import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', 'current'],
    queryFn: async () => {
      const { data } = await api.get('/tenants/current');
      return data.data;
    },
  });

  const [name, setName] = useState('');

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
    }
  }, [tenant]);

  const updateMutation = useMutation({
    mutationFn: async (newName: string) => {
      const { data } = await api.put('/tenants/current', { name: newName });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'current'] });
    },
  });

  if (isLoading) {
    return <div className="animate-pulse text-gray-500">Loading settings...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Tenant Settings</h1>
      <p className="mt-1 text-gray-600">Manage your organization settings</p>

      <div className="mt-8 max-w-lg rounded-xl border border-gray-200 bg-white p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Organization Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Slug</label>
            <input
              type="text"
              value={tenant?.slug || ''}
              disabled
              className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Plan</label>
            <input
              type="text"
              value={tenant?.subscriptionPlan || ''}
              disabled
              className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Max Users</label>
              <input
                type="text"
                value={tenant?.maxUsers || ''}
                disabled
                className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Max Workflows</label>
              <input
                type="text"
                value={tenant?.maxWorkflows || ''}
                disabled
                className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
          </div>
        </div>

        <button
          onClick={() => updateMutation.mutate(name)}
          disabled={updateMutation.isPending || name === tenant?.name}
          className="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>

        {updateMutation.isSuccess && (
          <p className="mt-2 text-sm text-green-600">Settings saved successfully</p>
        )}
      </div>
    </div>
  );
}
