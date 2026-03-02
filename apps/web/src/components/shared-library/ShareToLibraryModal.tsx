import { useState } from 'react';
import { api } from '../../services/api';

interface Props {
  workflowDefinitionId: string;
  workflowName: string;
  onClose: () => void;
  onShared: () => void;
}

export function ShareToLibraryModal({ workflowDefinitionId, workflowName, onClose, onShared }: Props) {
  const [category, setCategory] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await api.post('/shared-library', {
        workflowDefinitionId,
        category: category || undefined,
        tags: tags.length > 0 ? tags : undefined,
        description: description || undefined,
      });

      onShared();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to share workflow');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">Share to Library</h2>
        <p className="mt-1 text-sm text-gray-500">
          Share <span className="font-medium">{workflowName}</span> so other teams can use it
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Category <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. HR, Finance, IT"
              maxLength={100}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Tags <span className="text-gray-400">(comma separated)</span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. approval, onboarding, review"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this workflow does..."
              rows={3}
              maxLength={2000}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Sharing...' : 'Share'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
