import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { SharedWorkflowPreviewModal } from '../components/shared-library/SharedWorkflowPreviewModal';

interface SharedWorkflowSummary {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags: string[];
  sourceTenantName: string;
  sharedByUserName: string;
  sourceVersion: number;
  importCount: number;
  createdAt: string;
}

interface BrowseResponse {
  items: SharedWorkflowSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function SharedLibraryPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<SharedWorkflowSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'name'>('newest');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [popularTags, setPopularTags] = useState<{ tag: string; count: number }[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '12',
        sortBy,
      });
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (tag) params.set('tag', tag);

      const { data } = await api.get<{ success: boolean; data: BrowseResponse }>(
        `/shared-library?${params}`,
      );
      setWorkflows(data.data.items);
      setTotal(data.data.total);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, search, category, tag, sortBy]);

  const fetchFilters = useCallback(async () => {
    try {
      const [catRes, tagRes] = await Promise.all([
        api.get<{ success: boolean; data: string[] }>('/shared-library/categories'),
        api.get<{ success: boolean; data: { tag: string; count: number }[] }>('/shared-library/tags'),
      ]);
      setCategories(catRes.data.data);
      setPopularTags(tagRes.data.data);
    } catch {
      // handled
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchWorkflows();
  };

  const handleImported = (workflowId: string, mode: 'use' | 'customize') => {
    setPreviewId(null);
    if (mode === 'customize') {
      navigate(`/workflows/${workflowId}`);
    } else {
      navigate('/instances');
    }
  };

  const totalPages = Math.ceil(total / 12);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Shared Library</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse and import workflows shared by other teams
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex-1">
          <input
            type="text"
            placeholder="Search workflows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </form>

        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value as 'newest' | 'popular' | 'name'); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="newest">Newest first</option>
          <option value="popular">Most popular</option>
          <option value="name">Name A-Z</option>
        </select>
      </div>

      {/* Tags */}
      {popularTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tag && (
            <button
              onClick={() => { setTag(''); setPage(1); }}
              className="rounded-full bg-primary-100 px-3 py-1 text-xs font-medium text-primary-700"
            >
              {tag} x
            </button>
          )}
          {popularTags
            .filter((t) => t.tag !== tag)
            .slice(0, 10)
            .map((t) => (
              <button
                key={t.tag}
                onClick={() => { setTag(t.tag); setPage(1); }}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
              >
                {t.tag} ({t.count})
              </button>
            ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm text-gray-500">No shared workflows found</p>
          <p className="mt-1 text-xs text-gray-400">
            {search || category || tag
              ? 'Try adjusting your filters'
              : 'No workflows have been shared to the library yet'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                onClick={() => setPreviewId(wf.id)}
                className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-gray-900 line-clamp-1">{wf.name}</h3>
                  <span className="ml-2 shrink-0 text-xs text-gray-400">v{wf.sourceVersion}</span>
                </div>
                {wf.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{wf.description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  {wf.category && (
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                      {wf.category}
                    </span>
                  )}
                  {wf.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>by {wf.sourceTenantName}</span>
                  <span>{wf.importCount} imports</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * 12 + 1}-{Math.min(page * 12, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Preview Modal */}
      {previewId && (
        <SharedWorkflowPreviewModal
          sharedWorkflowId={previewId}
          onClose={() => setPreviewId(null)}
          onImported={handleImported}
        />
      )}
    </div>
  );
}
