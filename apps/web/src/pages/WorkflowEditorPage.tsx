import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { SlaDefinitionInput } from '@flowengine/shared';
import { PropertiesPanel } from '../components/workflow-editor/PropertiesPanel';

interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  version: number;
  status: string;
  bpmnXml: string;
  createdAt: string;
  updatedAt: string;
}

interface ValidationIssue {
  type: string;
  message: string;
  elementId?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: { activities: number; transitions: number; processId?: string };
}

export function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<any>(null);

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState('');

  // Import XML modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importXml, setImportXml] = useState('');
  const [importError, setImportError] = useState('');

  // Validation state
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  // Properties panel state
  const [selectedElement, setSelectedElement] = useState<{ id: string; name: string; type: string; laneName?: string } | null>(null);
  const [activityConfigs, setActivityConfigs] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [slaDefinitions, setSlaDefinitions] = useState<Map<string, SlaDefinitionInput>>(new Map());

  // Fetch workflow + configs + SLA definitions
  useEffect(() => {
    const fetchWorkflow = async () => {
      try {
        const [wfRes, configsRes, slasRes] = await Promise.all([
          api.get<{ success: boolean; data: WorkflowDetail }>(`/workflows/${id}`),
          api.get<{ success: boolean; data: { bpmnElementId: string; config: Record<string, unknown> }[] }>(`/workflows/${id}/activity-configs`),
          api.get<{ success: boolean; data: SlaDefinitionInput[] }>(`/workflows/${id}/sla-definitions`),
        ]);
        setWorkflow(wfRes.data.data);

        // Populate activity configs map
        const configMap = new Map<string, Record<string, unknown>>();
        for (const ac of configsRes.data.data) {
          if (ac.config && Object.keys(ac.config).length > 0) {
            configMap.set(ac.bpmnElementId, ac.config);
          }
        }
        setActivityConfigs(configMap);

        // Populate SLA definitions map
        const slaMap = new Map<string, SlaDefinitionInput>();
        for (const sla of slasRes.data.data) {
          slaMap.set(sla.bpmnElementId, sla);
        }
        setSlaDefinitions(slaMap);
      } catch {
        setError('Failed to load workflow');
      } finally {
        setLoading(false);
      }
    };
    fetchWorkflow();
  }, [id]);

  // Initialize BPMN modeler
  useEffect(() => {
    if (!workflow || !containerRef.current) return;

    let modeler: any = null;

    const initModeler = async () => {
      const { default: BpmnModeler } = await import('bpmn-js/lib/Modeler');

      modeler = new BpmnModeler({
        container: containerRef.current!,
        keyboard: { bindTo: document },
      });

      modelerRef.current = modeler;

      try {
        await modeler.importXML(workflow.bpmnXml);
        const canvas = modeler.get('canvas');
        canvas.zoom('fit-viewport');
      } catch (err: unknown) {
        console.error('Failed to render BPMN:', err);
        setError('Failed to render BPMN diagram');
      }

      // Track changes
      modeler.on('commandStack.changed', () => {
        setHasChanges(true);
      });

      // Detect the lane an element belongs to by walking up the parent hierarchy
      const getLaneName = (el: any): string | undefined => {
        let current = el?.parent;
        while (current) {
          if (current.type === 'bpmn:Lane') {
            return current.businessObject?.name || current.id;
          }
          current = current.parent;
        }
        return undefined;
      };

      // Track element selection for properties panel
      const eventBus = modeler.get('eventBus');
      eventBus.on('selection.changed', (e: any) => {
        const el = e.newSelection?.[0];
        if (el && el.type !== 'bpmn:Process' && el.type !== 'label') {
          setSelectedElement({
            id: el.id,
            name: el.businessObject?.name || el.id,
            type: el.type,
            laneName: getLaneName(el),
          });
        } else {
          setSelectedElement(null);
        }
      });

      // Re-detect lane when elements are moved between lanes
      eventBus.on('shape.changed', (e: any) => {
        setSelectedElement((prev) => {
          if (prev && e.element?.id === prev.id) {
            const newLane = getLaneName(e.element);
            if (newLane !== prev.laneName) {
              return { ...prev, laneName: newLane };
            }
          }
          return prev;
        });
      });
    };

    initModeler();

    return () => {
      if (modeler) {
        modeler.destroy();
      }
    };
  }, [workflow]);

  // Run validation and return the result
  const runValidation = useCallback(async (xml: string): Promise<ValidationResult | null> => {
    try {
      const { data } = await api.post<{ success: boolean; data: ValidationResult }>(
        '/workflows/validate',
        { bpmnXml: xml },
      );
      return data.data;
    } catch {
      return null;
    }
  }, []);

  // Build configs array with lane-derived candidateGroup merged in
  const buildActivityConfigsWithLanes = useCallback((): { bpmnElementId: string; config: Record<string, unknown> }[] => {
    const merged = new Map(activityConfigs);

    if (modelerRef.current) {
      try {
        const elementRegistry = modelerRef.current.get('elementRegistry');
        const elements = elementRegistry.getAll();

        const getLaneName = (el: any): string | undefined => {
          let current = el?.parent;
          while (current) {
            if (current.type === 'bpmn:Lane') {
              return current.businessObject?.name || current.id;
            }
            current = current.parent;
          }
          return undefined;
        };

        for (const el of elements) {
          if (el.type === 'bpmn:UserTask' || el.type === 'bpmn:ManualTask') {
            const laneName = getLaneName(el);
            if (laneName) {
              const existing = merged.get(el.id) || {};
              // Only auto-set if user hasn't explicitly set a candidateGroup
              if (!existing.candidateGroup) {
                merged.set(el.id, { ...existing, candidateGroup: laneName });
              }
            }
          }
        }
      } catch {
        // Silently fail — lane detection is best-effort
      }
    }

    return Array.from(merged.entries()).map(
      ([bpmnElementId, config]) => ({ bpmnElementId, config }),
    );
  }, [activityConfigs]);

  const handleSave = useCallback(async () => {
    if (!modelerRef.current || !workflow) return;

    setSaving(true);
    setError('');

    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });

      // Validate on save — show results but still save
      const vResult = await runValidation(xml);
      if (vResult) {
        setValidationResult(vResult);
        setShowValidation(true);
      }

      // Build activity configs (with lane-derived candidateGroup) and SLA definitions
      const activityConfigsArray = buildActivityConfigsWithLanes();
      const slaDefinitionsArray = Array.from(slaDefinitions.entries())
        .filter(([ , sla]) => sla.breachThresholdSeconds > 0)
        .map(([bpmnElementId, sla]) => ({ ...sla, bpmnElementId }));

      await api.put(`/workflows/${workflow.id}`, {
        bpmnXml: xml,
        activityConfigs: activityConfigsArray,
        slaDefinitions: slaDefinitionsArray,
      });
      setHasChanges(false);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  }, [workflow, runValidation, buildActivityConfigsWithLanes, slaDefinitions]);

  const handlePublish = useCallback(async () => {
    if (!modelerRef.current || !workflow) return;

    setPublishing(true);
    setError('');

    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });

      // Validate before publish — block if errors exist
      const vResult = await runValidation(xml);
      if (vResult) {
        setValidationResult(vResult);
        setShowValidation(true);

        if (!vResult.valid) {
          setError('Cannot publish: fix validation errors first');
          setPublishing(false);
          return;
        }
      }

      // Save first if there are unsaved changes
      if (hasChanges) {
        const activityConfigsArray = buildActivityConfigsWithLanes();
        const slaDefinitionsArray = Array.from(slaDefinitions.entries())
          .filter(([ , sla]) => sla.breachThresholdSeconds > 0)
          .map(([bpmnElementId, sla]) => ({ ...sla, bpmnElementId }));

        await api.put(`/workflows/${workflow.id}`, {
          bpmnXml: xml,
          activityConfigs: activityConfigsArray,
          slaDefinitions: slaDefinitionsArray,
        });
      }

      await api.post(`/workflows/${workflow.id}/publish`);
      setWorkflow({ ...workflow, status: 'published' });
      setHasChanges(false);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to publish workflow');
    } finally {
      setPublishing(false);
    }
  }, [workflow, hasChanges, runValidation]);

  const handleExport = useCallback(async () => {
    if (!modelerRef.current) return;
    const { xml } = await modelerRef.current.saveXML({ format: true });
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow?.name || 'workflow'}.bpmn`;
    a.click();
    URL.revokeObjectURL(url);
  }, [workflow]);

  const handleNewVersion = useCallback(async () => {
    if (!workflow) return;
    try {
      const { data } = await api.post<{ success: boolean; data: WorkflowDetail }>(
        `/workflows/${workflow.id}/new-version`,
      );
      navigate(`/workflows/${data.data.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to create new version');
    }
  }, [workflow, navigate]);

  const handleDelete = useCallback(async () => {
    if (!workflow) return;
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await api.delete(`/workflows/${workflow.id}`);
      navigate('/workflows');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to delete workflow');
    }
  }, [workflow, navigate]);

  const handleDeactivate = useCallback(async () => {
    if (!workflow) return;
    if (!confirm('Deactivate this workflow? Running instances will continue but no new instances can be started.')) return;
    try {
      await api.post(`/workflows/${workflow.id}/deprecate`);
      setWorkflow({ ...workflow, status: 'deprecated' });
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to deactivate workflow');
    }
  }, [workflow]);

  // Import XML from textarea
  const handleImportXml = useCallback(async () => {
    if (!modelerRef.current || !importXml.trim()) return;

    setImportError('');

    try {
      await modelerRef.current.importXML(importXml.trim());
      const canvas = modelerRef.current.get('canvas');
      canvas.zoom('fit-viewport');
      setHasChanges(true);
      setShowImportModal(false);
      setImportXml('');
    } catch (err: any) {
      setImportError(err?.message || 'Failed to parse BPMN XML. Please check the format.');
    }
  }, [importXml]);

  // Import from file
  const handleImportFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bpmn,.xml';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      setImportXml(text);
    };
    input.click();
  }, []);

  // Manual validate button
  const handleValidate = useCallback(async () => {
    if (!modelerRef.current) return;

    setValidating(true);
    setError('');

    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      const vResult = await runValidation(xml);
      if (vResult) {
        setValidationResult(vResult);
        setShowValidation(true);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  }, [runValidation]);

  // Click on a validation issue to highlight the element
  const handleIssueClick = useCallback((elementId?: string) => {
    if (!elementId || !modelerRef.current) return;
    try {
      const canvas = modelerRef.current.get('canvas');
      const elementRegistry = modelerRef.current.get('elementRegistry');
      const selection = modelerRef.current.get('selection');
      const element = elementRegistry.get(elementId);
      if (element) {
        selection.select(element);
        canvas.scrollToElement(element);
      }
    } catch {
      // Element may not exist in the diagram
    }
  }, []);

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-gray-500">Workflow not found</p>
        <button onClick={() => navigate('/workflows')} className="mt-4 text-primary-600 hover:text-primary-700">
          Back to workflows
        </button>
      </div>
    );
  }

  const isDraft = workflow.status === 'draft';
  const isReadOnly = !isDraft;

  return (
    <div className="flex h-full flex-col -m-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workflows')}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">
              {workflow.name}
              <span className="ml-2 text-xs font-normal text-gray-400">v{workflow.version}</span>
            </h1>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            workflow.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
            workflow.status === 'published' ? 'bg-green-100 text-green-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {workflow.status}
          </span>
          {hasChanges && (
            <span className="text-xs text-orange-500">Unsaved changes</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              <button
                onClick={() => {
                  setImportXml('');
                  setImportError('');
                  setShowImportModal(true);
                }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                title="Import BPMN XML"
              >
                Import XML
              </button>
              <button
                onClick={handleValidate}
                disabled={validating}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {validating ? 'Validating...' : 'Validate'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </>
          )}
          {isReadOnly && (
            <>
              <button
                onClick={handleValidate}
                disabled={validating}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {validating ? 'Validating...' : 'Validate'}
              </button>
              <button
                onClick={handleNewVersion}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                New Version
              </button>
              {workflow.status === 'published' && (
                <button
                  onClick={handleDeactivate}
                  className="rounded-lg border border-orange-300 px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50"
                >
                  Deactivate
                </button>
              )}
              {workflow.status !== 'published' && (
                <button
                  onClick={handleDelete}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              )}
            </>
          )}
          <button
            onClick={handleExport}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-medium underline">Dismiss</button>
        </div>
      )}

      {/* Main area: Canvas + Properties Panel */}
      <div className="flex flex-1" style={{ minHeight: 0 }}>
        {/* BPMN Canvas */}
        <div
          ref={containerRef}
          className="flex-1 bg-white"
        />

        {/* Properties Panel */}
        {selectedElement && (
          <div className="w-80 shrink-0 border-l border-gray-200 bg-white overflow-hidden">
            <PropertiesPanel
              selectedElement={selectedElement}
              laneName={selectedElement?.laneName}
              activityConfigs={activityConfigs}
              slaDefinitions={slaDefinitions}
              onConfigChange={(bpmnElementId, config) => {
                setActivityConfigs((prev) => {
                  const next = new Map(prev);
                  next.set(bpmnElementId, config);
                  return next;
                });
                setHasChanges(true);
              }}
              onSlaChange={(bpmnElementId, sla) => {
                setSlaDefinitions((prev) => {
                  const next = new Map(prev);
                  if (sla) {
                    next.set(bpmnElementId, sla);
                  } else {
                    next.delete(bpmnElementId);
                  }
                  return next;
                });
                setHasChanges(true);
              }}
              isDraft={isDraft}
            />
          </div>
        )}
      </div>

      {/* Validation Results Panel */}
      {showValidation && validationResult && (
        <ValidationPanel
          result={validationResult}
          onClose={() => setShowValidation(false)}
          onIssueClick={handleIssueClick}
        />
      )}

      {/* Import XML Modal */}
      {showImportModal && (
        <ImportXmlModal
          xml={importXml}
          onXmlChange={setImportXml}
          error={importError}
          onImport={handleImportXml}
          onFileImport={handleImportFile}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}

// --- Validation Panel ---

function ValidationPanel({
  result,
  onClose,
  onIssueClick,
}: {
  result: ValidationResult;
  onClose: () => void;
  onIssueClick: (elementId?: string) => void;
}) {
  const totalIssues = result.errors.length + result.warnings.length;

  return (
    <div className="border-t border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Validation Results</h3>
          {result.valid ? (
            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Valid
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Invalid
            </span>
          )}
          <span className="text-xs text-gray-500">
            {result.stats.activities} activities, {result.stats.transitions} transitions
          </span>
        </div>
        <div className="flex items-center gap-3">
          {result.errors.length > 0 && (
            <span className="text-xs font-medium text-red-600">{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}</span>
          )}
          {result.warnings.length > 0 && (
            <span className="text-xs font-medium text-yellow-600">{result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}</span>
          )}
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {totalIssues === 0 ? (
        <div className="px-4 py-3 text-sm text-green-700">
          No issues found. The diagram is valid and ready to publish.
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {result.errors.map((issue, i) => (
            <button
              key={`e-${i}`}
              onClick={() => onIssueClick(issue.elementId)}
              className="flex w-full items-start gap-2 px-4 py-2 text-left text-sm hover:bg-red-50"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-red-800">{issue.message}</span>
            </button>
          ))}
          {result.warnings.map((issue, i) => (
            <button
              key={`w-${i}`}
              onClick={() => onIssueClick(issue.elementId)}
              className="flex w-full items-start gap-2 px-4 py-2 text-left text-sm hover:bg-yellow-50"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-yellow-800">{issue.message}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Import XML Modal ---

function ImportXmlModal({
  xml,
  onXmlChange,
  error,
  onImport,
  onFileImport,
  onClose,
}: {
  xml: string;
  onXmlChange: (xml: string) => void;
  error: string;
  onImport: () => void;
  onFileImport: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Import BPMN XML</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <p className="mb-3 text-sm text-gray-600">
            Paste BPMN XML below or upload a .bpmn file. This will replace the current diagram.
          </p>

          <textarea
            value={xml}
            onChange={(e) => onXmlChange(e.target.value)}
            placeholder={'<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions ...>\n  ...\n</bpmn:definitions>'}
            className="h-64 w-full rounded-lg border border-gray-300 p-3 font-mono text-xs text-gray-800 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            spellCheck={false}
          />

          {error && (
            <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <button
            onClick={onFileImport}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Upload .bpmn file
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onImport}
              disabled={!xml.trim()}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
