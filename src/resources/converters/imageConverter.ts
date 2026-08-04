// Image to C Array Converter for LVGL

import type { ImageFormat, ImageConversionOptions } from '../types';

/**
 * Format actually written to the C array. `RGB565A8` has no editor-facing
 * equivalent: it is what a transparent image requested as RGB565 has to become
 * on LVGL v9 so the alpha channel survives.
 */
export type EmittedImageFormat = ImageFormat | 'RGB565A8';

export interface ConvertedImage {
  cCode: string;
  dataSize: number;
  width: number;
  height: number;
  /** The format written to the C array, which may differ from the requested one. */
  format: EmittedImageFormat;
  /** True when the requested format could not carry the source's alpha channel. */
  formatUpgraded: boolean;
}

/**
 * Get LVGL color format constant (v8)
 */
function getLvglColorFormatV8(format: EmittedImageFormat): string {
  switch (format) {
    case 'ARGB8888':
      return 'LV_IMG_CF_TRUE_COLOR_ALPHA';
    default:
      return 'LV_IMG_CF_TRUE_COLOR';
  }
}

/**
 * Get LVGL v9 color format constant
 */
function getLvglColorFormatV9(format: EmittedImageFormat): string {
  switch (format) {
    case 'RGB565':
      return 'LV_COLOR_FORMAT_RGB565';
    case 'RGB565A8':
      return 'LV_COLOR_FORMAT_RGB565A8';
    case 'RGB888':
      return 'LV_COLOR_FORMAT_RGB888';
    case 'ARGB8888':
      return 'LV_COLOR_FORMAT_ARGB8888';
    default:
      return 'LV_COLOR_FORMAT_ARGB8888';
  }
}

/**
 * Get bytes per pixel for format
 *
 * RGB565A8 is planar — a w*h*2 color plane followed by a w*h alpha plane — so
 * it averages 3 bytes per pixel even though its row stride is only w*2.
 */
function getBytesPerPixel(format: EmittedImageFormat): number {
  switch (format) {
    case 'RGB565':
      return 2;
    case 'RGB565A8':
      return 3;
    case 'RGB888':
      return 3;
    case 'ARGB8888':
      return 4;
    default:
      return 4;
  }
}

/**
 * Row stride in bytes.
 *
 * LVGL derives an RGB565A8 stride from the color plane alone (see
 * `img_width_to_stride` in lv_image_decoder.c) and assumes the alpha plane uses
 * exactly half of it, so the descriptor must report `w * 2`, not `w * 3`.
 */
function getStride(format: EmittedImageFormat, width: number): number {
  return format === 'RGB565A8' ? width * 2 : width * getBytesPerPixel(format);
}

/**
 * True when any pixel is not fully opaque.
 */
function hasTransparency(imageData: ImageData): boolean {
  const { data } = imageData;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
}

/**
 * Pick the format actually written to the C array.
 *
 * RGB565 and RGB888 have no alpha channel, so emitting them for a transparent
 * source silently flattens the transparency: previously-invisible pixels became
 * opaque and painted over whatever sat behind the image. Promote instead.
 */
export function resolveEmittedFormat(
  requested: ImageFormat,
  sourceHasAlpha: boolean,
  lvglVersion: '8' | '9',
): EmittedImageFormat {
  if (!sourceHasAlpha || requested === 'ARGB8888') return requested;
  // v8's LV_IMG_CF_TRUE_COLOR_ALPHA layout depends on LV_COLOR_DEPTH, so the
  // only alpha-carrying format we can emit portably there is ARGB8888.
  if (requested === 'RGB565' && lvglVersion === '9') return 'RGB565A8';
  return 'ARGB8888';
}

/**
 * Convert RGB to RGB565
 */
function rgbToRgb565(r: number, g: number, b: number, swapBytes: boolean): [number, number] {
  const r5 = (r >> 3) & 0x1F;
  const g6 = (g >> 2) & 0x3F;
  const b5 = (b >> 3) & 0x1F;
  
  const rgb565 = (r5 << 11) | (g6 << 5) | b5;
  
  if (swapBytes) {
    return [(rgb565 >> 8) & 0xFF, rgb565 & 0xFF];
  }
  return [rgb565 & 0xFF, (rgb565 >> 8) & 0xFF];
}

/**
 * Convert image data to specified format
 */
function convertPixelData(
  imageData: ImageData,
  format: EmittedImageFormat,
  options: ImageConversionOptions
): Uint8Array {
  const { width, height, data } = imageData;
  const bpp = getBytesPerPixel(format);
  const outputSize = width * height * bpp;
  const output = new Uint8Array(outputSize);

  let outIdx = 0;
  // RGB565A8 is planar: the alpha bytes follow the whole color plane.
  let alphaIdx = width * height * 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      switch (format) {
        case 'RGB565': {
          const [b1, b2] = rgbToRgb565(r, g, b, options.swapBytes);
          output[outIdx++] = b1;
          output[outIdx++] = b2;
          break;
        }
        case 'RGB565A8': {
          const [b1, b2] = rgbToRgb565(r, g, b, options.swapBytes);
          output[outIdx++] = b1;
          output[outIdx++] = b2;
          output[alphaIdx++] = a;
          break;
        }
        case 'RGB888': {
          output[outIdx++] = b;
          output[outIdx++] = g;
          output[outIdx++] = r;
          break;
        }
        case 'ARGB8888': {
          output[outIdx++] = b;
          output[outIdx++] = g;
          output[outIdx++] = r;
          output[outIdx++] = a;
          break;
        }
      }
    }
  }

  return output;
}

/**
 * Format byte array as C code
 */
function formatAsCArray(data: Uint8Array, bytesPerLine: number = 16): string {
  const lines: string[] = [];
  
  for (let i = 0; i < data.length; i += bytesPerLine) {
    const chunk = Array.from(data.slice(i, i + bytesPerLine));
    const hexValues = chunk.map(b => `0x${b.toString(16).padStart(2, '0').toUpperCase()}`);
    lines.push('    ' + hexValues.join(', ') + ',');
  }
  
  return lines.join('\n');
}

/**
 * Generate C code for LVGL image
 */
export function generateImageCCode(
  name: string,
  imageData: ImageData,
  options: ImageConversionOptions,
  lvglVersion: '8' | '9' = '9'
): ConvertedImage {
  const { width, height } = imageData;
  const sourceHasAlpha = hasTransparency(imageData);
  const format = resolveEmittedFormat(options.format, sourceHasAlpha, lvglVersion);
  const formatUpgraded = format !== options.format;
  const pixelData = convertPixelData(imageData, format, options);
  const dataSize = pixelData.length;

  const dataArrayName = `${name}_data`;
  const dataArray = formatAsCArray(pixelData);
  const formatComment = formatUpgraded
    ? `${format} (requested ${options.format}, promoted to keep the alpha channel)`
    : format;

  let cCode: string;

  if (lvglVersion === '9') {
    const cfFormat = getLvglColorFormatV9(format);
    const stride = getStride(format, width);
    cCode = `/**
 * Image: ${name}
 * Size: ${width}x${height}
 * Format: ${formatComment}
 * Data size: ${dataSize} bytes
 * Generated by LVGL UI Editor
 */

#include "lvgl.h"

#ifndef LV_ATTRIBUTE_MEM_ALIGN
#define LV_ATTRIBUTE_MEM_ALIGN
#endif

#ifndef LV_ATTRIBUTE_IMG_${name.toUpperCase()}
#define LV_ATTRIBUTE_IMG_${name.toUpperCase()}
#endif

static LV_ATTRIBUTE_MEM_ALIGN LV_ATTRIBUTE_IMG_${name.toUpperCase()} const uint8_t ${dataArrayName}[] = {
${dataArray}
};

const lv_image_dsc_t ${name} = {
    .header = {
        .magic = LV_IMAGE_HEADER_MAGIC,
        .cf = ${cfFormat},
        .flags = 0,
        .w = ${width},
        .h = ${height},
        .stride = ${stride},
    },
    .data_size = ${dataSize},
    .data = ${dataArrayName},
};
`;
  } else {
    const cfFormat = getLvglColorFormatV8(format);
    cCode = `/**
 * Image: ${name}
 * Size: ${width}x${height}
 * Format: ${formatComment}
 * Data size: ${dataSize} bytes
 * Generated by LVGL UI Editor
 */

#ifndef LV_ATTRIBUTE_MEM_ALIGN
#define LV_ATTRIBUTE_MEM_ALIGN
#endif

#ifndef LV_ATTRIBUTE_IMG_${name.toUpperCase()}
#define LV_ATTRIBUTE_IMG_${name.toUpperCase()}
#endif

static LV_ATTRIBUTE_MEM_ALIGN LV_ATTRIBUTE_IMG_${name.toUpperCase()} const uint8_t ${dataArrayName}[] = {
${dataArray}
};

const lv_img_dsc_t ${name} = {
    .header = {
        .cf = ${cfFormat},
        .always_zero = 0,
        .reserved = 0,
        .w = ${width},
        .h = ${height},
    },
    .data_size = ${dataSize},
    .data = ${dataArrayName},
};
`;
  }

  return {
    cCode,
    dataSize,
    width,
    height,
    format,
    formatUpgraded,
  };
}

/**
 * Load image from base64 and get ImageData
 */
export async function loadImageFromBase64(base64Data: string): Promise<{
  imageData: ImageData;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      
      resolve({
        imageData,
        width: img.width,
        height: img.height,
      });
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    // Handle both raw base64 and data URL
    if (base64Data.startsWith('data:')) {
      img.src = base64Data;
    } else {
      img.src = `data:image/png;base64,${base64Data}`;
    }
  });
}

/**
 * Convert image file to base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Get image dimensions from base64
 */
export async function getImageDimensions(base64Data: string): Promise<{
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height,
      });
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    if (base64Data.startsWith('data:')) {
      img.src = base64Data;
    } else {
      img.src = `data:image/png;base64,${base64Data}`;
    }
  });
}

/**
 * Default conversion options
 */
export const DEFAULT_IMAGE_OPTIONS: ImageConversionOptions = {
  format: 'ARGB8888',
  dither: false,
  compress: false,
  swapBytes: false,
};
