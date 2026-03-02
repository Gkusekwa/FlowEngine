import type { FormFieldDefinition, SlaDefinitionInput } from '@flowengine/shared';
import { FormFieldEditor } from './FormFieldEditor';

interface SelectedElement {
  id: string;
  name: string;
  type: string;
  laneName?: string;
}

interface PropertiesPanelProps {
  selectedElement: SelectedElement | null;
  laneName?: string;
  activityConfigs: Map<string, Record<string, unknown>>;
  slaDefinitions: Map<string, SlaDefinitionInput>;
  onConfigChange: (bpmnElementId: string, config: Record<string, unknown>) => void;
  onSlaChange: (bpmnElementId: string, sla: SlaDefinitionInput | null) => void;
  isDraft: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  'bpmn:UserTask': 'User Task',
  'bpmn:ServiceTask': 'Service Task',
  'bpmn:StartEvent': 'Start Event',
  'bpmn:EndEvent': 'End Event',
  'bpmn:ExclusiveGateway': 'Exclusive Gateway',
  'bpmn:ParallelGateway': 'Parallel Gateway',
  'bpmn:InclusiveGateway': 'Inclusive Gateway',
  'bpmn:SequenceFlow': 'Sequence Flow',
  'bpmn:Lane': 'Lane',
  'bpmn:Participant': 'Pool',
};

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 px-4 py-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      {children}
    </div>
  );
}

export function PropertiesPanel({
  selectedElement,
  laneName,
  activityConfigs,
  slaDefinitions,
  onConfigChange,
  onSlaChange,
  isDraft,
}: PropertiesPanelProps) {
  if (!selectedElement) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-sm text-gray-400">
          Select an element on the canvas to configure its properties
        </p>
      </div>
    );
  }

  const config = activityConfigs.get(selectedElement.id) || {};
  const sla = slaDefinitions.get(selectedElement.id);
  const disabled = !isDraft;
  const isUserTask = selectedElement.type === 'bpmn:UserTask';
  const isServiceTask = selectedElement.type === 'bpmn:ServiceTask';
  const isTask = isUserTask || isServiceTask;

  const updateConfig = (key: string, value: unknown) => {
    onConfigChange(selectedElement.id, { ...config, [key]: value });
  };

  const updateSla = (field: string, value: unknown) => {
    const current = sla || {
      bpmnElementId: selectedElement.id,
      warningThresholdSeconds: null,
      breachThresholdSeconds: 0,
    };
    onSlaChange(selectedElement.id, { ...current, [field]: value });
  };

  // Convert seconds to minutes for display
  const warningMinutes = sla?.warningThresholdSeconds != null ? sla.warningThresholdSeconds / 60 : '';
  const breachMinutes = sla?.breachThresholdSeconds ? sla.breachThresholdSeconds / 60 : '';

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-500">{TYPE_LABELS[selectedElement.type] || selectedElement.type}</p>
        <h3 className="mt-0.5 truncate text-sm font-semibold text-gray-900">
          {selectedElement.name || selectedElement.id}
        </h3>
      </div>

      {/* UserTask: Assignment */}
      {isUserTask && (
        <Section title="Assignment">
          <div className="space-y-3">
            {laneName && (
              <div className="rounded-md bg-blue-50 px-3 py-2">
                <p className="text-xs font-medium text-blue-700">
                  Lane: {laneName}
                </p>
                <p className="mt-0.5 text-[10px] text-blue-600">
                  Candidate group auto-set from swim lane
                </p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-gray-600">Assignee</label>
              <input
                type="text"
                value={(config.assignee as string) || ''}
                onChange={(e) => updateConfig('assignee', e.target.value || undefined)}
                disabled={disabled}
                placeholder="User ID or email"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              />
              <p className="mt-1 text-[10px] text-gray-400">Leave empty for group-based assignment</p>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs text-gray-600">
                Candidate Group
                {laneName && !(config.candidateGroup as string) && (
                  <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-medium text-blue-700">
                    from lane
                  </span>
                )}
              </label>
              <input
                type="text"
                value={(config.candidateGroup as string) || ''}
                onChange={(e) => updateConfig('candidateGroup', e.target.value || undefined)}
                disabled={disabled}
                placeholder={laneName ? `${laneName} (from lane)` : 'e.g. managers'}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              />
              {laneName && (config.candidateGroup as string) && (config.candidateGroup as string) !== laneName && !disabled && (
                <button
                  onClick={() => updateConfig('candidateGroup', undefined)}
                  className="mt-1 text-[10px] text-blue-600 hover:text-blue-800"
                >
                  Reset to lane default ({laneName})
                </button>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* UserTask: Form Fields */}
      {isUserTask && (
        <Section title="Form">
          <FormFieldEditor
            fields={(config.formFields as FormFieldDefinition[]) || []}
            onChange={(fields) => updateConfig('formFields', fields)}
            disabled={disabled}
          />
        </Section>
      )}

      {/* ServiceTask: HTTP Config */}
      {isServiceTask && (
        <Section title="HTTP Configuration">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">URL</label>
              <input
                type="text"
                value={(config.url as string) || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                disabled={disabled}
                placeholder="https://api.example.com/endpoint"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono disabled:bg-gray-50"
              />
              <p className="mt-1 text-[10px] text-gray-400">
                {'Use ${variableName} for dynamic values'}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">Method</label>
              <select
                value={(config.method as string) || 'GET'}
                onChange={(e) => updateConfig('method', e.target.value)}
                disabled={disabled}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">Headers</label>
              <HeadersEditor
                headers={(config.headers as Record<string, string>) || {}}
                onChange={(headers) => updateConfig('headers', headers)}
                disabled={disabled}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">Request Body (JSON)</label>
              <textarea
                value={config.body ? JSON.stringify(config.body, null, 2) : ''}
                onChange={(e) => {
                  try {
                    const parsed = e.target.value ? JSON.parse(e.target.value) : undefined;
                    updateConfig('body', parsed);
                  } catch {
                    // Allow user to keep typing invalid JSON
                    updateConfig('body', e.target.value);
                  }
                }}
                disabled={disabled}
                placeholder='{"key": "value"}'
                rows={4}
                className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">Timeout (seconds)</label>
              <input
                type="number"
                value={config.timeout ? Number(config.timeout) / 1000 : ''}
                onChange={(e) =>
                  updateConfig('timeout', e.target.value ? Number(e.target.value) * 1000 : undefined)
                }
                disabled={disabled}
                placeholder="30"
                min={1}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              />
            </div>
          </div>
        </Section>
      )}

      {/* SLA Configuration (UserTask and ServiceTask) */}
      {isTask && (
        <Section title="SLA Thresholds">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">Warning (minutes)</label>
              <input
                type="number"
                value={warningMinutes}
                onChange={(e) =>
                  updateSla(
                    'warningThresholdSeconds',
                    e.target.value ? Number(e.target.value) * 60 : null,
                  )
                }
                disabled={disabled}
                placeholder="e.g. 30"
                min={1}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Breach (minutes)</label>
              <input
                type="number"
                value={breachMinutes}
                onChange={(e) =>
                  updateSla(
                    'breachThresholdSeconds',
                    e.target.value ? Number(e.target.value) * 60 : 0,
                  )
                }
                disabled={disabled}
                placeholder="e.g. 60"
                min={1}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              />
            </div>
            {sla && (sla.warningThresholdSeconds || sla.breachThresholdSeconds) && !disabled && (
              <button
                onClick={() => onSlaChange(selectedElement.id, null)}
                className="w-full rounded border border-gray-200 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
              >
                Clear SLA
              </button>
            )}
          </div>
        </Section>
      )}

      {/* Lane info */}
      {selectedElement.type === 'bpmn:Lane' && (
        <Section title="Lane">
          <p className="text-xs text-gray-500">
            This lane represents the <span className="font-medium text-gray-700">{selectedElement.name}</span> role/group.
            Tasks placed in this lane will automatically be assigned to this group.
          </p>
        </Section>
      )}

      {/* Info for non-configurable elements */}
      {!isTask && selectedElement.type !== 'bpmn:Lane' && (
        <Section title="Info">
          <p className="text-xs text-gray-500">
            This element type does not have configurable properties.
          </p>
        </Section>
      )}
    </div>
  );
}

// --- HeadersEditor sub-component ---

function HeadersEditor({
  headers,
  onChange,
  disabled,
}: {
  headers: Record<string, string>;
  onChange: (h: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const entries = Object.entries(headers);

  const updateEntry = (oldKey: string, newKey: string, value: string) => {
    const updated: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (k === oldKey) {
        if (newKey) updated[newKey] = value;
      } else {
        updated[k] = v;
      }
    }
    onChange(updated);
  };

  const addEntry = () => {
    onChange({ ...headers, '': '' });
  };

  const removeEntry = (key: string) => {
    const updated = { ...headers };
    delete updated[key];
    onChange(updated);
  };

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text"
            value={key}
            onChange={(e) => updateEntry(key, e.target.value, value)}
            disabled={disabled}
            placeholder="Header"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-50"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => updateEntry(key, key, e.target.value)}
            disabled={disabled}
            placeholder="Value"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-50"
          />
          {!disabled && (
            <button
              onClick={() => removeEntry(key)}
              className="text-red-400 hover:text-red-600"
            >
              &times;
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          onClick={addEntry}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          + Add Header
        </button>
      )}
    </div>
  );
}
