import React, { useEffect, useMemo } from 'react';
import type {
  ModbusAccess,
  ModbusBinding,
  ModbusDataType,
  ModbusRegisterArea,
  ModbusRegisterTag,
  ModbusWidgetProperty,
  ModbusWriteBehavior,
} from '../../types/hmi';
import {
  applyTagToBinding,
  bindingMatchesTag,
} from '../../utils/modbusBindings';
import './ModbusBindingEditor.css';

interface ModbusBindingEditorProps {
  componentType: string;
  binding?: ModbusBinding;
  tags?: ModbusRegisterTag[];
  communicationEnabled?: boolean;
  onChange: (binding: ModbusBinding) => void;
}

const SUPPORTED_COMPONENT_TYPES = new Set([
  'btn',
  'label',
  'textarea',
  'dropdown',
  'checkbox',
  'switch',
  'slider',
  'bar',
  'arc',
  'image-button',
  'qrcode',
]);

const AREA_OPTIONS: { value: ModbusRegisterArea; label: string }[] = [
  { value: 'coil', label: 'Coil (0x)' },
  { value: 'discrete-input', label: 'Discrete Input (1x)' },
  { value: 'input-register', label: 'Input Register (3x)' },
  { value: 'holding-register', label: 'Holding Register (4x)' },
];

const DATA_TYPE_OPTIONS: ModbusDataType[] = [
  'bool',
  'uint16',
  'int16',
  'uint32',
  'int32',
  'float32',
];

const ACCESS_OPTIONS: { value: ModbusAccess; label: string }[] = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'readwrite', label: 'Read/Write' },
];

const WRITE_BEHAVIORS: { value: ModbusWriteBehavior; label: string }[] = [
  { value: 'widget-value', label: 'Write Widget Value' },
  { value: 'set', label: 'Set Fixed Value' },
  { value: 'toggle', label: 'Toggle 0 / 1' },
  { value: 'increment', label: 'Increment' },
  { value: 'decrement', label: 'Decrement' },
];

function getPropertyOptions(componentType: string): {
  value: ModbusWidgetProperty;
  label: string;
}[] {
  switch (componentType) {
    case 'switch':
    case 'checkbox':
      return [{ value: 'checked', label: 'Checked State' }];
    case 'textarea':
    case 'label':
      return [{ value: 'text', label: 'Text' }];
    case 'qrcode':
      return [{ value: 'text', label: 'Encoded Content' }];
    case 'dropdown':
      return [{ value: 'selected', label: 'Selected Option Index' }];
    default:
      return [{ value: 'value', label: 'Value' }];
  }
}

function createDefaultBinding(componentType: string): ModbusBinding {
  if (componentType === 'qrcode') {
    /*
     * A string, and read-only: nothing on the panel edits a QR code, so
     * there is nothing to write back. Sixteen registers is 32 characters —
     * a short URL — and the field beside the data type stretches it.
     */
    return {
      enabled: false,
      area: 'holding-register',
      address: 0,
      dataType: 'string',
      access: 'read',
      property: 'text',
      scale: 1,
      pollIntervalMs: 500,
      writeBehavior: 'widget-value',
      writeValue: 0,
      stringRegisters: 16,
    };
  }
  if (componentType === 'image-button') {
    return {
      enabled: false,
      area: 'holding-register',
      address: 0,
      dataType: 'uint16',
      access: 'readwrite',
      property: 'value',
      scale: 1,
      pollIntervalMs: 250,
      writeBehavior: 'widget-value',
      writeValue: 0,
    };
  }

  const isBoolean = ['btn', 'switch', 'checkbox'].includes(componentType);
  const isInteractive = [
    'btn',
    'textarea',
    'dropdown',
    'checkbox',
    'switch',
    'slider',
  ].includes(componentType);
  const property = getPropertyOptions(componentType)[0].value;

  return {
    enabled: false,
    area: isBoolean ? 'coil' : 'holding-register',
    address: 0,
    dataType: isBoolean ? 'bool' : 'uint16',
    access: componentType === 'btn' ? 'write' : isInteractive ? 'readwrite' : 'read',
    property,
    scale: 1,
    pollIntervalMs: 250,
    writeBehavior: componentType === 'btn' ? 'toggle' : 'widget-value',
    writeValue: 1,
  };
}

function isReadOnlyArea(area: ModbusRegisterArea): boolean {
  return area === 'discrete-input' || area === 'input-register';
}

const ModbusBindingEditor: React.FC<ModbusBindingEditorProps> = ({
  componentType,
  binding,
  tags = [],
  communicationEnabled = true,
  onChange,
}) => {
  const isImageButton = componentType === 'image-button';
  const isQrcode = componentType === 'qrcode';
  const defaults = useMemo(() => createDefaultBinding(componentType), [componentType]);
  const baseValue = binding ?? defaults;
  const availableTags = isImageButton
    ? tags.filter((tag) => (
        tag.area === 'holding-register' && tag.dataType === 'uint16'
      ))
    // The Protocol tab's tags are numeric; none of them can back a string
    // read, so the picker is empty rather than misleading.
    : isQrcode ? [] : tags;
  const selectedTag = baseValue.tagId
    ? availableTags.find((tag) => tag.id === baseValue.tagId)
    : undefined;
  const synchronizedValue = selectedTag
    ? applyTagToBinding(baseValue, selectedTag)
    : baseValue;
  const value = isImageButton && !selectedTag
    ? {
        ...synchronizedValue,
        area: 'holding-register' as const,
        dataType: 'uint16' as const,
        property: 'value' as const,
        writeBehavior: 'widget-value' as const,
      }
    : synchronizedValue;
  const propertyOptions = getPropertyOptions(componentType);
  const canWrite = value.access === 'write' || value.access === 'readwrite';
  const usesWriteValue = (
    value.writeBehavior === 'set'
    || value.writeBehavior === 'increment'
    || value.writeBehavior === 'decrement'
  );
  const booleanArea = value.area === 'coil' || value.area === 'discrete-input';
  const tagBacked = selectedTag !== undefined;

  useEffect(() => {
    if (
      binding
      && selectedTag
      && !bindingMatchesTag(binding, selectedTag)
    ) {
      onChange(applyTagToBinding(binding, selectedTag));
    }
  }, [binding, onChange, selectedTag]);

  if (
    !SUPPORTED_COMPONENT_TYPES.has(componentType)
    || (isImageButton && !communicationEnabled)
  ) {
    return null;
  }

  const update = (updates: Partial<ModbusBinding>) => {
    onChange({ ...value, ...updates });
  };

  return (
    <div className={`property-section modbus-binding-section ${value.enabled ? 'enabled' : ''}`}>
      <div className="section-header modbus-binding-header">
        <span>Modbus Binding</span>
        <label>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          Enabled
        </label>
      </div>

      {value.enabled && (
        <div className="modbus-binding-body">
          <div className="property-row">
            <label>Address source</label>
            <select
              aria-label="Modbus address source"
              value={value.tagId ?? ''}
              onChange={(event) => {
                const tagId = event.target.value;
                if (!tagId) {
                  update({ tagId: undefined });
                  return;
                }
                const tag = availableTags.find(
                  (candidate) => candidate.id === tagId,
                );
                if (tag) {
                  onChange(applyTagToBinding(value, tag));
                }
              }}
            >
              <option value="">Direct address</option>
              {value.tagId && !selectedTag && (
                <option value={value.tagId}>
                  Missing Tag ({value.tagId}) — direct snapshot
                </option>
              )}
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name} · {tag.area} {tag.address}
                </option>
              ))}
            </select>
          </div>

          <div className="property-row">
            <label>Area</label>
            <select
              value={value.area}
              disabled={tagBacked || isImageButton}
              onChange={(event) => {
                const area = event.target.value as ModbusRegisterArea;
                update({
                  area,
                  ...(isReadOnlyArea(area) ? { access: 'read' as const } : {}),
                  ...(
                    area === 'coil' || area === 'discrete-input'
                      ? { dataType: 'bool' as const }
                      : {}
                  ),
                });
              }}
            >
              {(isImageButton
                ? AREA_OPTIONS.filter((area) => area.value === 'holding-register')
                : AREA_OPTIONS
              ).map((area) => (
                <option key={area.value} value={area.value}>{area.label}</option>
              ))}
            </select>
          </div>

          <div className="property-row">
            <label>Address</label>
            <input
              type="number"
              min={0}
              max={65535}
              value={value.address}
              disabled={tagBacked}
              onChange={(event) => update({
                address: Math.min(65535, Math.max(0, Number(event.target.value) || 0)),
              })}
            />
          </div>

          <div className="property-row">
            <label>Data type</label>
            <select
              value={value.dataType}
              disabled={booleanArea || tagBacked || isImageButton || isQrcode}
              onChange={(event) => update({
                dataType: event.target.value as ModbusDataType,
              })}
            >
              {(isQrcode ? (['string'] as const) : DATA_TYPE_OPTIONS).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {isQrcode && (
            <div className="property-row">
              <label>Length (registers)</label>
              <input
                type="number"
                min={1}
                max={64}
                value={value.stringRegisters ?? 16}
                aria-label="String length in registers"
                onChange={(event) => update({
                  stringRegisters: Math.min(64, Math.max(1, Number(event.target.value) || 16)),
                })}
              />
              <span className="property-hint">
                {2 * (value.stringRegisters ?? 16)} bytes of UTF-8 — two per
                register, high byte first, ended by a zero. A kanji is three
                bytes; plain letters are one each.
              </span>
            </div>
          )}

          <div className="property-row">
            <label>Access</label>
            <select
              value={value.access}
              disabled={isReadOnlyArea(value.area) || tagBacked || isQrcode}
              onChange={(event) => update({
                access: event.target.value as ModbusAccess,
              })}
            >
              {ACCESS_OPTIONS.map((access) => (
                <option key={access.value} value={access.value}>{access.label}</option>
              ))}
            </select>
          </div>

          <div className="property-row">
            <label>Widget property</label>
            <select
              value={value.property}
              onChange={(event) => update({
                property: event.target.value as ModbusWidgetProperty,
              })}
            >
              {propertyOptions.map((property) => (
                <option key={property.value} value={property.value}>{property.label}</option>
              ))}
            </select>
          </div>

          <div className="property-row two-col">
            <div className="property-field">
              <label>Scale</label>
              <input
                type="number"
                step="0.01"
                value={value.scale}
                disabled={tagBacked}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  update({ scale: Number.isFinite(next) ? next : 1 });
                }}
              />
            </div>
            <div className="property-field">
              <label>Poll (ms)</label>
              <input
                type="number"
                min={50}
                step={50}
                value={value.pollIntervalMs}
                disabled={tagBacked}
                onChange={(event) => update({
                  pollIntervalMs: Math.max(50, Number(event.target.value) || 50),
                })}
              />
            </div>
          </div>

          {canWrite && (
            <>
              <div className="property-row">
                <label>Write behavior</label>
                <select
                  value={value.writeBehavior}
                  disabled={isImageButton}
                  onChange={(event) => update({
                    writeBehavior: event.target.value as ModbusWriteBehavior,
                  })}
                >
                  {WRITE_BEHAVIORS.map((behavior) => (
                    <option key={behavior.value} value={behavior.value}>{behavior.label}</option>
                  ))}
                </select>
              </div>
              {usesWriteValue && (
                <div className="property-row">
                  <label>
                    {value.writeBehavior === 'set' ? 'Write value' : 'Step'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={value.writeValue}
                    onChange={(event) => update({
                      writeValue: Number(event.target.value) || 0,
                    })}
                  />
                </div>
              )}
            </>
          )}

          <div className="modbus-binding-hint">
            {tagBacked
              ? `Bound to tag "${selectedTag.name}". The address and data format stay synchronized with the project tag.`
              : isImageButton
              ? 'The numeric value of the selected image state is mapped to this Holding Register.'
              : componentType === 'btn'
              ? 'Button events write to the Modbus address using the selected write behavior.'
              : 'Reads update the widget property; writes use the widget value or selected behavior.'}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModbusBindingEditor;
