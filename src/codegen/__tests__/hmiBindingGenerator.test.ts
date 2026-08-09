import { describe, expect, it } from 'vitest';
import { createDefaultCommunicationConfig } from '../../types/hmi';
import {
  createComponent,
  createLogicGraph,
  createLogicNode,
  createScreen,
} from './helpers';
import { generateHmiBindings } from '../hmiBindingGenerator';

describe('generateHmiBindings', () => {
  it('generates board runtime configuration and widget descriptors', () => {
    const communication = {
      ...createDefaultCommunicationConfig(),
      baudRate: 19200,
      parity: 'even' as const,
      unitId: 7,
    };
    const button = createComponent('btn', {
      name: 'Start Pump',
      modbusBinding: {
        enabled: true,
        tagId: 'start-pump-tag',
        area: 'coil',
        address: 12,
        dataType: 'bool',
        access: 'write',
        property: 'checked',
        scale: 1,
        pollIntervalMs: 250,
        writeBehavior: 'toggle',
        writeValue: 1,
      },
    });

    const generated = generateHmiBindings([
      createScreen({ name: 'Main', components: [button] }),
    ], communication);

    expect(generated['hmi_bindings_generated.c']).toContain('.baud_rate = 19200U');
    expect(generated['hmi_bindings_generated.c']).toContain('.unit_id = 7');
    expect(generated['hmi_bindings_generated.c']).toContain('.object = &ui_start_pump');
    expect(generated['hmi_bindings_generated.c']).toContain('.area = HMI_AREA_COIL');
    expect(generated['hmi_bindings_generated.c']).toContain('.write_behavior = HMI_WRITE_TOGGLE');
  });

  it('forces Modbus input tables to read-only access', () => {
    const label = createComponent('label', {
      name: 'Temperature',
      modbusBinding: {
        enabled: true,
        area: 'input-register',
        address: 0,
        dataType: 'int16',
        access: 'readwrite',
        property: 'text',
        scale: 0.1,
        pollIntervalMs: 500,
        writeBehavior: 'widget-value',
        writeValue: 0,
      },
    });

    const generated = generateHmiBindings(
      [createScreen({ components: [label] })],
      createDefaultCommunicationConfig(),
    );

    expect(generated['hmi_bindings_generated.c']).toContain('.access = HMI_ACCESS_READ');
    expect(generated['hmi_bindings_generated.c']).toContain('.scale = 0.1f');
  });

  it('uses image-button value adapters for Holding Register writes', () => {
    const imageButton = createComponent('image-button', {
      name: 'Mode Select',
      modbusBinding: {
        enabled: true,
        area: 'holding-register',
        address: 3,
        dataType: 'uint16',
        access: 'readwrite',
        property: 'value',
        scale: 1,
        pollIntervalMs: 250,
        writeBehavior: 'widget-value',
        writeValue: 0,
      },
    });

    const generated = generateHmiBindings(
      [createScreen({ components: [imageButton] })],
      createDefaultCommunicationConfig(),
    );
    const source = generated['hmi_bindings_generated.c'];

    expect(source).toContain('.widget = HMI_WIDGET_IMAGE_BUTTON');
    expect(source).toContain('.area = HMI_AREA_HOLDING_REGISTER');
    expect(source).toContain('.value_reader = ui_mode_select_get_value');
    expect(source).toContain('.value_writer = ui_mode_select_set_value');
  });

  it('emits an empty, standard-compliant descriptor table', () => {
    const generated = generateHmiBindings(
      [createScreen()],
      createDefaultCommunicationConfig(),
    );

    expect(generated['hmi_bindings_generated.c']).toContain(
      'hmi_binding_descriptors[1] = {{0}}',
    );
    expect(generated['hmi_bindings_generated.c']).toContain(
      'hmi_binding_descriptor_count = 0U',
    );
  });

  it('emits a virtual polling descriptor for each Logic holding-register address', () => {
    const generated = generateHmiBindings(
      [createScreen()],
      {
        ...createDefaultCommunicationConfig(),
        pollIntervalMs: 400,
      },
      {},
      [
        createLogicGraph({
          nodes: [
            createLogicNode('modbus_holding_register', {
              params: { address: 2 },
            }),
            createLogicNode('modbus_holding_register', {
              params: { address: 2 },
            }),
            createLogicNode('modbus_holding_register', {
              params: { address: 65539 },
            }),
          ],
        }),
      ],
    );

    const source = generated['hmi_bindings_generated.c'];
    expect(source.match(/\.object = NULL/g)).toHaveLength(2);
    expect(source).toContain('.address = 2U');
    expect(source).toContain('.address = 65535U');
    expect(source).toContain('.area = HMI_AREA_HOLDING_REGISTER');
    expect(source).toContain('.access = HMI_ACCESS_READ');
    expect(source).toContain('.poll_ms = 400U');
  });
});
