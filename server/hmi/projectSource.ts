import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { generateCode } from '../../src/codegen/generator';
import { generateHmiBindings } from '../../src/codegen/hmiBindingGenerator';
import {
  DEFAULT_IMAGE_OPTIONS,
  generateImageCCode,
} from '../../src/resources/converters/imageConverter';
import type { ProjectFile } from '../../src/resources/types';
import type { ImageResource } from '../../src/resources/types';
import type { LvglComponent, Page } from '../../src/types';
import type { CommunicationConfig } from '../../src/types/hmi';
import { isRecord } from './validation';

interface ImageGenerationPlan {
  image: ImageResource;
  /**
   * Image-button sources are stretched to the widget bounds by generated UI
   * code, so retaining pixels beyond the largest fixed-size use only consumes
   * target Flash. Undefined means at least one use requires native resolution.
   */
  targetSize?: {
    width: number;
    height: number;
  };
}

function asProjectFile(project: Record<string, unknown>): ProjectFile {
  if (!Array.isArray(project.pages)) {
    throw new Error('project.pages must be an array');
  }
  if (!isRecord(project.resources)) {
    throw new Error('project.resources must be an object');
  }
  if (!isRecord(project.communication)) {
    throw new Error('project.communication must be an object');
  }

  return project as unknown as ProjectFile;
}

function collectUsedImageResources(
  pages: Page[],
  imageResources: ImageResource[],
): ImageGenerationPlan[] {
  const plans = new Map<string, ImageGenerationPlan>();
  const findImage = (reference: string | undefined) =>
    reference
      ? imageResources.find(
          (image) =>
            image.id === reference ||
            image.name === reference ||
            image.cArrayName === reference,
        )
      : undefined;
  const retainNativeSize = (image: ImageResource) => {
    plans.set(image.id, { image });
  };
  const addFixedImageButtonUse = (
    image: ImageResource,
    component: LvglComponent,
  ) => {
    const widthMode = component.widthMode ?? 'px';
    const heightMode = component.heightMode ?? 'px';
    const width = Math.trunc(component.width);
    const height = Math.trunc(component.height);
    if (
      widthMode !== 'px'
      || heightMode !== 'px'
      || !Number.isFinite(width)
      || !Number.isFinite(height)
      || width <= 0
      || height <= 0
    ) {
      retainNativeSize(image);
      return;
    }

    const existing = plans.get(image.id);
    if (existing && !existing.targetSize) {
      return;
    }
    plans.set(image.id, {
      image,
      targetSize: {
        width: Math.max(existing?.targetSize?.width ?? 0, width),
        height: Math.max(existing?.targetSize?.height ?? 0, height),
      },
    });
  };
  const walk = (components: LvglComponent[]) => {
    for (const component of components) {
      if (component.type === 'img') {
        const image = findImage(component.props?.src);
        if (image) retainNativeSize(image);
      } else if (
        component.type === 'image-button' &&
        Array.isArray(component.props?.states)
      ) {
        for (const state of component.props.states) {
          const reference =
            state && typeof state === 'object'
              ? (state as { imageId?: string }).imageId
              : undefined;
          const image = findImage(reference);
          if (image) addFixedImageButtonUse(image, component);
        }
      }
      walk(component.children ?? []);
    }
  };

  for (const page of pages) walk(page.components);
  return imageResources.flatMap((image) => {
    const plan = plans.get(image.id);
    return plan ? [plan] : [];
  });
}

function decodeBase64Resource(data: string): Buffer {
  const separator = data.indexOf(',');
  const payload = data.startsWith('data:') && separator >= 0
    ? data.slice(separator + 1)
    : data;
  return Buffer.from(payload, 'base64');
}

async function generateImageSource(
  image: ImageResource,
  targetSize?: ImageGenerationPlan['targetSize'],
): Promise<string> {
  const input = decodeBase64Resource(image.data);
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not determine dimensions for image "${image.name}"`);
  }
  const outputWidth = targetSize
    ? Math.min(metadata.width, targetSize.width)
    : metadata.width;
  const outputHeight = targetSize
    ? Math.min(metadata.height, targetSize.height)
    : metadata.height;
  let pipeline = sharp(input);
  if (
    outputWidth !== metadata.width
    || outputHeight !== metadata.height
  ) {
    pipeline = pipeline.resize(outputWidth, outputHeight, {
      fit: 'fill',
    });
  }
  const decoded = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const imageData = {
    width: decoded.info.width,
    height: decoded.info.height,
    data: Uint8ClampedArray.from(decoded.data),
  } as ImageData;

  return generateImageCCode(image.cArrayName, imageData, {
    ...DEFAULT_IMAGE_OPTIONS,
    format: image.format,
  }, '9').cCode;
}

export async function writeGeneratedProjectSource(
  project: Record<string, unknown>,
  projectSourceDirectory: string,
): Promise<string[]> {
  const projectFile = asProjectFile(project);
  const pages = projectFile.pages as Page[];
  const communication = projectFile.communication as CommunicationConfig;
  const imageResources = projectFile.resources.images ?? [];
  const fontResources = projectFile.resources.fonts ?? [];
  const lvglConfig = projectFile.lvglConfig;
  const logicGraphs = projectFile.logicGraphs ?? [];
  const codeOptions = { lvglVersion: '9' as const };

  const generatedCode = generateCode(
    pages,
    codeOptions,
    logicGraphs,
    undefined,
    imageResources,
    fontResources,
    lvglConfig?.defaultFont,
    lvglConfig?.defaultFontSize,
    lvglConfig?.useBuiltinSymbols,
    lvglConfig?.symbolFont,
  );
  const generatedBindings = generateHmiBindings(
    pages,
    communication,
    codeOptions,
    logicGraphs,
  );
  const generatedFiles: Record<string, string> = {
    ...generatedCode,
    ...generatedBindings,
  };

  for (const plan of collectUsedImageResources(pages, imageResources)) {
    generatedFiles[`${plan.image.cArrayName}.c`] =
      await generateImageSource(plan.image, plan.targetSize);
  }

  await mkdir(projectSourceDirectory, { recursive: true });
  await Promise.all(
    Object.entries(generatedFiles).map(([fileName, content]) =>
      writeFile(join(projectSourceDirectory, fileName), content, 'utf-8'),
    ),
  );
  await writeFile(
    join(projectSourceDirectory, 'project.json'),
    `${JSON.stringify(project, null, 2)}\n`,
    'utf-8',
  );

  return Object.keys(generatedFiles);
}
