import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';

interface SharedWorkflowDetail {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags: string[];
  sourceTenantName: string;
  sharedByUserName: string;
  sourceVersion: number;
  importCount: number;
  bpmnXml: string;
  activityConfigs: { bpmnElementId: string; type: string; name: string; config: Record<string, unknown> }[];
  slaConfigs: { bpmnElementId: string; breachThresholdSeconds: number }[];
  createdAt: string;
}

interface Props {
  sharedWorkflowId: string;
  onClose: () => void;
  onImported: (workflowId: string, mode: 'use' | 'customize') => void;
}

export function SharedWorkflowPreviewModal({ sharedWorkflowId, onClose, onImported }: Props) {
  const [detail, setDetail] = useState<SharedWorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<'use' | 'customize' | null>(null);
  const [error, setError] = useState('');
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstanceRef = useRef<any>(null);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const { data } = await api.get<{ success: boolean; data: SharedWorkflowDetail }>(
          `/shared-library/${sharedWorkflowId}`,
        );
        setDetail(data.data);
      } catch {
        setError('Failed to load workflow details');
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [sharedWorkflowId]);

  // Initialize BPMN viewer when detail is loaded
  useEffect(() => {
    if (!detail?.bpmnXml || !viewerRef.current) return;

    let viewer: any = null;
    const initViewer = async () => {
      try {
        const BpmnViewer = (await import('bpmn-js/lib/NavigatedViewer')).default;
        viewer = new BpmnViewer({ container: viewerRef.current! });
        viewerInstanceRef.current = viewer;
        await viewer.importXML(detail.bpmnXml);
        const canvas = viewer.get('canvas');
        canvas.zoom('fit-viewport');
      } catch {
        // viewer init failed silently
      }
    };
    initViewer();

    return () => {
      if (viewer) {
        try { viewer.destroy(); } catch { /* noop */ }
      }
    };
  }, [detail?.bpmnXml]);

  const handleImport = async (mode: 'use' | 'customize') => {
    setImporting(mode);
    setError('');
    try {
      const { data } = await api.post<{ success: boolean; data: { id: string } }>(
        `/shared-library/${sharedWorkflowId}/import`,
        { mode },
      );
      onImported(data.data.id, mode);
    } catch {
      setError('Failed to import workflow');
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {loading ? 'Loading...' : detail?.name || 'Preview'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {/* BPMN Viewer */}
              <div
                ref={viewerRef}
                className="h-64 w-full rounded-lg border border-gray-200 bg-gray-50"
              />

              {/* Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-500">Shared by</span>
                  <p className="text-gray-900">{detail.sourceTenantName}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500">Author</span>
                  <p className="text-gray-900">{detail.sharedByUserName}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500">Version</span>
                  <p className="text-gray-900">v{detail.sourceVersion}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500">Imports</span>
                  <p className="text-gray-900">{detail.importCount}</p>
                </div>
              </div>

              {detail.description && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Description</span>
                  <p className="mt-1 text-sm text-gray-700">{detail.description}</p>
                </div>
              )}

              {/* Tags & Category */}
              <div className="flex flex-wrap gap-2">
                {detail.category && (
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                    {detail.category}
                  </span>
                )}
                {detail.tags.map((t) => (
                  <span key={t} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    {t}
                  </span>
                ))}
              </div>

              {/* Activities summary */}
              <div>
                <span className="text-sm font-medium text-gray-500">
                  Activities ({detail.activityConfigs.length})
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {detail.activityConfigs
                    .filter((a) => a.name)
                    .map((a) => (
                      <span
                        key={a.bpmnElementId}
                        className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600"
                      >
                        {a.name}
                      </span>
                    ))}
                </div>
              </div>

              {detail.slaConfigs.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500">
                    SLA definitions ({detail.slaConfigs.length})
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-500">Failed to load details</p>
          )}
        </div>

        {/* Footer */}
        {detail && (
          <div className="border-t px-6 py-4">
            {error && (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleImport('customize')}
                disabled={importing !== null}
                className="rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
              >
                {importing === 'customize' ? 'Importing...' : 'Customize'}
              </button>
              <button
                onClick={() => handleImport('use')}
                disabled={importing !== null}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {importing === 'use' ? 'Importing...' : 'Use as-is'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
