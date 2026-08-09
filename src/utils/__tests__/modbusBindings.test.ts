import { describe, expect, it } from 'vitest';
import type { LvglComponent, Screen } from '../../types';
import type { ModbusRegisterTag } from '../../types/hmi';
import { synchronizeModbusBindings } from '../modbusBindings';

function component(tagId: string): LvglComponent {
  return {
    id: 'slider-1',
    type: 'slider',
    name: 'Speed',
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    children: [],
    props: {},
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
    modbusBinding: {
      enabled: true,
      tagId,
      area: 'coil',
      address: 0,
      dataType: 'bool',
      access: 'write',
      property: 'value',
      scale: 1,
      pollIntervalMs: 250,
      writeBehavior: 'widget-value',
      writeValue: 0,
    },
  };
}

const tag: ModbusRegisterTag = {
  id: 'speed-tag',
  name: 'Target speed',
  area: 'holding-register',
  address: 42,
  dataType: 'uint16',
  access: 'readwrite',
  scale: 0.1,
  pollIntervalMs: 100,
};

describe('synchronizeModbusBindings', () => {
  it('updates nested tag-backed bindings and keeps unrelated screens reference-stable', () => {
    const taggedChild = component(tag.id);
    const container = {
      ...component(''),
      id: 'container',
      type: 'obj',
      modbusBinding: undefined,
      children: [taggedChild],
    };
    const screens: Screen[] = [
      { id: 'main', name: 'Main', components: [container] },
      { id: 'other', name: 'Other', components: [] },
    ];

    const synchronized = synchronizeModbusBindings(screens, [tag]);
    const binding = synchronized[0].components[0].children[0].modbusBinding;

    expect(synchronized).not.toBe(screens);
    expect(synchronized[1]).toBe(screens[1]);
    expect(binding).toMatchObject({
      tagId: tag.id,
      area: tag.area,
      address: tag.address,
      dataType: tag.dataType,
      access: tag.access,
      scale: tag.scale,
      pollIntervalMs: tag.pollIntervalMs,
    });
  });

  it('falls back to a direct snapshot when its tag is removed', () => {
    const screens: Screen[] = [{
      id: 'main',
      name: 'Main',
      components: [component(tag.id)],
    }];

    const synchronized = synchronizeModbusBindings(screens, []);
    const binding = synchronized[0].components[0].modbusBinding;

    expect(binding?.tagId).toBeUndefined();
    expect(binding?.address).toBe(0);
    expect(binding?.writeBehavior).toBe('widget-value');
  });
});
