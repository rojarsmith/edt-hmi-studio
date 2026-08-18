import { describe, expect, it } from 'vitest';
import type { CanvasState, LvglComponent, Screen } from '../../types';
import { createDefaultCommunicationConfig } from '../../types/hmi';
import {
  createProjectFile,
  parseProject,
  serializeProject,
} from '../projectManager';

function createBoundButton(): LvglComponent {
  return {
    id: 'button-1',
    type: 'btn',
    name: 'StartButton',
    x: 10,
    y: 20,
    width: 120,
    height: 48,
    children: [],
    props: { text: 'Start' },
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
    modbusBinding: {
      enabled: true,
      tagId: 'tag-1',
      area: 'coil',
      address: 12,
      dataType: 'bool',
      access: 'write',
      property: 'value',
      scale: 1,
      pollIntervalMs: 250,
      writeBehavior: 'toggle',
      writeValue: 1,
    },
  };
}

const canvas: CanvasState = {
  width: 480,
  height: 272,
  zoom: 1,
  panX: 0,
  panY: 0,
  showGrid: true,
  gridSize: 10,
  snapToGrid: true,
};

describe('HMI project file round-trip', () => {
  it('preserves screen appearance, Modbus configuration, tags, and widget bindings', () => {
    const screens: Screen[] = [{
      id: 'screen-1',
      name: 'Main',
      backgroundColor: '#123456',
      components: [createBoundButton()],
    }];
    const communication = {
      ...createDefaultCommunicationConfig(),
      port: 'COM5',
      unitId: 7,
      tags: [{
        id: 'tag-1',
        name: 'MachineReady',
        area: 'coil' as const,
        address: 12,
        dataType: 'bool' as const,
        access: 'readwrite' as const,
        scale: 1,
        pollIntervalMs: 100,
      }],
    };

    const created = createProjectFile(
      'Machine HMI',
      screens,
      canvas,
      [],
      [],
      [],
      'stm32f746g-disco',
      communication,
    );
    const parsed = parseProject(serializeProject(created));

    expect(parsed.boardId).toBe('stm32f746g-disco');
    expect(parsed.screens[0].backgroundColor).toBe('#123456');
    expect(parsed.screens[0].components[0].modbusBinding).toEqual(
      screens[0].components[0].modbusBinding,
    );
    expect(parsed.communication).toEqual(communication);
  });

  it('carries the entry screen flag through the file, so the firmware boots there', () => {
    const screens: Screen[] = [
      { id: 'screen-1', name: 'Main', components: [] },
      { id: 'screen-2', name: 'Settings', components: [], isEntry: true },
    ];

    const parsed = parseProject(
      serializeProject(createProjectFile('Entry HMI', screens, canvas, [], [])),
    );

    expect(parsed.screens.map(s => s.isEntry)).toEqual([undefined, true]);
  });

  it('migrates a legacy project to the supported board and default Modbus client config', () => {
    const parsed = parseProject(JSON.stringify({
      version: '1.0.0',
      name: 'Legacy',
      createdAt: 1,
      updatedAt: 1,
      canvasSize: { width: 480, height: 272 },
      screens: [],
      resources: { images: [], fonts: [] },
      variables: [],
      codeGenOptions: {
        outputFormat: 'single-file',
        includeComments: true,
        useStaticAllocation: true,
        prefix: 'ui',
        indentSize: 4,
        indentStyle: 'spaces',
      },
    }));

    expect(parsed.boardId).toBe('stm32f746g-disco');
    expect(parsed.communication).toMatchObject({
      enabled: true,
      protocol: 'modbus-rtu',
      role: 'client',
      baudRate: 9600,
      unitId: 1,
      tags: [],
    });
  });
});
