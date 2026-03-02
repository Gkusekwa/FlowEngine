import { useState } from 'react';
import type { FormFieldDefinition } from '@flowengine/shared';
import { FormFieldType } from '@flowengine/shared';

interface FormFieldEditorProps {
  fields: FormFieldDefinition[];
  onChange: (fields: FormFieldDefinition[]) => void;
  disabled?: boolean;
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: FormFieldType.TEXT, label: 'Text' },
  { value: FormFieldType.TEXTAREA, label: 'Textarea' },
  { value: FormFieldType.NUMBER, label: 'Number' },
  { value: FormFieldType.BOOLEAN, label: 'Checkbox' },
  { value: FormFieldType.DATE, label: 'Date' },
  { value: FormFieldType.DATETIME, label: 'Date & Time' },
  { value: FormFieldType.SELECT, label: 'Dropdown' },
  { value: FormFieldType.MULTISELECT, label: 'Multi-select' },
  { value: FormFieldType.RADIO, label: 'Radio' },
];

const hasOptions = (type: FormFieldType) =>
  type === FormFieldType.SELECT ||
  type === FormFieldType.MULTISELECT ||
  type === FormFieldType.RADIO;

function generateKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function generateId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function FormFieldEditor({ fields, onChange, disabled }: FormFieldEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const addField = () => {
    const newField: FormFieldDefinition = {
      id: generateId(),
      type: FormFieldType.TEXT,
      label: '',
      key: '',
      required: false,
    };
    onChange([...fields, newField]);
    setExpandedIndex(fields.length);
  };

  const updateField = (index: number, updates: Partial<FormFieldDefinition>) => {
    const updated = fields.map((f, i) => {
      if (i !== index) return f;
      const merged = { ...f, ...updates };
      // Auto-generate key from label if key is empty or was auto-generated
      if (updates.label !== undefined && (!f.key || f.key === generateKey(f.label))) {
        merged.key = generateKey(updates.label);
      }
      return merged;
    });
    onChange(updated);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
    if (expandedIndex === index) setExpandedIndex(null);
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const updated = [...fields];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
    setExpandedIndex(newIndex);
  };

  const addOption = (fieldIndex: number) => {
    const field = fields[fieldIndex];
    const options = [...(field.options || []), { label: '', value: '' }];
    updateField(fieldIndex, { options });
  };

  const updateOption = (fieldIndex: number, optIndex: number, key: 'label' | 'value', val: string) => {
    const field = fields[fieldIndex];
    const options = (field.options || []).map((opt, i) => {
      if (i !== optIndex) return opt;
      const updated = { ...opt, [key]: val };
      // Auto-generate value from label
      if (key === 'label' && (!opt.value || opt.value === generateKey(opt.label))) {
        updated.value = generateKey(val);
      }
      return updated;
    });
    updateField(fieldIndex, { options });
  };

  const removeOption = (fieldIndex: number, optIndex: number) => {
    const field = fields[fieldIndex];
    updateField(fieldIndex, {
      options: (field.options || []).filter((_, i) => i !== optIndex),
    });
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase text-gray-500">Form Fields</h4>
        {!disabled && (
          <button
            onClick={addField}
            className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
          >
            + Add Field
          </button>
        )}
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-gray-400">No form fields configured</p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="rounded-lg border border-gray-200 bg-white"
            >
              {/* Collapsed header */}
              <div
                className="flex cursor-pointer items-center justify-between px-3 py-2"
                onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-xs text-gray-400">{index + 1}.</span>
                  <span className="truncate text-sm font-medium text-gray-700">
                    {field.label || 'Untitled'}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                    {field.type}
                  </span>
                  {field.required && (
                    <span className="text-xs text-red-500">*</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!disabled && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveField(index, -1); }}
                        disabled={index === 0}
                        className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="Move up"
                      >
                        &#8593;
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveField(index, 1); }}
                        disabled={index === fields.length - 1}
                        className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="Move down"
                      >
                        &#8595;
                      </button>
                    </>
                  )}
                  <span className="text-gray-400">{expandedIndex === index ? '▾' : '▸'}</span>
                </div>
              </div>

              {/* Expanded config */}
              {expandedIndex === index && (
                <div className="border-t border-gray-100 px-3 py-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Type</label>
                    <select
                      value={field.type}
                      onChange={(e) => updateField(index, { type: e.target.value as FormFieldType })}
                      disabled={disabled}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Label</label>
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      disabled={disabled}
                      placeholder="e.g. Full Name"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Key</label>
                    <input
                      type="text"
                      value={field.key}
                      onChange={(e) => updateField(index, { key: e.target.value })}
                      disabled={disabled}
                      placeholder="e.g. full_name"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono disabled:bg-gray-50"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={field.required || false}
                      onChange={(e) => updateField(index, { required: e.target.checked })}
                      disabled={disabled}
                      className="rounded border-gray-300"
                    />
                    <label className="text-xs text-gray-600">Required</label>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Placeholder</label>
                    <input
                      type="text"
                      value={field.placeholder || ''}
                      onChange={(e) => updateField(index, { placeholder: e.target.value || undefined })}
                      disabled={disabled}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Default Value</label>
                    <input
                      type="text"
                      value={field.defaultValue != null ? String(field.defaultValue) : ''}
                      onChange={(e) => updateField(index, { defaultValue: e.target.value || undefined })}
                      disabled={disabled}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
                    />
                  </div>

                  {/* Options editor for select/radio/multiselect */}
                  {hasOptions(field.type) && (
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-xs text-gray-500">Options</label>
                        {!disabled && (
                          <button
                            onClick={() => addOption(index)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            + Add
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {(field.options || []).map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={opt.label}
                              onChange={(e) => updateOption(index, optIdx, 'label', e.target.value)}
                              disabled={disabled}
                              placeholder="Label"
                              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-50"
                            />
                            <input
                              type="text"
                              value={opt.value}
                              onChange={(e) => updateOption(index, optIdx, 'value', e.target.value)}
                              disabled={disabled}
                              placeholder="Value"
                              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs font-mono disabled:bg-gray-50"
                            />
                            {!disabled && (
                              <button
                                onClick={() => removeOption(index, optIdx)}
                                className="text-red-400 hover:text-red-600"
                                title="Remove option"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        ))}
                        {(field.options || []).length === 0 && (
                          <p className="text-xs text-gray-400">No options added</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Remove button */}
                  {!disabled && (
                    <button
                      onClick={() => removeField(index)}
                      className="w-full rounded border border-red-200 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      Remove Field
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
