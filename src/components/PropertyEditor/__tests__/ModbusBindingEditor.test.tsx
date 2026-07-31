import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ModbusBinding } from '../../../types/hmi';
import ModbusBindingEditor from '../ModbusBindingEditor';

describe('ModbusBindingEditor', () => {
  it('creates a complete no-code toggle binding when a button is enabled', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ModbusBindingEditor
        componentType="btn"
        onChange={onChange}
      />,
    );

    fireEvent.click(container.querySelector('input[type="checkbox"]')!);

    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      area: 'coil',
      address: 0,
      dataType: 'bool',
      access: 'write',
      property: 'value',
      scale: 1,
      pollIntervalMs: 250,
      writeBehavior: 'toggle',
      writeValue: 1,
    });
  });

  it('forces read-only access and boolean data for a discrete input binding', () => {
    const onChange = vi.fn();
    const binding: ModbusBinding = {
      enabled: true,
      area: 'holding-register',
      address: 9,
      dataType: 'uint16',
      access: 'readwrite',
      property: 'checked',
      scale: 1,
      pollIntervalMs: 250,
      writeBehavior: 'widget-value',
      writeValue: 1,
    };
    const { container } = render(
      <ModbusBindingEditor
        componentType="switch"
        binding={binding}
        onChange={onChange}
      />,
    );

    fireEvent.change(container.querySelectorAll('select')[1], {
      target: { value: 'discrete-input' },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...binding,
      area: 'discrete-input',
      access: 'read',
      dataType: 'bool',
    });
  });

  it('copies a reusable project tag into the codegen-ready binding fields', () => {
    const onChange = vi.fn();
    const binding: ModbusBinding = {
      enabled: true,
      area: 'coil',
      address: 0,
      dataType: 'bool',
      access: 'write',
      property: 'value',
      scale: 1,
      pollIntervalMs: 250,
      writeBehavior: 'toggle',
      writeValue: 1,
    };
    const tag = {
      id: 'speed-tag',
      name: 'Target speed',
      area: 'holding-register' as const,
      address: 42,
      dataType: 'uint16' as const,
      access: 'readwrite' as const,
      scale: 0.1,
      pollIntervalMs: 100,
    };
    const { getByLabelText } = render(
      <ModbusBindingEditor
        componentType="slider"
        binding={binding}
        tags={[tag]}
        onChange={onChange}
      />,
    );

    fireEvent.change(getByLabelText('Modbus address source'), {
      target: { value: tag.id },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...binding,
      tagId: tag.id,
      area: tag.area,
      address: tag.address,
      dataType: tag.dataType,
      access: tag.access,
      scale: tag.scale,
      pollIntervalMs: tag.pollIntervalMs,
    });
  });

  it('creates a Holding Register widget-value binding for an image button', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ModbusBindingEditor
        componentType="image-button"
        communicationEnabled
        onChange={onChange}
      />,
    );

    fireEvent.click(container.querySelector('input[type="checkbox"]')!);

    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      area: 'holding-register',
      address: 0,
      dataType: 'uint16',
      access: 'readwrite',
      property: 'value',
      scale: 1,
      pollIntervalMs: 250,
      writeBehavior: 'widget-value',
      writeValue: 0,
    });
  });

  it('hides image-button binding until project communication is enabled', () => {
    const { container } = render(
      <ModbusBindingEditor
        componentType="image-button"
        communicationEnabled={false}
        onChange={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers only Holding Register tags to an image button', () => {
    const binding: ModbusBinding = {
      enabled: true,
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
    render(
      <ModbusBindingEditor
        componentType="image-button"
        binding={binding}
        tags={[
          {
            id: 'coil',
            name: 'Run Coil',
            area: 'coil',
            address: 1,
            dataType: 'bool',
            access: 'readwrite',
            scale: 1,
            pollIntervalMs: 100,
          },
          {
            id: 'register',
            name: 'Mode Register',
            area: 'holding-register',
            address: 3,
            dataType: 'uint16',
            access: 'readwrite',
            scale: 1,
            pollIntervalMs: 100,
          },
          {
            id: 'float-register',
            name: 'Float Register',
            area: 'holding-register',
            address: 4,
            dataType: 'float32',
            access: 'readwrite',
            scale: 1,
            pollIntervalMs: 100,
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    const addressSource = screen.getByLabelText('Modbus address source');
    expect(addressSource).toHaveTextContent('Mode Register');
    expect(addressSource).not.toHaveTextContent('Run Coil');
    expect(addressSource).not.toHaveTextContent('Float Register');
  });
});
