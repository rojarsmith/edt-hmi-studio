// @vitest-environment node

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultCommunicationConfig } from '../../../src/types/hmi';
import { writeGeneratedProjectSource } from '../projectSource';

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('writeGeneratedProjectSource', () => {
  it('writes image-button resources and Logic polling descriptors', async () => {
    const requestedOutputDirectory =
      process.env.HMI_TEST_PROJECT_SOURCE_DIRECTORY;
    const outputDirectory = requestedOutputDirectory
      ? await mkdir(requestedOutputDirectory, { recursive: true }).then(
          () => requestedOutputDirectory,
        )
      : await mkdtemp(join(tmpdir(), 'lvgl-editor-project-source-'));
    if (!requestedOutputDirectory) {
      temporaryDirectories.push(outputDirectory);
    }

    const project = {
      pages: [
        {
          id: 'page-1',
          name: 'Main',
          components: [
            {
              id: 'image-button-1',
              type: 'image-button',
              name: 'Mode Select',
              x: 0,
              y: 0,
              width: 64,
              height: 64,
              children: [],
              props: {
                states: [
                  {
                    id: 'state-1',
                    name: 'Off',
                    imageId: 'image-1',
                    value: 0,
                  },
                  {
                    id: 'state-2',
                    name: 'Running',
                    imageId: 'image-2',
                    value: 42,
                  },
                ],
                initialState: 0,
                currentState: 0,
                value: 0,
                cycleOnClick: true,
              },
              styles: { default: {} },
              events: [],
              animations: [],
              parentId: null,
              locked: false,
              visible: true,
              modbusBinding: {
                enabled: true,
                area: 'holding-register',
                address: 7,
                dataType: 'uint16',
                access: 'readwrite',
                property: 'value',
                scale: 1,
                pollIntervalMs: 250,
                writeBehavior: 'widget-value',
                writeValue: 0,
              },
            },
          ],
        },
      ],
      resources: {
        images: [
          {
            id: 'image-1',
            name: 'State Image',
            originalName: 'state.png',
            width: 1,
            height: 1,
            format: 'RGB565',
            data: `data:image/png;base64,${ONE_PIXEL_PNG}`,
            cArrayName: 'img_state',
            size: ONE_PIXEL_PNG.length,
            createdAt: 1,
          },
          {
            id: 'image-2',
            name: 'Running State Image',
            originalName: 'running-state.png',
            width: 1,
            height: 1,
            format: 'RGB565',
            data: `data:image/png;base64,${ONE_PIXEL_PNG}`,
            cArrayName: 'img_state_running',
            size: ONE_PIXEL_PNG.length,
            createdAt: 2,
          },
        ],
        fonts: [],
      },
      communication: createDefaultCommunicationConfig(),
      logicGraphs: [
        {
          id: 'logic-1',
          name: 'Read Register',
          nodes: [
            {
              id: 'read-1',
              type: 'data',
              subType: 'modbus_holding_register',
              label: 'Read Holding Register',
              position: { x: 0, y: 0 },
              params: { address: 5 },
              inputs: [],
              outputs: [
                {
                  id: 'value-1',
                  name: 'Value',
                  type: 'int',
                },
              ],
            },
          ],
          connections: [],
          variables: [],
        },
      ],
      lvglConfig: {
        version: '9',
        colorFormat: 'RGB565',
        fontLarge: true,
        defaultFont: 'montserrat_14',
        memSize: 64,
      },
    };

    const files = await writeGeneratedProjectSource(
      project,
      outputDirectory,
    );

    expect(files).toContain('img_state.c');
    expect(files).toContain('img_state_running.c');
    expect(
      await readFile(join(outputDirectory, 'img_state.c'), 'utf8'),
    ).toContain('const lv_image_dsc_t img_state');
    const bindingsSource = await readFile(
      join(outputDirectory, 'hmi_bindings_generated.c'),
      'utf8',
    );
    expect(bindingsSource).toContain('.address = 5U');
    expect(bindingsSource).toContain('.address = 7U');
    expect(bindingsSource).toContain(
      '.value_reader = ui_mode_select_get_value',
    );
    expect(bindingsSource).toContain(
      '.value_writer = ui_mode_select_set_value',
    );
    const uiSource = await readFile(
      join(outputDirectory, 'ui.c'),
      'utf8',
    );
    expect(uiSource).toContain(
      'static const void *const ui_mode_select_state_images[]',
    );
    expect(uiSource).toContain('&img_state, &img_state_running,');
    expect(uiSource).toContain('0, 42,');
  });

  it('resizes image-button-only assets to fixed widget bounds', async () => {
    const outputDirectory = await mkdtemp(
      join(tmpdir(), 'lvgl-editor-image-button-assets-'),
    );
    temporaryDirectories.push(outputDirectory);
    const source = await import('sharp').then(({ default: sharp }) =>
      sharp({
        create: {
          width: 512,
          height: 512,
          channels: 4,
          background: { r: 40, g: 80, b: 120, alpha: 0.5 },
        },
      }).png().toBuffer(),
    );
    const project = {
      pages: [{
        id: 'page-1',
        name: 'Main',
        components: [{
          id: 'image-button-1',
          type: 'image-button',
          name: 'Mode Select',
          x: 0,
          y: 0,
          width: 100,
          height: 64,
          children: [],
          props: {
            states: [{
              id: 'state-1',
              name: 'Idle',
              imageId: 'large-image',
              value: 0,
            }],
            initialState: 0,
            currentState: 0,
            value: 0,
            cycleOnClick: true,
          },
          styles: { default: {} },
          events: [],
          animations: [],
          parentId: null,
          locked: false,
          visible: true,
        }],
      }],
      resources: {
        images: [{
          id: 'large-image',
          name: 'Large State',
          originalName: 'large.png',
          width: 512,
          height: 512,
          format: 'ARGB8888',
          data: `data:image/png;base64,${source.toString('base64')}`,
          cArrayName: 'img_large_state',
          size: source.length,
          createdAt: 1,
        }],
        fonts: [],
      },
      communication: createDefaultCommunicationConfig(),
      logicGraphs: [],
      lvglConfig: {
        version: '9',
        colorFormat: 'RGB565',
        fontLarge: true,
        defaultFont: 'montserrat_14',
        memSize: 64,
      },
    };

    await writeGeneratedProjectSource(project, outputDirectory);

    const imageSource = await readFile(
      join(outputDirectory, 'img_large_state.c'),
      'utf8',
    );
    expect(imageSource).toContain('Size: 100x64');
    expect(imageSource).toContain('Data size: 25600 bytes');
    expect(imageSource).toContain('.w = 100');
    expect(imageSource).toContain('.h = 64');
    expect(imageSource).toContain('.stride = 400');
    expect(imageSource).toContain('.data_size = 25600');
    expect(imageSource).toContain(
      '.cf = LV_COLOR_FORMAT_ARGB8888',
    );
  });

  it('keeps native size when an image-button asset is also used by img', async () => {
    const outputDirectory = await mkdtemp(
      join(tmpdir(), 'lvgl-editor-shared-image-assets-'),
    );
    temporaryDirectories.push(outputDirectory);
    const source = await import('sharp').then(({ default: sharp }) =>
      sharp({
        create: {
          width: 32,
          height: 24,
          channels: 4,
          background: { r: 10, g: 20, b: 30, alpha: 1 },
        },
      }).png().toBuffer(),
    );
    const commonComponentFields = {
      x: 0,
      y: 0,
      width: 8,
      height: 8,
      children: [],
      styles: { default: {} },
      events: [],
      animations: [],
      parentId: null,
      locked: false,
      visible: true,
    };
    const project = {
      pages: [{
        id: 'page-1',
        name: 'Main',
        components: [
          {
            ...commonComponentFields,
            id: 'image-button-1',
            type: 'image-button',
            name: 'Mode Select',
            props: {
              states: [{
                id: 'state-1',
                name: 'Idle',
                imageId: 'shared-image',
                value: 0,
              }],
              initialState: 0,
              currentState: 0,
              value: 0,
              cycleOnClick: true,
            },
          },
          {
            ...commonComponentFields,
            id: 'image-1',
            type: 'img',
            name: 'Full Resolution Image',
            props: { src: 'shared-image' },
          },
        ],
      }],
      resources: {
        images: [{
          id: 'shared-image',
          name: 'Shared Image',
          originalName: 'shared.png',
          width: 32,
          height: 24,
          format: 'ARGB8888',
          data: `data:image/png;base64,${source.toString('base64')}`,
          cArrayName: 'img_shared',
          size: source.length,
          createdAt: 1,
        }],
        fonts: [],
      },
      communication: createDefaultCommunicationConfig(),
      logicGraphs: [],
    };

    await writeGeneratedProjectSource(project, outputDirectory);

    const imageSource = await readFile(
      join(outputDirectory, 'img_shared.c'),
      'utf8',
    );
    expect(imageSource).toContain('Size: 32x24');
    expect(imageSource).toContain('Data size: 3072 bytes');
  });
});
