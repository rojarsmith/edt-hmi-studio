// ui.c template generator

import type {
  Screen, LvglComponent, StyleProps, Theme, Animation, AnimationEasing, LvglStyleState,
} from '../../types';
import { isArcPart, partSelector, widgetParts } from '../../utils/widgetParts';
import { screensHaveVideo, screensHaveType } from '../../utils/videoWidgets';
import { normalizeQrcodeProps } from '../../utils/qrcodeModel';
import { normalizeVideoProps } from '../../utils/videoPlaylist';
import type { CodeGenOptions } from '../types';
import type { ImageResource, FontResource } from '../../resources/types';
import { collectUsedCustomFonts } from '../fontUsage';
import { deriveTypographies } from '../typography';
import { resolveText } from '../textResources';
import { effectiveTypographyId, standInProp } from '../../utils/componentText';
import { getEntryScreen } from '../../utils/entryScreen';
import {
  DEFAULT_LINE_WIDTH,
  lineBox,
  normalizeLinePoints,
  pointsInBox,
} from '../../utils/lineGeometry';
import {
  isConvexPolygon,
  normalizePolygonPoints,
  pointsInPolygonBox,
} from '../../utils/polygonGeometry';
import {
  DEFAULT_END_ANGLE,
  DEFAULT_START_ANGLE,
  normalizeSweep,
} from '../../utils/circleGeometry';
import {
  ANIM_WRAPPERS,
  ANIM_DIRECT_SETTERS,
  animCompletedFuncName,
  animStartFuncName,
  animStopFuncName,
  collectAnimationSymbols,
  hasCompletedBindings,
  type AnimationSymbol,
} from '../animationSymbols';
import {
  trackDistance,
  trackParkValue,
  trackValueMode,
} from '../../utils/animationValues';
import {
  languageDifferences,
  overriddenLanguages,
  resolveTypographyStyle,
  type ResolvedTypographyStyle,
} from '../../utils/typographyStyle';
import type { Typography, TextResource, ProjectLanguage, TranslatableProp } from '../../types';

/** A typography style symbol and whether its font is custom. */
interface TypographyBinding {
  symbol: string;
  customFont: boolean;
}

/** A translation tag and the widget prop it stands in for. */
interface TranslationBinding {
  tag: string;
  prop: TranslatableProp;
}
import {
  getScreenVarName,
  getComponentVarName,
  getScreenInitFuncName,
  getScreenLoadFuncName,
  getEventHandlerName,
  colorToLvgl,
  opacityToLvgl,
  escapeCString,
} from '../utils/nameUtils';
import {
  generateInclude,
  generateSectionHeader,
  getIndent,
  generateComment,
  generateUserCodeSection,
} from '../formatters/cFormatter';

interface ImageButtonState {
  id?: string;
  name?: string;
  imageId?: string;
  value?: number;
}

function getImageButtonStates(component: LvglComponent): ImageButtonState[] {
  const states = Array.isArray(component.props?.states)
    ? component.props.states.filter(
        (state: unknown): state is ImageButtonState =>
          typeof state === 'object' && state !== null,
      )
    : [];

  return states.length > 0 ? states : [{ value: 0 }];
}

function getImageButtonInitialState(
  component: LvglComponent,
  stateCount: number,
): number {
  const requested = Number.isFinite(component.props?.initialState)
    ? Math.trunc(component.props.initialState)
    : 0;
  return Math.max(0, Math.min(Math.max(0, stateCount - 1), requested));
}

function getImageResource(
  imageId: string | undefined,
  imageResources: ImageResource[],
): ImageResource | undefined {
  if (!imageId) return undefined;
  return imageResources.find(
    (image) =>
      image.id === imageId ||
      image.name === imageId ||
      image.cArrayName === imageId,
  );
}

function finiteInt32(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(-2147483648, Math.min(2147483647, Math.trunc(value)));
}

/**
 * Get LVGL create function for component type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCreateFunction(type: string, parentVar: string, options: CodeGenOptions, props?: Record<string, any>): string {
  const isV9 = options.lvglVersion === '9';

  const createFuncs: Record<string, string> = {
    btn: 'lv_btn_create',
    label: 'lv_label_create',
    img: isV9 ? 'lv_image_create' : 'lv_img_create',
    'image-button': isV9 ? 'lv_image_create' : 'lv_img_create',
    line: 'lv_line_create',
    // A polygon is a closed line, plus a fill drawn under it. LVGL has no
    // polygon widget and no filled-polygon primitive - see
    // generatePolygonFillSupport.
    polygon: 'lv_line_create',
    textarea: 'lv_textarea_create',
    dropdown: 'lv_dropdown_create',
    checkbox: 'lv_checkbox_create',
    switch: 'lv_switch_create',
    slider: 'lv_slider_create',
    // A shape has no widget of its own in LVGL: a plain object with the
    // shape's fill, border and radius styles is exactly a rectangle, and one
    // with a circular radius is a disc.
    rectangle: 'lv_obj_create',
    circle: props?.shape === 'sector' ? 'lv_arc_create' : 'lv_obj_create',
    obj: 'lv_obj_create',
    tabview: 'lv_tabview_create',
    tileview: 'lv_tileview_create',
    win: 'lv_win_create',
    bar: 'lv_bar_create',
    arc: 'lv_arc_create',
    spinner: 'lv_spinner_create',
    chart: 'lv_chart_create',
    table: 'lv_table_create',
    calendar: 'lv_calendar_create',
    // A video is a plain object: the black frame the picture is drawn into.
    // What fills it is the runtime's, not the widget's — hmi_video_attach puts
    // the image and the message label inside this box. See
    // docs/video-playback.md §5.
    video: 'lv_obj_create',
    // A QR code is a canvas the generated renderer paints modules into.
    qrcode: 'lv_canvas_create',
  };
  
  const func = createFuncs[type] || 'lv_obj_create';
  
  // Special cases with version-dependent signatures
  if (type === 'tabview') {
    if (isV9) {
      return `lv_tabview_create(${parentVar})`;
    }
    const position = props?.tabPosition || 'top';
    const dirMap: Record<string, string> = {
      'top': 'LV_DIR_TOP',
      'bottom': 'LV_DIR_BOTTOM',
      'left': 'LV_DIR_LEFT',
      'right': 'LV_DIR_RIGHT',
    };
    return `lv_tabview_create(${parentVar}, ${dirMap[position] || 'LV_DIR_TOP'}, 50)`;
  }
  if (type === 'spinner') {
    if (isV9) {
      return `lv_spinner_create(${parentVar})`;
    }
    const speed = props?.speed || 1000;
    const arcLength = props?.arcLength || 60;
    return `lv_spinner_create(${parentVar}, ${speed}, ${arcLength})`;
  }
  if (type === 'win') {
    if (isV9) {
      return `lv_win_create(${parentVar})`;
    }
    return `lv_win_create(${parentVar}, 40)`;
  }
  
  return `${func}(${parentVar})`;
}

const QRCODE_SUPPORT_SOURCE = `
/**
 * The QrCode widgets' renderer, shared by every one of them.
 *
 * Generated rather than shipped in a board runtime because it is pure
 * software — the same code runs on every board and in the Emulator — and
 * because it calls the QR encoder LVGL bundles (qrcodegen) directly. LVGL's
 * own lv_qrcode wrapper is not used: it pins the error-correction level to
 * MEDIUM and picks the version itself, and both are settings this widget
 * hands to the user.
 *
 * The widget is an lv_canvas. Each render allocates an indexed 1-bit draw
 * buffer sized to the code plus the standard's 4-module quiet zone, paints
 * the palette from the widget's own colours, and sets the dark modules bit
 * by bit. A render happens at startup and again only when communication
 * replaces the content — never per frame.
 */
typedef struct {
    uint8_t min_version;   /* 1..40; == max_version when the version is pinned */
    uint8_t max_version;
    uint8_t ecc;           /* qrcodegen_Ecc_* */
    uint8_t scale;         /* pixels per module */
    bool quiet;            /* draw the standard's 4-module clear margin */
    uint32_t dark;         /* 0xRRGGBB */
    uint32_t light;
    char text[129];        /* the longest string a 64-register read carries */
} ui_qrcode_context_t;

/* Work areas for the encoder, sized for version 40, shared: rendering is
   synchronous and one at a time. */
static uint8_t ui_qrcode_modules[qrcodegen_BUFFER_LEN_MAX];
static uint8_t ui_qrcode_scratch[qrcodegen_BUFFER_LEN_MAX];

static void ui_qrcode_apply(lv_obj_t *canvas, ui_qrcode_context_t *context)
{
    bool encoded;
    int qr_size;
    int32_t px;
    lv_draw_buf_t *draw_buf;
    lv_draw_buf_t *previous;

    if (context->text[0] == 0) {
        /* Nothing to encode: show the widget's background and nothing else.
           The encoder would gladly make a code out of an empty string, and a
           phone can do nothing with that code. The image source is cleared
           rather than the draw buffer: a canvas will not take a NULL buffer,
           so any previous one stays owned by it until the next real code
           replaces it. */
        lv_image_set_src(canvas, NULL);
        lv_obj_invalidate(canvas);
        return;
    }

    encoded = qrcodegen_encodeText(
        context->text,
        ui_qrcode_scratch,
        ui_qrcode_modules,
        (enum qrcodegen_Ecc)context->ecc,
        context->min_version,
        context->max_version,
        qrcodegen_Mask_AUTO,
        true);
    if (!encoded) {
        /* Content that does not fit the pinned version leaves the last
           picture up: half a code is worse than yesterday's code. */
        return;
    }

    qr_size = qrcodegen_getSize(ui_qrcode_modules);
    px = (int32_t)(qr_size + (context->quiet ? 8 : 0)) * context->scale;

    previous = lv_canvas_get_draw_buf(canvas);
    draw_buf = lv_draw_buf_create((uint32_t)px, (uint32_t)px, LV_COLOR_FORMAT_I1, LV_STRIDE_AUTO);
    if (draw_buf == NULL) {
        return;
    }
    lv_draw_buf_clear(draw_buf, NULL);
    lv_canvas_set_draw_buf(canvas, draw_buf);
    if (previous != NULL) {
        lv_draw_buf_destroy(previous);
    }
    lv_canvas_set_palette(canvas, 0, lv_color32_make(
        (uint8_t)(context->light >> 16), (uint8_t)(context->light >> 8), (uint8_t)context->light, 0xFF));
    lv_canvas_set_palette(canvas, 1, lv_color32_make(
        (uint8_t)(context->dark >> 16), (uint8_t)(context->dark >> 8), (uint8_t)context->dark, 0xFF));

    /* Dark modules, one bit per pixel, MSB first — the I1 layout. The first
       8 bytes of the buffer are the palette. */
    {
        uint8_t *pixels = draw_buf->data + 8;
        uint32_t stride = draw_buf->header.stride;
        int margin = context->quiet ? 4 : 0;
        int module_y;

        for (module_y = 0; module_y < qr_size; module_y++) {
            int module_x;
            for (module_x = 0; module_x < qr_size; module_x++) {
                int y0;
                if (!qrcodegen_getModule(ui_qrcode_modules, module_x, module_y)) {
                    continue;
                }
                for (y0 = 0; y0 < context->scale; y0++) {
                    int32_t y = ((int32_t)module_y + margin) * context->scale + y0;
                    int x0;
                    for (x0 = 0; x0 < context->scale; x0++) {
                        int32_t x = ((int32_t)module_x + margin) * context->scale + x0;
                        pixels[(uint32_t)y * stride + ((uint32_t)x >> 3)] |=
                            (uint8_t)(0x80U >> ((uint32_t)x & 7U));
                    }
                }
            }
        }
    }

    lv_image_cache_drop(draw_buf);
    lv_obj_invalidate(canvas);
}

/**
 * A new string for one QR code, from communication. Redraws only when the
 * words actually changed: polls repeat, pictures should not.
 */
static void ui_qrcode_set_text(
    lv_obj_t *canvas, ui_qrcode_context_t *context, const char *text)
{
    if ((text == NULL) || (text[0] == 0)) {
        return;
    }
    if (lv_strcmp(context->text, text) == 0) {
        return;
    }
    lv_strlcpy(context->text, text, sizeof(context->text));
    ui_qrcode_apply(canvas, context);
}
`;

const QRCODE_ECC_ENUM: Record<string, string> = {
  L: 'qrcodegen_Ecc_LOW',
  M: 'qrcodegen_Ecc_MEDIUM',
  Q: 'qrcodegen_Ecc_QUARTILE',
  H: 'qrcodegen_Ecc_HIGH',
};

/**
 * One QR code's settings and starting content, resolved at generation time.
 *
 * The content is resolved to English on purpose: a QR code is scanned by a
 * phone, not read by the operator, and the address behind it does not switch
 * with the panel's language. What can change it at run time is communication,
 * through the widget's `_qr_set_text` below.
 */
function qrcodeContextDeclaration(
  varName: string,
  component: LvglComponent,
  texts: TextResource[],
  languages: ProjectLanguage[],
): string {
  const settings = normalizeQrcodeProps(component.props);
  let content = settings.literal;
  if (settings.source === 'text') {
    const resource = texts.find((text) => text.id === settings.textId);
    content = resource
      ? resolveText(resource, 'en', languages.map((language) => language.code))
      : '';
  }
  const minVersion = settings.version === 0 ? 1 : settings.version;
  const maxVersion = settings.version === 0 ? 40 : settings.version;
  const dark = (component.styles.default.textColor ?? '#000000').replace('#', '0x');
  const light = (component.styles.default.bgColor ?? '#ffffff').replace('#', '0x');

  return [
    `static ui_qrcode_context_t ${varName}_qr = {`,
    `    .min_version = ${minVersion}U,`,
    `    .max_version = ${maxVersion}U,`,
    `    .ecc = ${QRCODE_ECC_ENUM[settings.ecc] ?? 'qrcodegen_Ecc_MEDIUM'},`,
    `    .scale = ${settings.scale}U,`,
    `    .quiet = ${settings.quietZone ? 'true' : 'false'},`,
    `    .dark = ${dark}U,`,
    `    .light = ${light}U,`,
    `    .text = "${escapeCString(content)}",`,
    '};',
    '',
    `void ${varName}_qr_set_text(lv_obj_t *object, const char *text)`,
    '{',
    `    ui_qrcode_set_text(object, &${varName}_qr, text);`,
    '}',
  ].join('\n');
}

/**
 * What a video plays, as the constant table the runtime reads it from.
 *
 * A list is an array of C strings and a count; a folder scan is a folder and
 * no array. Paths are already normalised to forward slashes by the time they
 * get here — that is the form FatFs takes, and the editor accepted either
 * slash so a Windows user could type what their own screen shows. An empty
 * list is still emitted, with no files and no folder, so the panel is the
 * thing that reports it.
 */
function videoPlaylistDeclaration(varName: string, component: LvglComponent): string {
  const playlist = normalizeVideoProps(component.props);
  const lines: string[] = [];
  const scanning = playlist.source === 'folder';

  if (!scanning && playlist.files.length > 0) {
    lines.push(`static const char *const ${varName}_files[] = {`);
    for (const file of playlist.files) {
      lines.push(`    "${escapeCString(file)}",`);
    }
    lines.push('};');
  }
  lines.push(`static const hmi_video_playlist_t ${varName}_playlist = {`);
  lines.push(`    .files = ${!scanning && playlist.files.length > 0 ? `${varName}_files` : 'NULL'},`);
  lines.push(`    .count = ${scanning ? 0 : playlist.files.length}U,`);
  lines.push(`    .folder = ${scanning ? `"${escapeCString(playlist.folder)}"` : 'NULL'},`);
  lines.push(`    .auto_play = ${playlist.autoPlay ? 'true' : 'false'},`);
  lines.push(`    .loop = ${playlist.loop ? 'true' : 'false'},`);
  lines.push(`    .shuffle = ${playlist.shuffle ? 'true' : 'false'},`);
  lines.push('};');
  return lines.join('\n');
}

/**
 * A widget's default styles, minus the ones that would paint a box it does not
 * have. Only a line qualifies: LVGL would happily draw a border and a fill
 * around the stroke, which is the area the editor refuses to give it. Older
 * projects carry those styles from when a line was a Basic widget, so this
 * drops them at generation rather than migrating anyone's file.
 */
function withoutBoxStyles(component: LvglComponent): StyleProps {
  const styles = component.styles.default;
  if (component.type === 'circle') {
    // The disc's radius is the shape, set from the props; a sector is an arc,
    // which draws its colour through arc_color and has no box at all.
    const { borderRadius: _r, ...rest } = styles;
    if (component.props?.shape !== 'sector') return rest;
    const {
      bgColor: _bg,
      bgGradColor: _grad,
      bgGradDir: _dir,
      borderColor: _bc,
      borderWidth: _bw,
      padding: _pad,
      ...arcRest
    } = rest;
    return { ...arcRest, bgColor: 'transparent', borderWidth: 0 };
  }
  if (component.type === 'arc' || component.type === 'spinner') {
    // An arc's box is not what anyone is styling: these rows are read as the
    // arc's colour and thickness instead, by generateArcWidgetStyles. Left in
    // the box styles they draw a frame around the arc, which is what a
    // spinner given an accent colour used to come out as.
    const {
      bgColor: _arcBg,
      bgGradColor: _arcGrad,
      bgGradDir: _arcGradDir,
      borderColor: _arcBorder,
      borderWidth: _arcBorderWidth,
      borderRadius: _arcRadius,
      ...arcRest
    } = styles;
    return { ...arcRest, bgColor: 'transparent', borderWidth: 0 };
  }
  if (component.type !== 'line' && component.type !== 'polygon') return styles;
  const {
    bgColor: _bgColor,
    bgGradColor: _bgGradColor,
    bgGradDir: _bgGradDir,
    borderColor: _borderColor,
    borderWidth: _borderWidth,
    borderSide: _borderSide,
    borderRadius: _borderRadius,
    padding: _padding,
    ...rest
  } = styles;
  return { ...rest, bgColor: 'transparent', borderWidth: 0 };
}

/**
 * The points a line is drawn from, placed in its box the way the editor places
 * them, so the panel draws what the canvas showed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generatedLinePoints(props: Record<string, any>): number[][] {
  const points = normalizeLinePoints(props?.points);
  const width = props?.lineWidth ?? DEFAULT_LINE_WIDTH;
  return pointsInBox(points, lineBox(points, width)).map(([x, y]) => [
    Math.round(x),
    Math.round(y),
  ]);
}

/**
 * The points a polygon is drawn from, placed in its box the way the editor
 * places them, and closed: the first point is repeated at the end because
 * `lv_line_set_points` draws an open polyline.
 *
 * Rounded on the way out. `lv_point_precise_t` is a float only when a build
 * sets `LV_USE_FLOAT`, and this firmware does not - the editor keeps the
 * precision it was drawn at, and the panel gets whole pixels.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generatedPolygonPoints(props: Record<string, any>): number[][] {
  const points = pointsInPolygonBox(normalizePolygonPoints(props?.points))
    .map(([x, y]) => [Math.round(x), Math.round(y)]);
  return [...points, points[0]];
}

/** Whether this polygon's fill can be drawn, and what colour it is. */
function polygonFill(component: LvglComponent): string | null {
  if (component.type !== 'polygon') return null;
  const color = component.styles.default.bgColor;
  if (!color || color === 'transparent') return null;
  // A triangle fan covers a convex outline only. A concave one is drawn as an
  // outline here exactly as it is on the canvas, rather than filled with a
  // shape nobody asked for.
  const points = normalizePolygonPoints(component.props?.points);
  return isConvexPolygon(points) ? color : null;
}

/** The file-scope array `lv_line_set_points` will hold a pointer to. */
function linePointsDeclaration(
  varName: string,
  comp: LvglComponent,
  options: CodeGenOptions,
): string {
  const pointType = options.lvglVersion === '9' ? 'lv_point_precise_t' : 'lv_point_t';
  const points = comp.type === 'polygon'
    ? generatedPolygonPoints(comp.props || {})
    : generatedLinePoints(comp.props || {});
  const values = points.map(([x, y]) => `{${x}, ${y}}`).join(', ');
  return `static ${pointType} ${varName}_points[${points.length}] = {${values}};`;
}

/**
 * The one callback every filled polygon shares, and the record each of them
 * hands it.
 *
 * LVGL has a filled triangle and no filled polygon, so a convex outline is
 * covered by a fan of n-2 triangles sharing its first point. It is drawn on
 * LV_EVENT_DRAW_MAIN_BEGIN - before the line widget strokes its own outline,
 * so the outline stays on top - and at the same origin lv_line draws from, so
 * fill and outline cannot drift apart.
 *
 * The colour travels as a plain integer rather than an lv_color_t because a
 * static initialiser cannot call lv_color_hex().
 */
function generatePolygonFillSupport(
  components: { comp: LvglComponent; varName: string }[],
  options: CodeGenOptions,
): string[] {
  const filled = components.filter(({ comp }) => polygonFill(comp) !== null);
  if (filled.length === 0) return [];

  const indent = getIndent(options);
  const lines: string[] = [];

  if (options.generateComments) {
    lines.push(generateSectionHeader('Polygon Fill', options));
    lines.push('');
  }

  lines.push('typedef struct {');
  lines.push(`${indent}const lv_point_precise_t *points;`);
  lines.push(`${indent}uint32_t point_cnt;`);
  lines.push(`${indent}uint32_t color;`);
  lines.push('} ui_polygon_fill_t;');
  lines.push('');
  lines.push('static void ui_polygon_fill_cb(lv_event_t *e) {');
  lines.push(`${indent}lv_obj_t *obj = lv_event_get_target(e);`);
  lines.push(`${indent}lv_layer_t *layer = lv_event_get_layer(e);`);
  lines.push(`${indent}const ui_polygon_fill_t *fill = lv_event_get_user_data(e);`);
  lines.push('');
  lines.push(`${indent}lv_area_t area;`);
  lines.push(`${indent}lv_obj_get_coords(obj, &area);`);
  lines.push(`${indent}int32_t x_ofs = area.x1 - lv_obj_get_scroll_x(obj);`);
  lines.push(`${indent}int32_t y_ofs = area.y1 - lv_obj_get_scroll_y(obj);`);
  lines.push('');
  lines.push(`${indent}lv_draw_triangle_dsc_t dsc;`);
  lines.push(`${indent}lv_draw_triangle_dsc_init(&dsc);`);
  lines.push(`${indent}dsc.color = lv_color_hex(fill->color);`);
  lines.push(`${indent}dsc.opa = lv_obj_get_style_opa(obj, LV_PART_MAIN);`);
  lines.push('');
  lines.push(`${indent}for (uint32_t i = 1; i + 1 < fill->point_cnt; i++) {`);
  lines.push(`${indent}${indent}dsc.p[0].x = fill->points[0].x + x_ofs;`);
  lines.push(`${indent}${indent}dsc.p[0].y = fill->points[0].y + y_ofs;`);
  lines.push(`${indent}${indent}dsc.p[1].x = fill->points[i].x + x_ofs;`);
  lines.push(`${indent}${indent}dsc.p[1].y = fill->points[i].y + y_ofs;`);
  lines.push(`${indent}${indent}dsc.p[2].x = fill->points[i + 1].x + x_ofs;`);
  lines.push(`${indent}${indent}dsc.p[2].y = fill->points[i + 1].y + y_ofs;`);
  lines.push(`${indent}${indent}lv_draw_triangle(layer, &dsc);`);
  lines.push(`${indent}}`);
  lines.push('}');
  lines.push('');

  for (const { comp, varName } of filled) {
    // point_cnt is one short of the array: the closing repeat is the outline's,
    // and a fan has no use for it.
    const closed = generatedPolygonPoints(comp.props || {});
    const color = (polygonFill(comp) ?? '#000000').replace('#', '0x');
    lines.push(
      `static const ui_polygon_fill_t ${varName}_fill = { ${varName}_points, ${closed.length - 1}, ${color} };`,
    );
  }
  lines.push('');

  return lines;
}

/**
 * Generate style code for a component
 */
/**
 * @param suppressText omit text properties because a typography's shared style
 *   already carries them. A local style would win over the added one, so the
 *   two must not both be emitted.
 */
function generateStyleCode(
  varName: string,
  styles: StyleProps,
  options: CodeGenOptions,
  selector: string = '0',
  defaultFont?: string,
  defaultFontSize?: number,
  suppressText: boolean = false
): string[] {
  const lines: string[] = [];
  const indent = getIndent(options);
  const isV9 = options.lvglVersion === '9';
  
  if (styles.bgColor) {
    if (styles.bgColor.toLowerCase() === 'transparent') {
      lines.push(`${indent}lv_obj_set_style_bg_opa(${varName}, LV_OPA_TRANSP, ${selector});`);
    } else {
      lines.push(`${indent}lv_obj_set_style_bg_color(${varName}, ${colorToLvgl(styles.bgColor)}, ${selector});`);
      lines.push(`${indent}lv_obj_set_style_bg_opa(${varName}, LV_OPA_COVER, ${selector});`);
    }
  }
  
  if (styles.borderColor) {
    lines.push(`${indent}lv_obj_set_style_border_color(${varName}, ${colorToLvgl(styles.borderColor)}, ${selector});`);
  }
  
  if (styles.borderWidth !== undefined) {
    lines.push(`${indent}lv_obj_set_style_border_width(${varName}, ${styles.borderWidth}, ${selector});`);
  }
  
  if (styles.borderRadius !== undefined) {
    lines.push(`${indent}lv_obj_set_style_radius(${varName}, ${styles.borderRadius}, ${selector});`);
  }
  
  if (styles.textColor) {
    lines.push(`${indent}lv_obj_set_style_text_color(${varName}, ${colorToLvgl(styles.textColor)}, ${selector});`);
  }
  
  if (styles.opacity !== undefined && styles.opacity < 1) {
    lines.push(`${indent}lv_obj_set_style_opa(${varName}, ${opacityToLvgl(styles.opacity)}, ${selector});`);
  }
  
  if (styles.padding !== undefined) {
    lines.push(`${indent}lv_obj_set_style_pad_all(${varName}, ${styles.padding}, ${selector});`);
  }

  // Padding four directions
  if (styles.paddingTop !== undefined) {
    lines.push(`${indent}lv_obj_set_style_pad_top(${varName}, ${styles.paddingTop}, ${selector});`);
  }
  if (styles.paddingBottom !== undefined) {
    lines.push(`${indent}lv_obj_set_style_pad_bottom(${varName}, ${styles.paddingBottom}, ${selector});`);
  }
  if (styles.paddingLeft !== undefined) {
    lines.push(`${indent}lv_obj_set_style_pad_left(${varName}, ${styles.paddingLeft}, ${selector});`);
  }
  if (styles.paddingRight !== undefined) {
    lines.push(`${indent}lv_obj_set_style_pad_right(${varName}, ${styles.paddingRight}, ${selector});`);
  }

  // Border side
  if (styles.borderSide && styles.borderSide !== 'full') {
    const borderSideMap: Record<string, string> = {
      'none': 'LV_BORDER_SIDE_NONE',
      'top': 'LV_BORDER_SIDE_TOP',
      'bottom': 'LV_BORDER_SIDE_BOTTOM',
      'left': 'LV_BORDER_SIDE_LEFT',
      'right': 'LV_BORDER_SIDE_RIGHT',
      'top_bottom': 'LV_BORDER_SIDE_TOP | LV_BORDER_SIDE_BOTTOM',
      'left_right': 'LV_BORDER_SIDE_LEFT | LV_BORDER_SIDE_RIGHT',
    };
    const sideVal = borderSideMap[styles.borderSide];
    if (sideVal) {
      lines.push(`${indent}lv_obj_set_style_border_side(${varName}, ${sideVal}, ${selector});`);
    }
  }

  // Background gradient
  if (styles.bgGradDir && styles.bgGradDir !== 'none') {
    const gradDirMap: Record<string, string> = {
      'hor': 'LV_GRAD_DIR_HOR',
      'ver': 'LV_GRAD_DIR_VER',
    };
    lines.push(`${indent}lv_obj_set_style_bg_grad_dir(${varName}, ${gradDirMap[styles.bgGradDir]}, ${selector});`);
    if (styles.bgGradColor) {
      lines.push(`${indent}lv_obj_set_style_bg_grad_color(${varName}, ${colorToLvgl(styles.bgGradColor)}, ${selector});`);
    }
    if (styles.bgGradStop !== undefined) {
      lines.push(`${indent}lv_obj_set_style_bg_grad_stop(${varName}, ${styles.bgGradStop}, ${selector});`);
    }
  }

  // Outline
  if (styles.outlineWidth !== undefined && styles.outlineWidth > 0) {
    lines.push(`${indent}lv_obj_set_style_outline_width(${varName}, ${styles.outlineWidth}, ${selector});`);
    if (styles.outlineColor) {
      lines.push(`${indent}lv_obj_set_style_outline_color(${varName}, ${colorToLvgl(styles.outlineColor)}, ${selector});`);
    }
    if (styles.outlinePad !== undefined) {
      lines.push(`${indent}lv_obj_set_style_outline_pad(${varName}, ${styles.outlinePad}, ${selector});`);
    }
  }

  // Shadow
  if (styles.shadowWidth !== undefined && styles.shadowWidth > 0) {
    lines.push(`${indent}lv_obj_set_style_shadow_width(${varName}, ${styles.shadowWidth}, ${selector});`);
    if (styles.shadowColor) {
      lines.push(`${indent}lv_obj_set_style_shadow_color(${varName}, ${colorToLvgl(styles.shadowColor)}, ${selector});`);
    }
    if (styles.shadowOffsetX !== undefined && styles.shadowOffsetX !== 0) {
      lines.push(`${indent}lv_obj_set_style_shadow_ofs_x(${varName}, ${styles.shadowOffsetX}, ${selector});`);
    }
    if (styles.shadowOffsetY !== undefined && styles.shadowOffsetY !== 0) {
      lines.push(`${indent}lv_obj_set_style_shadow_ofs_y(${varName}, ${styles.shadowOffsetY}, ${selector});`);
    }
    if (styles.shadowSpread !== undefined && styles.shadowSpread !== 0) {
      lines.push(`${indent}lv_obj_set_style_shadow_spread(${varName}, ${styles.shadowSpread}, ${selector});`);
    }
    if (styles.shadowOpacity !== undefined && styles.shadowOpacity < 255) {
      lines.push(`${indent}lv_obj_set_style_shadow_opa(${varName}, ${styles.shadowOpacity}, ${selector});`);
    }
  }

  // Transform
  if (styles.transformAngle !== undefined && styles.transformAngle !== 0) {
    if (isV9) {
      lines.push(`${indent}lv_obj_set_style_transform_rotation(${varName}, ${styles.transformAngle}, ${selector});`);
    } else {
      lines.push(`${indent}lv_obj_set_style_transform_angle(${varName}, ${styles.transformAngle}, ${selector});`);
    }
  }
  if (styles.transformZoomX !== undefined && styles.transformZoomX !== 256) {
    if (isV9) {
      lines.push(`${indent}lv_obj_set_style_transform_scale_x(${varName}, ${styles.transformZoomX}, ${selector});`);
    } else {
      lines.push(`${indent}lv_obj_set_style_transform_zoom(${varName}, ${styles.transformZoomX}, ${selector});`);
    }
  }
  if (styles.transformZoomY !== undefined && styles.transformZoomY !== 256) {
    if (isV9) {
      lines.push(`${indent}lv_obj_set_style_transform_scale_y(${varName}, ${styles.transformZoomY}, ${selector});`);
    } else {
      // v8 only has a single zoom value; use X if Y differs
      if (styles.transformZoomX === undefined || styles.transformZoomX === 256) {
        lines.push(`${indent}lv_obj_set_style_transform_zoom(${varName}, ${styles.transformZoomY}, ${selector});`);
      } else {
        lines.push(`${indent}// Note: LVGL v8 only supports uniform zoom; Y zoom ${styles.transformZoomY} ignored`);
      }
    }
  }
  if (styles.transformPivotX !== undefined && styles.transformPivotX !== 0) {
    lines.push(`${indent}lv_obj_set_style_transform_pivot_x(${varName}, ${styles.transformPivotX}, ${selector});`);
  }
  if (styles.transformPivotY !== undefined && styles.transformPivotY !== 0) {
    lines.push(`${indent}lv_obj_set_style_transform_pivot_y(${varName}, ${styles.transformPivotY}, ${selector});`);
  }

  // Text font. Skipped when a typography covers this state: the shared style
  // sets the same properties, and a local style would silently win over it.
  if (suppressText) {
    // handled by lv_obj_add_style
  } else if (styles.textFont) {
    const builtinMatch = styles.textFont.match(/^montserrat_(\d+)$/);
    if (builtinMatch) {
      // Skip if same as project default font
      if (styles.textFont !== defaultFont) {
        lines.push(`${indent}lv_obj_set_style_text_font(${varName}, &lv_font_montserrat_${builtinMatch[1]}, ${selector});`);
      }
    } else {
      // Custom font resource: variable name is cFontName_size (e.g. ui_font_noto_16)
      const fontSize = styles.textFontSize || 16;
      // Skip if same font and same size as project default
      if (styles.textFont !== defaultFont || fontSize !== (defaultFontSize || 16)) {
        lines.push(`${indent}lv_obj_set_style_text_font(${varName}, &${styles.textFont}_${fontSize}, ${selector});`);
      }
    }
  }
  if (styles.textFontSize !== undefined && styles.textFontSize !== 14) {
    lines.push(`${indent}// Note: LVGL font size is determined at compile time (requested: ${styles.textFontSize}px)`);
  }
  if (!suppressText && styles.textLetterSpace !== undefined && styles.textLetterSpace !== 0) {
    lines.push(`${indent}lv_obj_set_style_text_letter_space(${varName}, ${styles.textLetterSpace}, ${selector});`);
  }
  if (!suppressText && styles.textLineSpace !== undefined && styles.textLineSpace !== 0) {
    lines.push(`${indent}lv_obj_set_style_text_line_space(${varName}, ${styles.textLineSpace}, ${selector});`);
  }

  // Text decoration
  if (!suppressText && styles.textDecor && styles.textDecor !== 'none') {
    const decorMap: Record<string, string> = {
      'underline': 'LV_TEXT_DECOR_UNDERLINE',
      'strikethrough': 'LV_TEXT_DECOR_STRIKETHROUGH',
    };
    const decorVal = decorMap[styles.textDecor];
    if (decorVal) {
      lines.push(`${indent}lv_obj_set_style_text_decor(${varName}, ${decorVal}, ${selector});`);
    }
  }

  // Blend mode
  if (styles.blendMode && styles.blendMode !== 'normal') {
    const blendMap: Record<string, string> = {
      'additive': 'LV_BLEND_MODE_ADDITIVE',
      'subtractive': 'LV_BLEND_MODE_SUBTRACTIVE',
      'multiply': 'LV_BLEND_MODE_MULTIPLY',
    };
    const blendVal = blendMap[styles.blendMode];
    if (blendVal) {
      lines.push(`${indent}lv_obj_set_style_blend_mode(${varName}, ${blendVal}, ${selector});`);
    }
  }

  return lines;
}

/**
 * Style code for a part LVGL draws as an arc.
 *
 * An arc has none of the things a box has — no fill, no border, no corners —
 * so the box rows are read for what an arc does have. Background Color is the
 * arc's colour and Border Width is its thickness, which is what the editor
 * canvas has drawn all along; emitting the box properties instead is what put
 * a square frame around a spinner.
 */
function generateArcStyleCode(
  varName: string,
  styles: StyleProps,
  options: CodeGenOptions,
  selector: string,
): string[] {
  const lines: string[] = [];
  const indent = getIndent(options);

  if (styles.bgColor && styles.bgColor.toLowerCase() !== 'transparent') {
    lines.push(`${indent}lv_obj_set_style_arc_color(${varName}, ${colorToLvgl(styles.bgColor)}, ${selector});`);
  }
  if (styles.borderWidth !== undefined) {
    lines.push(`${indent}lv_obj_set_style_arc_width(${varName}, ${styles.borderWidth}, ${selector});`);
  }
  if (styles.opacity !== undefined && styles.opacity < 1) {
    lines.push(`${indent}lv_obj_set_style_arc_opa(${varName}, ${opacityToLvgl(styles.opacity)}, ${selector});`);
  }

  return lines;
}

/**
 * The arc an arc-shaped widget's own Style section describes.
 *
 * `arc` and `spinner` draw two arcs — the track behind and the value in front
 * — and neither is a box, so the box rows are read for them: Background Color
 * is the track, Border Color the value, and Border Width the thickness of
 * both. That reading is not new; it is what componentDefinitions' palette
 * entry for these two has always meant and what the editor canvas has always
 * drawn. What is new is that the firmware now agrees, instead of taking the
 * same rows literally and framing the arc in a rectangle.
 *
 * A Value part states the same thing directly and wins, because it is emitted
 * after this.
 */
function generateArcWidgetStyles(
  varName: string,
  component: LvglComponent,
  options: CodeGenOptions,
): string[] {
  if (!isArcPart(component.type, 'main')) return [];

  const indent = getIndent(options);
  const styles = component.styles.default;
  const lines: string[] = [];

  if (styles.bgColor && styles.bgColor.toLowerCase() !== 'transparent') {
    lines.push(`${indent}lv_obj_set_style_arc_color(${varName}, ${colorToLvgl(styles.bgColor)}, LV_PART_MAIN);`);
  }
  if (styles.borderWidth !== undefined && styles.borderWidth > 0) {
    lines.push(`${indent}lv_obj_set_style_arc_width(${varName}, ${styles.borderWidth}, LV_PART_MAIN);`);
    lines.push(`${indent}lv_obj_set_style_arc_width(${varName}, ${styles.borderWidth}, LV_PART_INDICATOR);`);
  }
  if (styles.borderColor) {
    lines.push(`${indent}lv_obj_set_style_arc_color(${varName}, ${colorToLvgl(styles.borderColor)}, LV_PART_INDICATOR);`);
  }

  return lines;
}

/**
 * Style code for every part of a widget except its main one.
 *
 * Each part is written for each state it declares, so a knob can darken while
 * pressed the same way the widget itself can. A part the project says nothing
 * about emits nothing and keeps the theme's own styling.
 */
function generatePartStyleCode(
  varName: string,
  component: LvglComponent,
  options: CodeGenOptions,
  defaultFont?: string,
  defaultFontSize?: number,
): string[] {
  const lines: string[] = [];
  const parts = component.styles.parts;
  if (!parts) return lines;

  const states: LvglStyleState[] = ['default', 'pressed', 'focused', 'disabled', 'checked'];

  for (const { part } of widgetParts(component.type)) {
    if (part === 'main') continue;
    const perState = parts[part];
    if (!perState) continue;
    for (const state of states) {
      const style = perState[state];
      if (!style) continue;
      const selector = partSelector(part, state);
      lines.push(...(isArcPart(component.type, part)
        ? generateArcStyleCode(varName, style, options, selector)
        : generateStyleCode(varName, style, options, selector, defaultFont, defaultFontSize)));
    }
  }

  return lines;
}

/**
 * Generate component-specific property code
 */
function generatePropsCode(
  varName: string,
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>,
  options: CodeGenOptions,
  imageResources: ImageResource[] = [],
  defaultFont?: string,
  defaultFontSize?: number,
  suppressText: boolean = false,
  /** Translation tag for this widget, and which prop it stands in for. */
  translation?: { tag: string; prop: TranslatableProp },
  /** The widget itself, for the few props that need its box or its styles. */
  component?: LvglComponent
): string[] {
  const lines: string[] = [];
  const indent = getIndent(options);
  const isV9 = options.lvglVersion === '9';

  // Common text properties for components with text
  const generateTextProps = (labelVar: string) => {
    // A typography's shared style already sets font and alignment
    if (suppressText) return;
    if (props.fontResource) {
      const fontName = props.fontResource as string;
      const builtinMatch = fontName.match(/^montserrat_(\d+)$/);
      if (builtinMatch) {
        // Built-in font — skip if same as project default
        if (fontName !== defaultFont) {
          lines.push(`${indent}lv_obj_set_style_text_font(${labelVar}, &lv_font_${fontName}, 0);`);
        }
      } else {
        // Custom font — append fontSize suffix
        const fontSize = props.fontSize || 16;
        // Skip if same font and same size as project default
        if (fontName !== defaultFont || fontSize !== (defaultFontSize || 16)) {
          lines.push(`${indent}lv_obj_set_style_text_font(${labelVar}, &${fontName}_${fontSize}, 0);`);
        }
      }
    } else if (props.fontSize !== undefined && defaultFont && !/^montserrat_\d+$/.test(defaultFont)) {
      // No fontResource set (inheriting default), but fontSize differs from default
      const fontSize = props.fontSize as number;
      if (fontSize !== (defaultFontSize || 16)) {
        lines.push(`${indent}lv_obj_set_style_text_font(${labelVar}, &${defaultFont}_${fontSize}, 0);`);
      }
    }
    // If no fontResource is set and no fontSize override, the component inherits the project default font — no code needed
    if (props.textAlign) {
      const alignMap: Record<string, string> = {
        'left': 'LV_TEXT_ALIGN_LEFT',
        'center': 'LV_TEXT_ALIGN_CENTER',
        'right': 'LV_TEXT_ALIGN_RIGHT',
      };
      lines.push(`${indent}lv_obj_set_style_text_align(${labelVar}, ${alignMap[props.textAlign] || 'LV_TEXT_ALIGN_CENTER'}, 0);`);
    }
  };
  
  switch (type) {
    case 'label': {
      const ellipsis = props.longMode === 'ellipsis';
      if (translation?.prop === 'text' && !ellipsis) {
        // Applies the text as well as storing the tag, and re-applies it
        // whenever the language changes — no handler of ours needed
        lines.push(`${indent}lv_label_set_translation_tag(${varName}, "${escapeCString(translation.tag)}");`);
      } else if (props.text) {
        // An ellipsis label gets no tag even when linked: the label's own
        // re-apply would restore the full text over the truncation, so the
        // ellipsis callback owns the text and re-resolves the tag itself
        lines.push(`${indent}lv_label_set_text(${varName}, "${escapeCString(props.text)}");`);
      }
      if (props.longMode) {
        const longModeMap: Record<string, string> = {
          'wrap': 'LV_LABEL_LONG_WRAP',
          'scroll': 'LV_LABEL_LONG_SCROLL',
          'dot': 'LV_LABEL_LONG_DOT',
          // A single U+2026 is not something LVGL's DOTS mode can draw — it
          // writes three ASCII periods, hard-coded. CLIP plus the generated
          // truncation helper is what renders the real character.
          'ellipsis': 'LV_LABEL_LONG_CLIP',
          'clip': 'LV_LABEL_LONG_CLIP',
        };
        lines.push(`${indent}lv_label_set_long_mode(${varName}, ${longModeMap[props.longMode] || 'LV_LABEL_LONG_WRAP'});`);
      }
      generateTextProps(varName);
      break;
    }
      
    case 'btn':
      if (translation?.prop === 'text' || props.text) {
        // Create a label inside the button
        lines.push(`${indent}lv_obj_t *${varName}_label = lv_label_create(${varName});`);
        if (translation?.prop === 'text') {
          // A button's caption is a real label, so it follows the language too
          lines.push(`${indent}lv_label_set_translation_tag(${varName}_label, "${escapeCString(translation.tag)}");`);
        } else {
          lines.push(`${indent}lv_label_set_text(${varName}_label, "${escapeCString(props.text)}");`);
        }
        lines.push(`${indent}lv_obj_center(${varName}_label);`);
        generateTextProps(`${varName}_label`);
      }
      break;
      
    case 'slider':
      if (props.min !== undefined || props.max !== undefined) {
        lines.push(`${indent}lv_slider_set_range(${varName}, ${props.min ?? 0}, ${props.max ?? 100});`);
      }
      if (props.value !== undefined) {
        lines.push(`${indent}lv_slider_set_value(${varName}, ${props.value}, LV_ANIM_OFF);`);
      }
      if (props.step && props.step > 1) {
        lines.push(`${indent}lv_slider_set_mode(${varName}, LV_SLIDER_MODE_NORMAL);`);
        lines.push(`${indent}// Note: Step size needs custom handling in event callback`);
      }
      if (props.orientation === 'vertical') {
        lines.push(`${indent}${isV9 ? 'lv_obj_set_style_transform_rotation' : 'lv_obj_set_style_transform_angle'}(${varName}, 900, 0);`);
      }
      break;
      
    case 'bar':
      if (props.min !== undefined || props.max !== undefined) {
        lines.push(`${indent}lv_bar_set_range(${varName}, ${props.min ?? 0}, ${props.max ?? 100});`);
      }
      if (props.value !== undefined) {
        lines.push(`${indent}lv_bar_set_value(${varName}, ${props.value}, LV_ANIM_OFF);`);
      }
      if (props.orientation === 'vertical') {
        lines.push(`${indent}${isV9 ? 'lv_obj_set_style_transform_rotation' : 'lv_obj_set_style_transform_angle'}(${varName}, 900, 0);`);
      }
      break;
      
    case 'arc':
      if (props.startAngle !== undefined || props.endAngle !== undefined) {
        lines.push(`${indent}lv_arc_set_bg_angles(${varName}, ${props.startAngle ?? 135}, ${props.endAngle ?? 45});`);
      }
      if (props.min !== undefined || props.max !== undefined) {
        lines.push(`${indent}lv_arc_set_range(${varName}, ${props.min ?? 0}, ${props.max ?? 100});`);
      }
      if (props.value !== undefined) {
        lines.push(`${indent}lv_arc_set_value(${varName}, ${props.value});`);
      }
      if (props.mode) {
        const modeMap: Record<string, string> = {
          'normal': 'LV_ARC_MODE_NORMAL',
          'symmetrical': 'LV_ARC_MODE_SYMMETRICAL',
          'reverse': 'LV_ARC_MODE_REVERSE',
        };
        lines.push(`${indent}lv_arc_set_mode(${varName}, ${modeMap[props.mode] || 'LV_ARC_MODE_NORMAL'});`);
      }
      break;
      
    case 'checkbox':
      if (translation?.prop === 'text') {
        // A checkbox's caption is not a label, so LVGL will not re-apply it on
        // a language change — the callback below is ours to add
        lines.push(`${indent}lv_checkbox_set_text(${varName}, lv_tr("${escapeCString(translation.tag)}"));`);
        lines.push(`${indent}lv_obj_add_event_cb(${varName}, ui_tr_checkbox_cb, LV_EVENT_TRANSLATION_LANGUAGE_CHANGED, (void *)"${escapeCString(translation.tag)}");`);
      } else if (props.text) {
        lines.push(`${indent}lv_checkbox_set_text(${varName}, "${escapeCString(props.text)}");`);
      }
      if (props.checked) {
        lines.push(`${indent}lv_obj_add_state(${varName}, LV_STATE_CHECKED);`);
      }
      generateTextProps(varName);
      break;
      
    case 'switch':
      if (props.checked) {
        lines.push(`${indent}lv_obj_add_state(${varName}, LV_STATE_CHECKED);`);
      }
      break;
      
    case 'textarea':
      // The recorded prop decides which setter the tag drives: a shared
      // placeholder stays a placeholder even after the textarea gains content
      if (translation?.prop === 'placeholder') {
        lines.push(`${indent}lv_textarea_set_placeholder_text(${varName}, lv_tr("${escapeCString(translation.tag)}"));`);
        lines.push(`${indent}lv_obj_add_event_cb(${varName}, ui_tr_textarea_placeholder_cb, LV_EVENT_TRANSLATION_LANGUAGE_CHANGED, (void *)"${escapeCString(translation.tag)}");`);
      } else if (props.placeholder) {
        lines.push(`${indent}lv_textarea_set_placeholder_text(${varName}, "${escapeCString(props.placeholder)}");`);
      }
      if (translation?.prop === 'text') {
        lines.push(`${indent}lv_textarea_set_text(${varName}, lv_tr("${escapeCString(translation.tag)}"));`);
        lines.push(`${indent}lv_obj_add_event_cb(${varName}, ui_tr_textarea_cb, LV_EVENT_TRANSLATION_LANGUAGE_CHANGED, (void *)"${escapeCString(translation.tag)}");`);
      } else if (props.text) {
        lines.push(`${indent}lv_textarea_set_text(${varName}, "${escapeCString(props.text)}");`);
      }
      if (props.maxLength && props.maxLength > 0) {
        lines.push(`${indent}lv_textarea_set_max_length(${varName}, ${props.maxLength});`);
      }
      if (props.password) {
        lines.push(`${indent}lv_textarea_set_password_mode(${varName}, true);`);
      }
      if (props.oneLine) {
        lines.push(`${indent}lv_textarea_set_one_line(${varName}, true);`);
      }
      generateTextProps(varName);
      break;
      
    case 'dropdown':
      if (translation?.prop === 'options') {
        // One tag stands for the whole newline-joined list — the exact string
        // this setter takes. The callback restores the selection, which
        // lv_dropdown_set_options resets to 0.
        lines.push(`${indent}lv_dropdown_set_options(${varName}, lv_tr("${escapeCString(translation.tag)}"));`);
        lines.push(`${indent}lv_obj_add_event_cb(${varName}, ui_tr_dropdown_cb, LV_EVENT_TRANSLATION_LANGUAGE_CHANGED, (void *)"${escapeCString(translation.tag)}");`);
      } else if (props.options) {
        const optionsStr = Array.isArray(props.options)
          ? props.options.map((o: string) => escapeCString(o)).join('\\n')
          : escapeCString(props.options);
        lines.push(`${indent}lv_dropdown_set_options(${varName}, "${optionsStr}");`);
      }
      if (props.selected !== undefined) {
        lines.push(`${indent}lv_dropdown_set_selected(${varName}, ${props.selected});`);
      }
      if (props.direction) {
        const dirMap: Record<string, string> = {
          'down': 'LV_DIR_BOTTOM',
          'up': 'LV_DIR_TOP',
        };
        lines.push(`${indent}lv_dropdown_set_dir(${varName}, ${dirMap[props.direction] || 'LV_DIR_BOTTOM'});`);
      }
      generateTextProps(varName);
      // The open list is a separate object parented to the screen, so a font
      // set on the dropdown never reaches it — the closed button renders 高
      // while the open rows fall back to the default font and draw placeholder
      // boxes. Found on the panel, not in a test. The list exists from the
      // dropdown's constructor, so styling it here is safe.
      if (props.fontResource && !/^montserrat_\d+$/.test(props.fontResource)) {
        const listFontSize = (props.fontSize as number) || 16;
        lines.push(`${indent}lv_obj_set_style_text_font(lv_dropdown_get_list(${varName}), &${props.fontResource}_${listFontSize}, 0);`);
        // The ▼ indicator is widget chrome drawn with LV_PART_INDICATOR's
        // font, which resolves to the custom font — and no text font carries
        // the symbol glyphs, by design. Pin the chrome to the default font,
        // which always does.
        lines.push(`${indent}lv_obj_set_style_text_font(${varName}, LV_FONT_DEFAULT, LV_PART_INDICATOR);`);
      }
      break;
      
    case 'img':
      if (props.src) {
        const imgSetSrc = isV9 ? 'lv_image_set_src' : 'lv_img_set_src';
        // Check if src matches a resource image (by id or name)
        const matchedImage = imageResources.find(
          (img) => img.id === props.src || img.name === props.src
        );
        if (matchedImage) {
          lines.push(`${indent}${imgSetSrc}(${varName}, &${matchedImage.cArrayName});`);
        } else {
          lines.push(`${indent}${imgSetSrc}(${varName}, &${props.src});`);
        }
      }
      // Stretch image to fill the widget area (matches editor canvas behavior)
      if (isV9) {
        lines.push(`${indent}lv_image_set_inner_align(${varName}, LV_IMAGE_ALIGN_STRETCH);`);
      } else {
        lines.push(`${indent}// Note: LVGL v8 does not support image inner align; manual scaling needed`);
      }
      if (props.rotation && props.rotation !== 0) {
        if (isV9) {
          lines.push(`${indent}lv_image_set_rotation(${varName}, ${props.rotation * 10});`);
        } else {
          lines.push(`${indent}lv_img_set_angle(${varName}, ${props.rotation * 10});`);
        }
      }
      if (props.scaleMode === 'cover' || props.scaleMode === 'contain') {
        lines.push(`${indent}// Note: Scale mode "${props.scaleMode}" needs custom implementation`);
      }
      break;

    case 'image-button':
      lines.push(`${indent}lv_obj_add_flag(${varName}, LV_OBJ_FLAG_CLICKABLE);`);
      if (isV9) {
        lines.push(`${indent}lv_image_set_inner_align(${varName}, LV_IMAGE_ALIGN_STRETCH);`);
      } else {
        lines.push(`${indent}// LVGL v8 image buttons use the source image's native sizing.`);
      }
      lines.push(`${indent}${varName}_image_button_context.object = ${varName};`);
      lines.push(`${indent}ui_image_button_apply_state(&${varName}_image_button_context);`);
      lines.push(
        `${indent}lv_obj_add_event_cb(${varName}, ui_image_button_event_cb, LV_EVENT_CLICKED, &${varName}_image_button_context);`,
      );
      break;
      
    case 'circle': {
      if (props.shape === 'sector') {
        const { start, sweep } = normalizeSweep(
          props.startAngle ?? DEFAULT_START_ANGLE,
          props.endAngle ?? DEFAULT_END_ANGLE,
        );
        // The shape is drawn by the arc's background part: its angles, and a
        // width thick enough to close the wedge to the centre when no ring is
        // asked for. The indicator and the knob are what make an arc a
        // control, and this one is a decoration.
        const radius = Math.floor(Math.min(component?.width ?? 100, component?.height ?? 100) / 2);
        const thickness = props.thickness > 0 && props.thickness < radius
          ? props.thickness
          : radius;
        lines.push(`${indent}lv_obj_remove_style(${varName}, NULL, LV_PART_KNOB);`);
        lines.push(`${indent}lv_obj_set_style_arc_opa(${varName}, LV_OPA_TRANSP, LV_PART_INDICATOR);`);
        // LVGL subtracts a single turn from an angle over 360, so the end is
        // wrapped here rather than handed over as start + sweep. A full turn
        // stays 0..360, which is how an arc says "all the way round".
        const [from, to] = sweep >= 360 ? [0, 360] : [start, (start + sweep) % 360];
        lines.push(`${indent}lv_arc_set_bg_angles(${varName}, ${from}, ${to});`);
        lines.push(`${indent}lv_obj_set_style_arc_width(${varName}, ${thickness}, LV_PART_MAIN);`);
        lines.push(`${indent}lv_obj_set_style_arc_rounded(${varName}, false, LV_PART_MAIN);`);
        const arcColor = component?.styles.default.bgColor;
        if (arcColor && arcColor !== 'transparent') {
          lines.push(
            `${indent}lv_obj_set_style_arc_color(${varName}, ${colorToLvgl(arcColor)}, LV_PART_MAIN);`,
          );
        }
      } else {
        // LV_RADIUS_CIRCLE is clamped to half the shorter side, so a square
        // box gives a circle. The widget keeps its box square for that reason.
        lines.push(`${indent}lv_obj_set_style_radius(${varName}, LV_RADIUS_CIRCLE, 0);`);
      }
      break;
    }

    case 'polygon': {
      const points = generatedPolygonPoints(props);
      lines.push(
        `${indent}lv_line_set_points(${varName}, ${varName}_points, ${points.length});`,
      );
      if (props.lineWidth !== undefined && props.lineWidth !== DEFAULT_LINE_WIDTH) {
        lines.push(`${indent}lv_obj_set_style_line_width(${varName}, ${props.lineWidth}, 0);`);
      }
      if (props.lineColor) {
        lines.push(`${indent}lv_obj_set_style_line_color(${varName}, ${colorToLvgl(props.lineColor)}, 0);`);
      }
      if (props.lineRounded) {
        lines.push(`${indent}lv_obj_set_style_line_rounded(${varName}, true, 0);`);
      }
      if (component && polygonFill(component) !== null) {
        lines.push(
          `${indent}lv_obj_add_event_cb(${varName}, ui_polygon_fill_cb, LV_EVENT_DRAW_MAIN_BEGIN, (void *)&${varName}_fill);`,
        );
      }
      break;
    }

    case 'line': {
      const linePoints = generatedLinePoints(props);
      lines.push(
        `${indent}lv_line_set_points(${varName}, ${varName}_points, ${linePoints.length});`,
      );
      if (props.lineWidth !== undefined && props.lineWidth !== DEFAULT_LINE_WIDTH) {
        lines.push(`${indent}lv_obj_set_style_line_width(${varName}, ${props.lineWidth}, 0);`);
      }
      if (props.lineColor) {
        lines.push(`${indent}lv_obj_set_style_line_color(${varName}, ${colorToLvgl(props.lineColor)}, 0);`);
      }
      if (props.lineRounded) {
        lines.push(`${indent}lv_obj_set_style_line_rounded(${varName}, true, 0);`);
      }
      if (props.lineDashWidth > 0) {
        lines.push(`${indent}lv_obj_set_style_line_dash_width(${varName}, ${props.lineDashWidth}, 0);`);
        lines.push(
          `${indent}lv_obj_set_style_line_dash_gap(${varName}, ${props.lineDashGap || props.lineDashWidth}, 0);`,
        );
      }
      break;
    }
      
    case 'table':
      if (props.rows !== undefined) {
        lines.push(`${indent}lv_table_set_row_cnt(${varName}, ${props.rows});`);
      }
      if (props.cols !== undefined) {
        lines.push(`${indent}lv_table_set_col_cnt(${varName}, ${props.cols});`);
      }
      // Column widths
      if (props.columnWidths && Array.isArray(props.columnWidths)) {
        for (let i = 0; i < props.columnWidths.length; i++) {
          if (props.columnWidths[i] !== undefined) {
            lines.push(`${indent}lv_table_set_col_width(${varName}, ${i}, ${props.columnWidths[i]});`);
          }
        }
      }
      // Cell data
      if (props.cellData && Array.isArray(props.cellData)) {
        for (let r = 0; r < props.cellData.length; r++) {
          const row = props.cellData[r];
          if (Array.isArray(row)) {
            for (let c = 0; c < row.length; c++) {
              if (row[c] !== undefined && row[c] !== '') {
                lines.push(`${indent}lv_table_set_cell_value(${varName}, ${r}, ${c}, "${escapeCString(String(row[c]))}");`);
              }
            }
          }
        }
      }
      break;
      
    case 'calendar':
      if (props.year !== undefined && props.month !== undefined) {
        lines.push(`${indent}lv_calendar_set_showed_date(${varName}, ${props.year}, ${props.month});`);
      }
      if (props.showToday) {
        lines.push(`${indent}// Set today's date — update year/month/day as needed`);
        lines.push(`${indent}lv_calendar_set_today_date(${varName}, ${props.year || 2025}, ${props.month || 1}, 1);`);
      }
      if (props.highlightedDates && Array.isArray(props.highlightedDates) && props.highlightedDates.length > 0) {
        const dates = props.highlightedDates as { year: number; month: number; day: number }[];
        lines.push(`${indent}static lv_calendar_date_t ${varName}_hl_dates[] = {`);
        for (const d of dates) {
          lines.push(`${indent}    {.year = ${d.year}, .month = ${d.month}, .day = ${d.day}},`);
        }
        lines.push(`${indent}};`);
        lines.push(`${indent}lv_calendar_set_highlighted_dates(${varName}, ${varName}_hl_dates, ${dates.length});`);
      }
      if (props.showDayNames === false) {
        lines.push(`${indent}// Note: Day names visibility needs custom header configuration`);
      }
      break;
      
    case 'chart':
      if (props.type) {
        const chartTypeMap: Record<string, string> = {
          'line': 'LV_CHART_TYPE_LINE',
          'bar': 'LV_CHART_TYPE_BAR',
          'scatter': 'LV_CHART_TYPE_SCATTER',
        };
        lines.push(`${indent}lv_chart_set_type(${varName}, ${chartTypeMap[props.type] || 'LV_CHART_TYPE_LINE'});`);
      }
      // Y axis range
      if (props.yAxisMin !== undefined || props.yAxisMax !== undefined) {
        lines.push(`${indent}lv_chart_set_range(${varName}, LV_CHART_AXIS_PRIMARY_Y, ${props.yAxisMin ?? 0}, ${props.yAxisMax ?? 100});`);
      }
      // Series
      if (props.series && Array.isArray(props.series) && props.series.length > 0) {
        // How many points the chart holds, before any are pushed into it.
        // LVGL keeps 10 whatever the series carries, so a seven-value series
        // left three empty columns on the left and drew nothing where the
        // author put the seventh — see the legacy branch below, which has
        // always said this. The longest series wins: a shorter one simply
        // leaves its tail unset.
        const points = Math.max(
          ...props.series.map((ser: { data?: unknown[] }) =>
            Array.isArray(ser.data) ? ser.data.length : 0,
          ),
        );
        if (points > 0) {
          lines.push(`${indent}lv_chart_set_point_count(${varName}, ${points});`);
        }
        for (let si = 0; si < props.series.length; si++) {
          const ser = props.series[si];
          const serVar = `${varName}_ser_${si}`;
          const serColor = ser.color ? colorToLvgl(ser.color) : colorToLvgl('#2196F3');
          lines.push(`${indent}lv_chart_series_t *${serVar} = lv_chart_add_series(${varName}, ${serColor}, LV_CHART_AXIS_PRIMARY_Y);`);
          if (ser.data && Array.isArray(ser.data)) {
            for (const val of ser.data) {
              lines.push(`${indent}lv_chart_set_next_value(${varName}, ${serVar}, ${val});`);
            }
          }
        }
      } else if (props.data && Array.isArray(props.data) && props.data.length > 0) {
        // Legacy single-series data
        lines.push(`${indent}lv_chart_set_point_count(${varName}, ${props.data.length});`);
        lines.push(`${indent}lv_chart_series_t *${varName}_ser = lv_chart_add_series(${varName}, ${colorToLvgl(props.lineColor || '#2196F3')}, LV_CHART_AXIS_PRIMARY_Y);`);
        const coordType = isV9 ? 'int32_t' : 'lv_coord_t';
        lines.push(`${indent}lv_chart_set_ext_y_array(${varName}, ${varName}_ser, (${coordType}[]){${props.data.join(', ')}});`);
      }
      if (props.showGrid === false) {
        lines.push(`${indent}lv_obj_set_style_line_opa(${varName}, LV_OPA_TRANSP, LV_PART_MAIN);`);
      }
      break;
      
    case 'qrcode':
      // The code draws at its true pixel size; the box centres it. The
      // context beside the widget's variable carries everything else.
      lines.push(`${indent}lv_image_set_inner_align(${varName}, LV_IMAGE_ALIGN_CENTER);`);
      lines.push(`${indent}ui_qrcode_apply(${varName}, &${varName}_qr);`);
      break;

    case 'video': {
      // Nothing to scroll: the runtime's picture fills the box exactly, and a
      // stray drag on a touch panel must not slide it.
      const clearFlag = isV9 ? 'lv_obj_remove_flag' : 'lv_obj_clear_flag';
      lines.push(`${indent}${clearFlag}(${varName}, LV_OBJ_FLAG_SCROLLABLE);`);
      // The files are named, never linked: they live on the SD card, and the
      // runtime is what looks for them. The playlist itself is a file-scope
      // table beside the widget's variable — see videoPlaylistDeclaration —
      // because the runtime keeps the pointer rather than copying. A name
      // matching nothing on the card leaves the widget reading "Video not
      // found": the panel's report, made at the only moment anything can
      // actually look.
      lines.push(`${indent}hmi_video_attach(${varName}, &${varName}_playlist);`);
      break;
    }

    case 'spinner':
      if (isV9) {
        // V9: speed and arc length set via lv_spinner_set_anim_params
        const speed = props.speed || 1000;
        const arcLength = props.arcLength || 60;
        lines.push(`${indent}lv_spinner_set_anim_params(${varName}, ${speed}, ${arcLength});`);
      } else {
        // V8: speed and arc length set in create function
        if (props.speed && props.speed !== 1000) {
          lines.push(`${indent}// Note: Spinner speed ${props.speed}ms set in create function`);
        }
        if (props.arcLength && props.arcLength !== 60) {
          lines.push(`${indent}// Note: Spinner arc length ${props.arcLength}° set in create function`);
        }
      }
      break;
      
    case 'tabview':
      if (props.tabs && Array.isArray(props.tabs)) {
        if (isV9) {
          // V9: set tab bar position and size before adding tabs
          const posMap: Record<string, string> = {
            'top': 'LV_DIR_TOP',
            'bottom': 'LV_DIR_BOTTOM',
            'left': 'LV_DIR_LEFT',
            'right': 'LV_DIR_RIGHT',
          };
          const pos = posMap[props.tabPosition] || 'LV_DIR_TOP';
          lines.push(`${indent}lv_tabview_set_tab_bar_position(${varName}, ${pos});`);
          lines.push(`${indent}lv_tabview_set_tab_bar_size(${varName}, ${props.tabBarSize || 50});`);
        }
        for (let i = 0; i < props.tabs.length; i++) {
          const tab = props.tabs[i];
          if (isV9) {
            lines.push(`${indent}lv_obj_t * ${varName}_tab_${i} = lv_tabview_add_tab(${varName}, "${escapeCString(tab)}");`);
          } else {
            lines.push(`${indent}lv_tabview_add_tab(${varName}, "${escapeCString(tab)}");`);
          }
        }
      }
      if (props.activeTab !== undefined && props.activeTab > 0) {
        if (isV9) {
          lines.push(`${indent}lv_tabview_set_active(${varName}, ${props.activeTab}, LV_ANIM_OFF);`);
        } else {
          lines.push(`${indent}lv_tabview_set_act(${varName}, ${props.activeTab}, LV_ANIM_OFF);`);
        }
      }
      break;
      
    case 'tileview':
      if (props.rows !== undefined && props.cols !== undefined) {
        for (let r = 0; r < props.rows; r++) {
          for (let c = 0; c < props.cols; c++) {
            lines.push(`${indent}lv_obj_t * ${varName}_tile_${r}_${c} = lv_tileview_add_tile(${varName}, ${c}, ${r}, LV_DIR_ALL);`);
          }
        }
      }
      if (props.currentRow !== undefined || props.currentCol !== undefined) {
        lines.push(`${indent}lv_obj_set_tile_id(${varName}, ${props.currentCol || 0}, ${props.currentRow || 0}, LV_ANIM_OFF);`);
      }
      break;
      
    case 'win':
      if (translation?.prop === 'title') {
        // lv_win_add_title creates and returns a real label, so keeping the
        // pointer is enough — no callback needed, LVGL re-applies it itself
        lines.push(`${indent}lv_obj_t *${varName}_title = lv_win_add_title(${varName}, "");`);
        lines.push(`${indent}lv_label_set_translation_tag(${varName}_title, "${escapeCString(translation.tag)}");`);
      } else if (props.title) {
        lines.push(`${indent}lv_win_add_title(${varName}, "${escapeCString(props.title)}");`);
      }
      if (props.headerHeight && props.headerHeight !== 40) {
        lines.push(`${indent}// Note: Window header height ${props.headerHeight}px is set in lv_win_create()`);
      }
      if (props.showCloseBtn) {
        lines.push(`${indent}${isV9 ? 'lv_win_add_button' : 'lv_win_add_btn'}(${varName}, LV_SYMBOL_CLOSE, 40);`);
      }
      if (props.headerButtons && Array.isArray(props.headerButtons)) {
        for (const btn of props.headerButtons) {
          const icon = btn.icon || 'LV_SYMBOL_SETTINGS';
          const width = btn.width || 40;
          lines.push(`${indent}${isV9 ? 'lv_win_add_button' : 'lv_win_add_btn'}(${varName}, ${icon}, ${width});`);
        }
      }
      break;
      
    case 'obj':
      if (props.scrollDir) {
        const scrollDirMap: Record<string, string> = {
          'none': 'LV_DIR_NONE',
          'hor': 'LV_DIR_HOR',
          'ver': 'LV_DIR_VER',
          'all': 'LV_DIR_ALL',
        };
        lines.push(`${indent}lv_obj_set_scroll_dir(${varName}, ${scrollDirMap[props.scrollDir] || 'LV_DIR_NONE'});`);
      }
      if (props.layout === 'flex') {
        lines.push(`${indent}lv_obj_set_layout(${varName}, LV_LAYOUT_FLEX);`);
        // Determine flex flow from direction + wrap
        const dir = props.flexDirection || 'row';
        const wrap = props.flexWrap === true || props.flexWrap === 'wrap';
        const flowMap: Record<string, string> = {
          'row': wrap ? 'LV_FLEX_FLOW_ROW_WRAP' : 'LV_FLEX_FLOW_ROW',
          'column': wrap ? 'LV_FLEX_FLOW_COLUMN_WRAP' : 'LV_FLEX_FLOW_COLUMN',
          'row-reverse': wrap ? 'LV_FLEX_FLOW_ROW_WRAP_REVERSE' : 'LV_FLEX_FLOW_ROW_REVERSE',
          'column-reverse': wrap ? 'LV_FLEX_FLOW_COLUMN_WRAP_REVERSE' : 'LV_FLEX_FLOW_COLUMN_REVERSE',
        };
        lines.push(`${indent}lv_obj_set_flex_flow(${varName}, ${flowMap[dir] || 'LV_FLEX_FLOW_ROW'});`);
        // Flex align
        if (props.justifyContent || props.alignItems || props.alignContent) {
          const mainMap: Record<string, string> = {
            'flex-start': 'LV_FLEX_ALIGN_START',
            'flex-end': 'LV_FLEX_ALIGN_END',
            'center': 'LV_FLEX_ALIGN_CENTER',
            'space-between': 'LV_FLEX_ALIGN_SPACE_BETWEEN',
            'space-around': 'LV_FLEX_ALIGN_SPACE_AROUND',
            'space-evenly': 'LV_FLEX_ALIGN_SPACE_EVENLY',
          };
          const crossMap: Record<string, string> = {
            'flex-start': 'LV_FLEX_ALIGN_START',
            'flex-end': 'LV_FLEX_ALIGN_END',
            'center': 'LV_FLEX_ALIGN_CENTER',
            'stretch': 'LV_FLEX_ALIGN_START',
          };
          const main = mainMap[props.justifyContent] || 'LV_FLEX_ALIGN_START';
          const cross = crossMap[props.alignItems] || 'LV_FLEX_ALIGN_START';
          const track = crossMap[props.alignContent] || 'LV_FLEX_ALIGN_START';
          lines.push(`${indent}lv_obj_set_flex_align(${varName}, ${main}, ${cross}, ${track});`);
        }
        // Always explicitly set pad_row/pad_column for flex layout.
        // Without this, LVGL falls back to pad_all which causes unexpected spacing.
        const gapVal = props.gap || 0;
        lines.push(`${indent}lv_obj_set_style_pad_row(${varName}, ${gapVal}, 0);`);
        lines.push(`${indent}lv_obj_set_style_pad_column(${varName}, ${gapVal}, 0);`);
      } else if (props.layout === 'grid') {
        lines.push(`${indent}lv_obj_set_layout(${varName}, LV_LAYOUT_GRID);`);
        // Parse grid columns/rows descriptors
        const coordType = isV9 ? 'int32_t' : 'lv_coord_t';
        if (props.gridColumns) {
          const cols = String(props.gridColumns).trim().split(/\s+/).filter(Boolean);
          const colValues = cols.map((c: string) => {
            if (c.endsWith('fr')) {
              const n = parseInt(c) || 1;
              return `LV_GRID_FR(${n})`;
            }
            return String(parseInt(c) || 0);
          });
          colValues.push('LV_GRID_TEMPLATE_LAST');
          lines.push(`${indent}static ${coordType} ${varName}_col_dsc[] = {${colValues.join(', ')}};`);
        }
        if (props.gridRows) {
          const rows = String(props.gridRows).trim().split(/\s+/).filter(Boolean);
          const rowValues = rows.map((r: string) => {
            if (r.endsWith('fr')) {
              const n = parseInt(r) || 1;
              return `LV_GRID_FR(${n})`;
            }
            return String(parseInt(r) || 0);
          });
          rowValues.push('LV_GRID_TEMPLATE_LAST');
          lines.push(`${indent}static ${coordType} ${varName}_row_dsc[] = {${rowValues.join(', ')}};`);
        }
        if (props.gridColumns || props.gridRows) {
          const colRef = props.gridColumns ? `${varName}_col_dsc` : 'NULL';
          const rowRef = props.gridRows ? `${varName}_row_dsc` : 'NULL';
          lines.push(`${indent}lv_obj_set_grid_dsc_array(${varName}, ${colRef}, ${rowRef});`);
        }
        // Always explicitly set pad_column/pad_row for grid layout.
        // Without this, LVGL falls back to pad_all which causes unexpected spacing.
        lines.push(`${indent}lv_obj_set_style_pad_column(${varName}, ${props.gridColumnGap || 0}, 0);`);
        lines.push(`${indent}lv_obj_set_style_pad_row(${varName}, ${props.gridRowGap || 0}, 0);`);
      }
      break;
  }

  // Flex child properties (applicable to any component type)
  if (props.flexGrow !== undefined && props.flexGrow > 0) {
    lines.push(`${indent}lv_obj_set_flex_grow(${varName}, ${props.flexGrow});`);
  }

  // Grid child properties (applicable to any component type)
  if (props.gridColumn !== undefined || props.gridRow !== undefined) {
    const colAlignMap: Record<string, string> = {
      'start': 'LV_GRID_ALIGN_START',
      'center': 'LV_GRID_ALIGN_CENTER',
      'end': 'LV_GRID_ALIGN_END',
      'stretch': 'LV_GRID_ALIGN_STRETCH',
    };
    const rowAlignMap = colAlignMap;
    const col = props.gridColumn ?? 0;
    const colSpan = props.gridColumnSpan ?? 1;
    const row = props.gridRow ?? 0;
    const rowSpan = props.gridRowSpan ?? 1;
    const colAlign = colAlignMap[props.gridCellAlignX] || 'LV_GRID_ALIGN_STRETCH';
    const rowAlign = rowAlignMap[props.gridCellAlignY] || 'LV_GRID_ALIGN_STRETCH';
    lines.push(`${indent}lv_obj_set_grid_cell(${varName}, ${colAlign}, ${col}, ${colSpan}, ${rowAlign}, ${row}, ${rowSpan});`);
  }
  
  return lines;
}

/**
 * Map AnimationEasing to LVGL path callback
 */
function getEasingPath(easing: AnimationEasing): string {
  const map: Record<AnimationEasing, string> = {
    linear: 'lv_anim_path_linear',
    ease_in: 'lv_anim_path_ease_in',
    ease_out: 'lv_anim_path_ease_out',
    ease_in_out: 'lv_anim_path_ease_in_out',
    overshoot: 'lv_anim_path_overshoot',
    bounce: 'lv_anim_path_bounce',
  };
  return map[easing] || 'lv_anim_path_linear';
}

/**
 * Statements that put an animated widget where its tracks begin.
 *
 * Uses the same setters the animation drives, so the parked state is identical
 * to the animation's first frame.
 */
function generateAnimationInitialState(
  symbols: AnimationSymbol[],
  options: CodeGenOptions
): string[] {
  const indent = getIndent(options);
  const lines: string[] = [];

  for (const symbol of symbols) {
    for (const { track } of symbol.tracks) {
      const wrapper = ANIM_WRAPPERS[track.property];
      const setter = wrapper ? wrapper.name : ANIM_DIRECT_SETTERS[track.property];
      if (!setter) continue;
      lines.push(
        `${indent}${setter}(${symbol.targetVar}, ${trackParkValue(track, symbol.component)});`,
      );
    }
  }

  return lines;
}

/**
 * Emit the wrapper functions needed by the animations in use.
 */
export function generateAnimationHelpers(
  symbols: AnimationSymbol[],
  options: CodeGenOptions
): string[] {
  const used = new Set<string>();
  for (const symbol of symbols) {
    for (const { track } of symbol.tracks) {
      if (ANIM_WRAPPERS[track.property]) used.add(track.property);
    }
  }
  if (used.size === 0) return [];

  const isV9 = options.lvglVersion === '9';
  const lines: string[] = [
    '/* ------------------------------------------------------------ */',
    '/* Animation Helpers                                          */',
    '/* ------------------------------------------------------------ */',
    '',
  ];
  for (const property of Object.keys(ANIM_WRAPPERS)) {
    if (!used.has(property)) continue;
    const wrapper = ANIM_WRAPPERS[property];
    lines.push(`static void ${wrapper.name}(void *object, int32_t value) {`);
    lines.push('    lv_obj_t *target = (lv_obj_t *)object;');
    for (const statement of wrapper.setter(isV9)) {
      lines.push(`    ${statement}`);
    }
    lines.push('}');
    lines.push('');
  }
  return lines;
}

/**
 * Emit the start/stop pair for one animation.
 *
 * An animation drives one or more properties at once — sliding in while
 * fading up is one animation with two tracks — so the start function sets up
 * an lv_anim_t per track. lv_anim_start copies the descriptor, so one local
 * serves them all.
 */
function generateAnimationFunction(
  symbol: AnimationSymbol,
  options: CodeGenOptions
): string {
  const anim = symbol.animation;
  const indent = getIndent(options);
  const animVar = 'anim';
  const lines: string[] = [];

  if (options.generateComments) {
    lines.push(generateComment(`Animation: ${anim.name} on ${symbol.targetVar}`, options));
  }

  lines.push(`void ${animStartFuncName(symbol)}(void) {`);
  lines.push(`${indent}lv_anim_t ${animVar};`);

  symbol.tracks.forEach(({ track, execCb }, index) => {
    if (index > 0) lines.push('');
    if (options.generateComments) {
      lines.push(`${indent}${generateComment(track.property, options)}`);
    }
    lines.push(`${indent}lv_anim_init(&${animVar});`);
    lines.push(`${indent}lv_anim_set_var(&${animVar}, ${symbol.targetVar});`);
    lines.push(`${indent}lv_anim_set_exec_cb(&${animVar}, ${execCb});`);

    if (trackValueMode(track) === 'offset') {
      const getter = track.property === 'x' ? 'lv_obj_get_x' : 'lv_obj_get_y';
      const from = `from_${track.property}`;
      lines.push(`${indent}int32_t ${from} = ${getter}(${symbol.targetVar});`);
      lines.push(
        `${indent}lv_anim_set_values(&${animVar}, ${from}, ${from} + (${trackDistance(track)}));`,
      );
    } else {
      lines.push(`${indent}lv_anim_set_values(&${animVar}, ${track.startValue}, ${track.endValue});`);
    }

    lines.push(`${indent}lv_anim_set_time(&${animVar}, ${anim.duration});`);
    if (anim.delay > 0) {
      lines.push(`${indent}lv_anim_set_delay(&${animVar}, ${anim.delay});`);
    }
    lines.push(`${indent}lv_anim_set_path_cb(&${animVar}, ${getEasingPath(anim.easing)});`);
    if (anim.repeat > 0) {
      lines.push(`${indent}lv_anim_set_repeat_count(&${animVar}, ${anim.repeat});`);
    }
    // Only the first track announces the animation. They share one clock, so
    // they end together and any one of them would do - but exactly one has to,
    // or an animation with two tracks would fire its event twice.
    if (index === 0 && hasCompletedBindings(symbol)) {
      lines.push(
        `${indent}lv_anim_set_completed_cb(&${animVar}, ${animCompletedFuncName(symbol)});`,
      );
    }
    // lv_anim_start drops any running animation with the same var and exec_cb,
    // so triggering this twice restarts it rather than stacking two.
    lines.push(`${indent}lv_anim_start(&${animVar});`);
  });

  lines.push('}');
  lines.push('');
  lines.push(`void ${animStopFuncName(symbol)}(void) {`);
  for (const { execCb } of symbol.tracks) {
    lines.push(`${indent}${animDeleteFunc(options)}(${symbol.targetVar}, ${execCb});`);
  }
  lines.push('}');

  return lines.join('\n');
}

/** v9 renamed lv_anim_del; both take (var, exec_cb). */
function animDeleteFunc(options: CodeGenOptions): string {
  return options.lvglVersion === '9' ? 'lv_anim_delete' : 'lv_anim_del';
}

/**
 * Emit a start/stop pair for every animation the project can actually run.
 *
 * One named function each, rather than a block buried in the screen's load
 * callback: an animation nothing can name is an animation nothing can trigger,
 * and every trigger beyond "the screen appeared" has to call exactly one of
 * them. An animation with no generatable track gets none — see the comment
 * left in its place by generateScreenAnimationFunc.
 */
export function generateAnimationFunctions(
  symbols: AnimationSymbol[],
  options: CodeGenOptions
): string[] {
  return symbols
    .filter((symbol) => symbol.tracks.length > 0)
    .map((symbol) => generateAnimationFunction(symbol, options));
}

/**
 * Generate code for a single component
 */
function generateComponentCode(
  component: LvglComponent,
  parentVar: string,
  options: CodeGenOptions,
  screenName: string,
  needsScreenPrefix: Set<string>,
  imageResources: ImageResource[] = [],
  defaultFont?: string,
  defaultFontSize?: number,
  useBuiltinSymbols?: boolean,
  symbolFont?: string,
  componentStyles?: Map<string, TypographyBinding>,
  componentTags?: Map<string, TranslationBinding>
): string[] {
  const lines: string[] = [];
  const indent = getIndent(options);
  const varName = needsScreenPrefix.has(component.id)
    ? getComponentVarName(`${screenName}_${component.name}`, options)
    : getComponentVarName(component.name, options);

  // Comment
  if (options.generateComments) {
    lines.push(`${indent}${generateComment(`Create ${component.type}: ${component.name}`, options)}`);
  }

  // Create component
  lines.push(`${indent}${varName} = ${getCreateFunction(component.type, parentVar, options, component.props)};`);

  // Position and size
  lines.push(`${indent}lv_obj_set_pos(${varName}, ${component.x}, ${component.y});`);

  // Width with mode support
  if (component.widthMode === 'content') {
    lines.push(`${indent}lv_obj_set_width(${varName}, LV_SIZE_CONTENT);`);
  } else if (component.widthMode === 'percent') {
    lines.push(`${indent}lv_obj_set_width(${varName}, lv_pct(${component.width}));`);
  } else {
    // Height with mode support — check if we can use set_size for both px
    if (component.heightMode === 'content') {
      lines.push(`${indent}lv_obj_set_width(${varName}, ${component.width});`);
      lines.push(`${indent}lv_obj_set_height(${varName}, LV_SIZE_CONTENT);`);
    } else if (component.heightMode === 'percent') {
      lines.push(`${indent}lv_obj_set_width(${varName}, ${component.width});`);
      lines.push(`${indent}lv_obj_set_height(${varName}, lv_pct(${component.height}));`);
    } else {
      lines.push(`${indent}lv_obj_set_size(${varName}, ${component.width}, ${component.height});`);
    }
  }
  // If width was non-px, still need to emit height separately
  if (component.widthMode === 'content' || component.widthMode === 'percent') {
    if (component.heightMode === 'content') {
      lines.push(`${indent}lv_obj_set_height(${varName}, LV_SIZE_CONTENT);`);
    } else if (component.heightMode === 'percent') {
      lines.push(`${indent}lv_obj_set_height(${varName}, lv_pct(${component.height}));`);
    } else {
      lines.push(`${indent}lv_obj_set_height(${varName}, ${component.height});`);
    }
  }

  // Alignment
  if (component.align && component.align !== 'default') {
    const alignMap: Record<string, string> = {
      'center': 'LV_ALIGN_CENTER',
      'top_left': 'LV_ALIGN_TOP_LEFT',
      'top_mid': 'LV_ALIGN_TOP_MID',
      'top_right': 'LV_ALIGN_TOP_RIGHT',
      'bottom_left': 'LV_ALIGN_BOTTOM_LEFT',
      'bottom_mid': 'LV_ALIGN_BOTTOM_MID',
      'bottom_right': 'LV_ALIGN_BOTTOM_RIGHT',
      'left_mid': 'LV_ALIGN_LEFT_MID',
      'right_mid': 'LV_ALIGN_RIGHT_MID',
    };
    const lvAlign = alignMap[component.align];
    if (lvAlign) {
      const offX = component.alignOffsetX || 0;
      const offY = component.alignOffsetY || 0;
      lines.push(`${indent}lv_obj_align(${varName}, ${lvAlign}, ${offX}, ${offY});`);
    }
  }

  // Flags
  if (component.flags) {
    const f = component.flags;
    if (f.hidden) {
      lines.push(`${indent}lv_obj_add_flag(${varName}, LV_OBJ_FLAG_HIDDEN);`);
    }
    if (f.disabled) {
      lines.push(`${indent}lv_obj_add_state(${varName}, LV_STATE_DISABLED);`);
    }
    if (f.clickable === false) {
      lines.push(`${indent}lv_obj_clear_flag(${varName}, LV_OBJ_FLAG_CLICKABLE);`);
    }
    if (f.checkable) {
      lines.push(`${indent}lv_obj_add_flag(${varName}, LV_OBJ_FLAG_CHECKABLE);`);
    }
    if (f.scrollable === false) {
      lines.push(`${indent}lv_obj_clear_flag(${varName}, LV_OBJ_FLAG_SCROLLABLE);`);
    }
    if (f.scrollElastic === false) {
      lines.push(`${indent}lv_obj_clear_flag(${varName}, LV_OBJ_FLAG_SCROLL_ELASTIC);`);
    }
    if (f.scrollMomentum === false) {
      lines.push(`${indent}lv_obj_clear_flag(${varName}, LV_OBJ_FLAG_SCROLL_MOMENTUM);`);
    }
    if (f.scrollOnFocus === false) {
      lines.push(`${indent}lv_obj_clear_flag(${varName}, LV_OBJ_FLAG_SCROLL_ON_FOCUS);`);
    }
    if (f.snappable) {
      lines.push(`${indent}lv_obj_add_flag(${varName}, LV_OBJ_FLAG_SNAPPABLE);`);
    }
    if (f.pressLock) {
      lines.push(`${indent}lv_obj_add_flag(${varName}, LV_OBJ_FLAG_PRESS_LOCK);`);
    }
    if (f.eventBubble) {
      lines.push(`${indent}lv_obj_add_flag(${varName}, LV_OBJ_FLAG_EVENT_BUBBLE);`);
    }
    if (f.gesturesBubble) {
      lines.push(`${indent}lv_obj_add_flag(${varName}, LV_OBJ_FLAG_GESTURE_BUBBLE);`);
    }
  }

  // Scrollbar mode (not a style API)
  if (component.styles.default.scrollbarMode && component.styles.default.scrollbarMode !== 'auto') {
    const sbMap: Record<string, string> = {
      'off': 'LV_SCROLLBAR_MODE_OFF',
      'on': 'LV_SCROLLBAR_MODE_ON',
      'active': 'LV_SCROLLBAR_MODE_ACTIVE',
    };
    const sbVal = sbMap[component.styles.default.scrollbarMode];
    if (sbVal) {
      lines.push(`${indent}lv_obj_set_scrollbar_mode(${varName}, ${sbVal});`);
    }
  }

  // Typography, if this component's text styling was collected into one. The
  // shared style is added before local styles so it cannot mask them.
  const typographyStyle = componentStyles?.get(component.id);
  if (typographyStyle) {
    lines.push(`${indent}lv_obj_add_style(${varName}, &${typographyStyle.symbol}, 0);`);
    if (component.type === 'dropdown') {
      // The open list is a separate object parented to the screen, so the
      // shared style must reach it too — its rows must match the button
      lines.push(`${indent}lv_obj_add_style(lv_dropdown_get_list(${varName}), &${typographyStyle.symbol}, 0);`);
      if (typographyStyle.customFont) {
        // Text fonts carry no symbol glyphs by design; the ▼ chrome falls back
        // to the default font, which always does. Built-in Montserrat already
        // has them, so it needs no pin.
        lines.push(`${indent}lv_obj_set_style_text_font(${varName}, LV_FONT_DEFAULT, LV_PART_INDICATOR);`);
      }
    }
  }

  // Styles. Only the default state defers to the typography — the other states
  // are not covered by one and keep emitting their own text properties.
  const styleLines = generateStyleCode(varName, withoutBoxStyles(component), options, '0', defaultFont, defaultFontSize, Boolean(typographyStyle));
  lines.push(...styleLines);
  lines.push(...generateArcWidgetStyles(varName, component, options));

  // Ellipsis truncation, emitted after every style so the first measurement
  // already sees the font the label will render with. Size changes re-run it;
  // a translation tag re-resolves through the callback since the label
  // deliberately carries no tag of its own in this mode.
  if (component.type === 'label' && component.props?.longMode === 'ellipsis') {
    const tagged = componentTags?.get(component.id)?.prop === 'text'
      ? componentTags.get(component.id)!.tag
      : undefined;
    if (tagged !== undefined) {
      const tagArg = `(void *)"${escapeCString(tagged)}"`;
      lines.push(`${indent}lv_obj_add_event_cb(${varName}, ui_ellipsis_tr_cb, LV_EVENT_SIZE_CHANGED, ${tagArg});`);
      lines.push(`${indent}lv_obj_add_event_cb(${varName}, ui_ellipsis_tr_cb, LV_EVENT_TRANSLATION_LANGUAGE_CHANGED, ${tagArg});`);
      lines.push(`${indent}ui_ellipsis_apply(${varName}, lv_tr("${escapeCString(tagged)}"));`);
    } else if (typeof component.props.text === 'string' && component.props.text.length > 0) {
      const textArg = `(void *)"${escapeCString(component.props.text)}"`;
      lines.push(`${indent}lv_obj_add_event_cb(${varName}, ui_ellipsis_literal_cb, LV_EVENT_SIZE_CHANGED, ${textArg});`);
      lines.push(`${indent}ui_ellipsis_apply(${varName}, "${escapeCString(component.props.text)}");`);
    }
  }

  // Pressed state styles
  if (component.styles.pressed) {
    const pressedLines = generateStyleCode(varName, component.styles.pressed, options, 'LV_STATE_PRESSED', defaultFont, defaultFontSize);
    lines.push(...pressedLines);
  }

  // Focused state styles
  if (component.styles.focused) {
    const focusedLines = generateStyleCode(varName, component.styles.focused, options, 'LV_STATE_FOCUSED', defaultFont, defaultFontSize);
    lines.push(...focusedLines);
  }

  // Disabled state styles
  if (component.styles.disabled) {
    const disabledLines = generateStyleCode(varName, component.styles.disabled, options, 'LV_STATE_DISABLED', defaultFont, defaultFontSize);
    lines.push(...disabledLines);
  }

  // Checked state styles
  if (component.styles.checked) {
    const checkedLines = generateStyleCode(varName, component.styles.checked, options, 'LV_STATE_CHECKED', defaultFont, defaultFontSize);
    lines.push(...checkedLines);
  }

  // The widget's other parts. Last, so a part that states a property beats the
  // reading the main part's styles were given for it — an arc whose Value part
  // sets a colour over the one Border Color used to stand in for.
  lines.push(...generatePartStyleCode(varName, component, options, defaultFont, defaultFontSize));

  // Component-specific properties
  const propLines = generatePropsCode(varName, component.type, component.props, options, imageResources, defaultFont, defaultFontSize, Boolean(typographyStyle), componentTags?.get(component.id), component);
  lines.push(...propLines);

  // Event bindings. One callback per event type: several bindings of the same
  // type share a handler, so registering per binding would run them twice over.
  for (const eventType of new Set(component.events.map((event) => event.eventType))) {
    const handlerName = getEventHandlerName(component.name, eventType, options);
    lines.push(`${indent}lv_obj_add_event_cb(${varName}, ${handlerName}, ${eventType}, NULL);`);
  }

  // Animations are parked and started from the screen's load callbacks, not
  // here — see generateScreenAnimationFunc. Doing it per screen load is what
  // makes them behave the same on every visit to the screen, not just the first.

  // Visibility
  if (!component.visible) {
    lines.push(`${indent}lv_obj_add_flag(${varName}, LV_OBJ_FLAG_HIDDEN);`);
  }

  lines.push('');

  // Recursively generate children
  if (component.type === 'tabview' && component.props?.tabs?.length > 0) {
    const tabChildMap: Record<string, string[]> = component.props.tabChildMap || {};
    const childToTab: Record<string, string> = {};
    for (const [tabIndex, childIds] of Object.entries(tabChildMap)) {
      if (Array.isArray(childIds)) {
        for (const childId of childIds) {
          childToTab[childId] = `${varName}_tab_${tabIndex}`;
        }
      }
    }
    // Default fallback: unmapped children go to activeTab or tab 0
    const defaultTab = `${varName}_tab_${component.props.activeTab || 0}`;
    for (const child of component.children) {
      const tabParent = childToTab[child.id] || defaultTab;
      lines.push(...generateComponentCode(child, tabParent, options, screenName, needsScreenPrefix, imageResources, defaultFont, defaultFontSize, useBuiltinSymbols, symbolFont, componentStyles, componentTags));
    }
  } else if (component.type === 'tileview' && component.props?.rows !== undefined && component.props?.cols !== undefined) {
    const tileChildMap: Record<string, string[]> = component.props.tileChildMap || {};
    const childToTile: Record<string, string> = {};
    for (const [tileKey, childIds] of Object.entries(tileChildMap)) {
      if (Array.isArray(childIds)) {
        const [r, c] = tileKey.split('-');
        for (const childId of childIds) {
          childToTile[childId] = `${varName}_tile_${r}_${c}`;
        }
      }
    }
    // Default fallback: unmapped children go to tile 0,0
    const defaultTile = `${varName}_tile_0_0`;
    for (const child of component.children) {
      const tileParent = childToTile[child.id] || defaultTile;
      lines.push(...generateComponentCode(child, tileParent, options, screenName, needsScreenPrefix, imageResources, defaultFont, defaultFontSize, useBuiltinSymbols, symbolFont, componentStyles, componentTags));
    }
  } else if (component.type === 'win') {
    // Win children go into the content area
    if (component.children.length > 0) {
      lines.push(`${indent}lv_obj_t * ${varName}_content = lv_win_get_content(${varName});`);
      for (const child of component.children) {
        lines.push(...generateComponentCode(child, `${varName}_content`, options, screenName, needsScreenPrefix, imageResources, defaultFont, defaultFontSize, useBuiltinSymbols, symbolFont, componentStyles, componentTags));
      }
    }
  } else {
    for (const child of component.children) {
      lines.push(...generateComponentCode(child, varName, options, screenName, needsScreenPrefix, imageResources, defaultFont, defaultFontSize, useBuiltinSymbols, symbolFont, componentStyles, componentTags));
    }
  }

  return lines;
}

/** Callback that parks a screen's animated widgets on their start values. */
function getScreenAnimResetFuncName(screenName: string, options: CodeGenOptions): string {
  return `${getScreenVarName(screenName, options)}_reset_anims`;
}

/** Callback that starts a screen's animations once it is fully shown. */

/**
 * Emit the two callbacks that drive a screen's animations.
 *
 * Screens appear through lv_scr_load_anim, and LVGL brackets that transition
 * with two events: LV_EVENT_SCREEN_LOAD_START fires before the first frame of
 * the transition is drawn, LV_EVENT_SCREEN_LOADED once it has finished. Both
 * are needed:
 *
 * - Park on LOAD_START. Widgets keep whatever the last run left them at, so on
 *   a second visit to the screen they would be sitting at their end position for
 *   the whole transition — the screen's contents flashing into view before the
 *   animation resets them.
 * - Start on LOADED. Starting from the init function instead burns the
 *   animation's duration while the screen is not yet visible, so it is only
 *   ever caught part-way through.
 *
 * Returns an empty string when the screen has no animations.
 */
/**
 * The animations a screen plays when it has finished loading, in binding
 * order.
 *
 * Which animations those are is no longer implied by where they sit: the
 * screen says so with a Play Animation binding on LV_EVENT_SCREEN_LOADED. An
 * animation nothing plays is simply never started, which is what lets one be
 * reserved for a button.
 */
function screenLoadAnimations(
  screen: Screen,
  symbols: AnimationSymbol[],
): AnimationSymbol[] {
  const played: AnimationSymbol[] = [];
  for (const event of screen.events ?? []) {
    if (event.eventType !== 'LV_EVENT_SCREEN_LOADED') continue;
    if (event.handlerType !== 'builtin' || event.action?.type !== 'playAnimation') continue;
    const symbol = symbols.find((candidate) => candidate.animation.id === event.action?.animationId);
    // Only what this screen shows: parking a widget that lives elsewhere would
    // move it out from under whichever screen does show it.
    if (symbol && symbol.screen.id === screen.id) played.push(symbol);
  }
  return played;
}

/**
 * Park the widgets a screen's entry animations drive, before the transition to
 * that screen is drawn.
 *
 * The start values still have to be applied automatically: a widget keeps
 * whatever the last run left it at, so on a second visit it would sit at its
 * end position for the whole transition and then jump back. Only the
 * animations the screen actually plays on load are parked — one reserved for a
 * button must stay where the user left it.
 */
function generateScreenAnimationFunc(
  screen: Screen,
  options: CodeGenOptions,
  symbols: AnimationSymbol[]
): string {
  const indent = getIndent(options);
  const played = screenLoadAnimations(screen, symbols);
  if (played.length === 0) return '';

  const resetBody: string[] = [];
  for (const symbol of played) {
    resetBody.push(...generateAnimationInitialState([symbol], options));
  }
  if (resetBody.length === 0) return '';

  return [
    `static void ${getScreenAnimResetFuncName(screen.name, options)}(lv_event_t *event) {`,
    `${indent}LV_UNUSED(event);`,
    ...resetBody,
    '}',
  ].join('\n');
}

/** Whether the screen has any animation start value worth parking. */

function generateScreenInitFunc(
  screen: Screen,
  options: CodeGenOptions,
  needsScreenPrefix: Set<string>,
  animationSymbols: AnimationSymbol[],
  imageResources: ImageResource[] = [],
  defaultFont?: string,
  defaultFontSize?: number,
  useBuiltinSymbols?: boolean,
  symbolFont?: string,
  componentStyles?: Map<string, TypographyBinding>,
  componentTags?: Map<string, TranslationBinding>
): string {
  const lines: string[] = [];
  const indent = getIndent(options);
  const screenVar = getScreenVarName(screen.name, options);
  const funcName = getScreenInitFuncName(screen.name, options);
  
  lines.push(`static void ${funcName}(void) {`);
  
  // Create screen
  if (options.generateComments) {
    lines.push(`${indent}${generateComment(`Create screen: ${screen.name}`, options)}`);
  }
  lines.push(`${indent}${screenVar} = lv_obj_create(NULL);`);

  /*
   * LVGL screens are scrollable by default, so anything reaching past the panel
   * — a slide-in animation starting off-screen, a widget dragged beyond the
   * edge — turns the screen into a scrollable area and raises a scrollbar. The
   * design canvas is a fixed panel-sized viewport that simply clips, so match
   * it: content outside the screen is not shown, and the screen does not grow.
   */
  lines.push(`${indent}lv_obj_clear_flag(${screenVar}, LV_OBJ_FLAG_SCROLLABLE);`);
  lines.push(`${indent}lv_obj_set_scrollbar_mode(${screenVar}, LV_SCROLLBAR_MODE_OFF);`);

  // Screen background color
  if (screen.backgroundColor) {
    lines.push(`${indent}lv_obj_set_style_bg_color(${screenVar}, ${colorToLvgl(screen.backgroundColor)}, 0);`);
  }

  // Set default font on this screen
  if (defaultFont && defaultFont !== 'montserrat_14') {
    const isBuiltin = defaultFont.match(/^montserrat_(\d+)$/);
    if (isBuiltin) {
      lines.push(`${indent}lv_obj_set_style_text_font(${screenVar}, &lv_font_${defaultFont}, 0);`);
    } else if (useBuiltinSymbols) {
      // Use mutable font copy with symbol fallback
      lines.push(`${indent}lv_obj_set_style_text_font(${screenVar}, &ui_default_font_with_fallback, 0);`);
    } else {
      // Custom font without symbol fallback
      const size = defaultFontSize || 16;
      lines.push(`${indent}lv_obj_set_style_text_font(${screenVar}, &${defaultFont}_${size}, 0);`);
    }
  }
  lines.push('');
  
  // Generate components
  for (const component of screen.components) {
    lines.push(...generateComponentCode(component, screenVar, options, screen.name, needsScreenPrefix, imageResources, defaultFont, defaultFontSize, useBuiltinSymbols, symbolFont, componentStyles, componentTags));
  }

  // Park the widgets this screen's entry animations drive, before the
  // transition to it is drawn. Starting them is a binding on the screen, so it
  // comes out of the event table like any other.
  if (generateScreenAnimationFunc(screen, options, animationSymbols) !== '') {
    lines.push(
      `${indent}lv_obj_add_event_cb(${screenVar}, ${getScreenAnimResetFuncName(screen.name, options)}, LV_EVENT_SCREEN_LOAD_START, NULL);`,
    );
  }

  // The screen's own event bindings, one callback per event type.
  for (const eventType of new Set((screen.events ?? []).map((event) => event.eventType))) {
    const handlerName = getEventHandlerName(`screen_${screen.name}`, eventType, options);
    lines.push(`${indent}lv_obj_add_event_cb(${screenVar}, ${handlerName}, ${eventType}, NULL);`);
  }
  lines.push('');

  // User code section
  if (options.userCodeMarkers) {
    lines.push(`${indent}${generateUserCodeSection(`${screen.name}_init`, options)}`);
  }
  
  lines.push('}');
  
  return lines.join('\n');
}

/**
 * Generate screen load function
 */
function generateScreenLoadFunc(screen: Screen, options: CodeGenOptions): string {
  const indent = getIndent(options);
  const screenVar = getScreenVarName(screen.name, options);
  const funcName = getScreenLoadFuncName(screen.name, options);
  
  return [
    `void ${funcName}(void) {`,
    `${indent}lv_scr_load_anim(${screenVar}, LV_SCR_LOAD_ANIM_FADE_ON, 300, 0, false);`,
    '}',
  ].join('\n');
}

/**
 * Collect image resources that are actually referenced by components
 */
function collectUsedImages(screens: Screen[], imageResources: ImageResource[]): ImageResource[] {
  if (imageResources.length === 0) return [];

  const usedIds = new Set<string>();

  const walk = (components: LvglComponent[]) => {
    for (const comp of components) {
      if (comp.type === 'img' && comp.props.src) {
        const matched = imageResources.find(
          (img) => img.id === comp.props.src || img.name === comp.props.src
        );
        if (matched) usedIds.add(matched.id);
      }
      if (comp.type === 'image-button') {
        for (const state of getImageButtonStates(comp)) {
          const matched = getImageResource(state.imageId, imageResources);
          if (matched) usedIds.add(matched.id);
        }
      }
      walk(comp.children);
    }
  };

  for (const screen of screens) {
    walk(screen.components);
  }

  return imageResources.filter((img) => usedIds.has(img.id));
}

function generateImageButtonSupport(
  components: { comp: LvglComponent; screenName: string }[],
  needsScreenPrefix: Set<string>,
  options: CodeGenOptions,
  imageResources: ImageResource[],
): string[] {
  const imageButtons = components.filter(
    ({ comp }) => comp.type === 'image-button',
  );
  if (imageButtons.length === 0) return [];

  const imageSetSource =
    options.lvglVersion === '9' ? 'lv_image_set_src' : 'lv_img_set_src';
  const lines: string[] = [
    'typedef struct {',
    '    lv_obj_t *object;',
    '    const void *const *images;',
    '    const int32_t *values;',
    '    uint16_t state_count;',
    '    uint16_t current_index;',
    '    bool cycle_on_click;',
    '} ui_image_button_context_t;',
    '',
    'static void ui_image_button_apply_state(ui_image_button_context_t *context) {',
    '    const void *image;',
    '',
    '    if ((context == NULL) || (context->object == NULL) ||',
    '        (context->state_count == 0U) ||',
    '        (context->current_index >= context->state_count)) {',
    '        return;',
    '    }',
    '',
    '    image = context->images[context->current_index];',
    '    if (image != NULL) {',
    `        ${imageSetSource}(context->object, image);`,
    '    }',
    '}',
    '',
    'static void ui_image_button_event_cb(lv_event_t *event) {',
    '    ui_image_button_context_t *context =',
    '        (ui_image_button_context_t *)lv_event_get_user_data(event);',
    '',
    '    if ((context == NULL) || !context->cycle_on_click ||',
    '        (context->state_count == 0U)) {',
    '        return;',
    '    }',
    '',
    '    context->current_index =',
    '        (uint16_t)((context->current_index + 1U) % context->state_count);',
    '    ui_image_button_apply_state(context);',
    '    (void)lv_obj_send_event(context->object, LV_EVENT_VALUE_CHANGED, NULL);',
    '}',
    '',
  ];

  for (const { comp, screenName } of imageButtons) {
    const varName = needsScreenPrefix.has(comp.id)
      ? getComponentVarName(`${screenName}_${comp.name}`, options)
      : getComponentVarName(comp.name, options);
    const states = getImageButtonStates(comp);
    const images = states.map((state) => {
      const image = getImageResource(state.imageId, imageResources);
      return image ? `&${image.cArrayName}` : 'NULL';
    });
    const values = states.map((state) => finiteInt32(state.value));
    const initialState = getImageButtonInitialState(comp, states.length);

    lines.push(
      `static const void *const ${varName}_state_images[] = {`,
      `    ${images.join(', ')},`,
      '};',
      `static const int32_t ${varName}_state_values[] = {`,
      `    ${values.join(', ')},`,
      '};',
      `static ui_image_button_context_t ${varName}_image_button_context = {`,
      '    .object = NULL,',
      `    .images = ${varName}_state_images,`,
      `    .values = ${varName}_state_values,`,
      `    .state_count = ${states.length}U,`,
      `    .current_index = ${initialState}U,`,
      `    .cycle_on_click = ${comp.props?.cycleOnClick === false ? 'false' : 'true'},`,
      '};',
      '',
      `float ${varName}_get_value(lv_obj_t *object) {`,
      '    (void)object;',
      `    if (${varName}_image_button_context.state_count == 0U) {`,
      '        return 0.0f;',
      '    }',
      `    return (float)${varName}_image_button_context.values[`,
      `        ${varName}_image_button_context.current_index];`,
      '}',
      '',
      `void ${varName}_set_value(lv_obj_t *object, float value) {`,
      '    uint16_t index;',
      '    (void)object;',
      '',
      `    for (index = 0U; index < ${varName}_image_button_context.state_count; ++index) {`,
      `        if (${varName}_image_button_context.values[index] == (int32_t)value) {`,
      `            ${varName}_image_button_context.current_index = index;`,
      `            ui_image_button_apply_state(&${varName}_image_button_context);`,
      '            return;',
      '        }',
      '    }',
      '}',
      '',
    );
  }

  return lines;
}


/** Style setters for the properties a language switch has to re-apply. */
function styleAssignments(
  symbol: string,
  style: ResolvedTypographyStyle,
  touched: ReadonlySet<string>,
  fontExpr?: string | null,
): string[] {
  const lines: string[] = [];
  const alignMap: Record<string, string> = {
    left: 'LV_TEXT_ALIGN_LEFT', center: 'LV_TEXT_ALIGN_CENTER', right: 'LV_TEXT_ALIGN_RIGHT',
  };
  const decorMap: Record<string, string> = {
    none: 'LV_TEXT_DECOR_NONE',
    underline: 'LV_TEXT_DECOR_UNDERLINE',
    strikethrough: 'LV_TEXT_DECOR_STRIKETHROUGH',
  };

  // fontSize has no setter of its own: an lv_font_t carries its size, so the
  // font and the size are one assignment
  if (touched.has('fontResource') || touched.has('fontSize')) {
    // With no font chosen anywhere there is no symbol to name, and building one
    // out of an empty resource name emitted `&_16` — C that cannot compile. The
    // widget-level path has always guarded this the same way (`else if
    // (styles.textFont)`); a text style that names no font leaves the inherited
    // font alone. Found by the codegen compile tests once they stopped skipping
    // themselves — see docs/emulator.md §3.5.
    const symbol_ = fontSymbol(style.fontResource, style.fontSize);
    const fontReference =
      fontExpr !== undefined ? fontExpr : symbol_ ? `&${symbol_}` : null;
    if (fontReference) {
      lines.push(`lv_style_set_text_font(&${symbol}, ${fontReference});`);
    }
  }
  if (touched.has('letterSpace')) {
    lines.push(`lv_style_set_text_letter_space(&${symbol}, ${style.letterSpace ?? 0});`);
  }
  if (touched.has('lineSpace')) {
    lines.push(`lv_style_set_text_line_space(&${symbol}, ${style.lineSpace ?? 0});`);
  }
  if (touched.has('align')) {
    const align = style.align && style.align !== 'auto' ? alignMap[style.align] : 'LV_TEXT_ALIGN_AUTO';
    lines.push(`lv_style_set_text_align(&${symbol}, ${align});`);
  }
  if (touched.has('decor')) {
    lines.push(`lv_style_set_text_decor(&${symbol}, ${decorMap[style.decor ?? 'none']});`);
  }
  if (touched.has('baseDir')) {
    const dir = style.baseDir === 'rtl'
      ? 'LV_BASE_DIR_RTL'
      : style.baseDir === 'ltr' ? 'LV_BASE_DIR_LTR' : 'LV_BASE_DIR_AUTO';
    lines.push(`lv_style_set_base_dir(&${symbol}, ${dir});`);
  }
  return lines;
}

/** The C symbol for a font, as `LV_FONT_DECLARE` and lv_font_conv name it. */
/**
 * The C symbol for a font, or null when no font was chosen.
 *
 * Null matters: an empty resource name used to compose to `_16`, and
 * `lv_style_set_text_font(&style, &_16)` is C that does not compile. A text
 * style that names no font should leave the inherited font alone, which is what
 * the widget-level path has always done. See docs/emulator.md §3.5.
 */
function fontSymbol(fontResource: string, fontSize: number): string | null {
  if (!fontResource) return null;
  const builtin = fontResource.match(/^montserrat_(\d+)$/);
  return builtin ? `lv_font_montserrat_${builtin[1]}` : `${fontResource}_${fontSize}`;
}

/**
 * The translation table, as three static arrays plus the call that registers
 * them.
 *
 * The layout of `translations` is the trap here. lv_translation.h documents it
 * as `{"Dog", "Cat", "Hund", "Katze"}` — language-major — but the
 * implementation indexes it `translation_p[language_cnt * tag + language]`, and
 * LVGL's own example writes one row per tag holding every language. The header
 * comment is wrong, and following it would mistranslate everything past the
 * first language while still producing plausible-looking strings.
 */
function generateTranslations(
  texts: TextResource[],
  languages: ProjectLanguage[],
  options: CodeGenOptions,
): { declarations: string[]; init: string[] } {
  const declarations: string[] = [];
  const init: string[] = [];
  if (texts.length === 0 || languages.length === 0) return { declarations, init };

  const indent = getIndent(options);
  const codes = languages.map((language) => language.code);

  if (options.generateComments) {
    declarations.push(generateSectionHeader('Translations', options));
    declarations.push('');
  }

  declarations.push(
    `static const char * const ui_languages[] = {${codes.map((c) => `"${escapeCString(c)}"`).join(', ')}, NULL};`,
  );
  declarations.push(
    `static const char * const ui_text_tags[] = {${texts.map((t) => `"${escapeCString(t.key)}"`).join(', ')}, NULL};`,
  );

  if (options.generateComments) {
    declarations.push(`${generateComment('One row per tag, each holding every language in ui_languages order', options)}`);
  }
  declarations.push('static const char * const ui_translations[] = {');
  for (const text of texts) {
    const row = codes
      .map((code) => `"${escapeCString(resolveText(text, code, codes))}"`)
      .join(', ');
    declarations.push(`${indent}${row},${options.generateComments ? ` ${generateComment(text.key, options)}` : ''}`);
  }
  declarations.push('};');
  declarations.push('');

  init.push('static void ui_translation_init(void) {');
  init.push(`${indent}lv_translation_add_static(ui_languages, ui_text_tags, ui_translations);`);
  if (options.generateComments) {
    init.push(`${indent}${generateComment('A tag resolves to itself until a language is selected', options)}`);
  }
  init.push(`${indent}lv_translation_set_language("${escapeCString(codes[0])}");`);
  init.push('}');

  return { declarations, init };
}

/**
 * Callbacks that re-apply a tag when the language changes.
 *
 * `lv_label` is the only widget in LVGL that handles
 * `LV_EVENT_TRANSLATION_LANGUAGE_CHANGED` itself, so anything whose text is not
 * a label needs one of these or it would stay frozen in the language it was
 * built with. The event reaches every object —
 * `lv_translation_set_language` walks the whole tree from NULL — so a callback
 * attached to the widget is all it takes.
 *
 * The tag travels as user data, which is safe because it is a string literal in
 * the generated file and outlives every widget.
 */
function generateTranslationCallbacks(kinds: Set<string>, options: CodeGenOptions): string[] {
  if (kinds.size === 0) return [];

  const lines: string[] = [];
  const indent = getIndent(options);

  if (options.generateComments) {
    lines.push(generateSectionHeader('Translation Callbacks', options));
    lines.push('');
  }

  const emit = (name: string, body: string | string[]) => {
    lines.push(`static void ${name}(lv_event_t * e) {`);
    for (const statement of Array.isArray(body) ? body : [body]) {
      lines.push(`${indent}${statement}`);
    }
    lines.push('}');
    lines.push('');
  };

  if (kinds.has('ellipsis')) {
    // Single-line: the longest prefix of `full` that fits the label's content
    // width with U+2026 appended. LVGL's own DOTS mode writes three ASCII
    // periods, hard-coded in lv_label.c (LV_LABEL_DOT_NUM), so the real
    // character means truncating here, on CLIP mode. The ellipsis travels as
    // its UTF-8 bytes so the generated file's encoding cannot matter.
    lines.push('#define UI_ELLIPSIS_BUF 256');
    lines.push('');
    lines.push('static void ui_ellipsis_apply(lv_obj_t * label, const char * full) {');
    lines.push(`${indent}const lv_font_t * font = lv_obj_get_style_text_font(label, LV_PART_MAIN);`);
    lines.push(`${indent}int32_t letter_space = lv_obj_get_style_text_letter_space(label, LV_PART_MAIN);`);
    lines.push(`${indent}int32_t max_w = lv_obj_get_content_width(label);`);
    lines.push(`${indent}lv_point_t size;`);
    lines.push(`${indent}char buf[UI_ELLIPSIS_BUF];`);
    lines.push(`${indent}uint32_t len;`);
    lines.push(`${indent}uint32_t i = 0;`);
    lines.push(`${indent}uint32_t fit = 0;`);
    lines.push('');
    lines.push(`${indent}lv_text_get_size(&size, full, font, letter_space, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);`);
    lines.push(`${indent}if(size.x <= max_w) {`);
    lines.push(`${indent}${indent}lv_label_set_text(label, full);`);
    lines.push(`${indent}${indent}return;`);
    lines.push(`${indent}}`);
    lines.push('');
    lines.push(`${indent}len = (uint32_t)lv_strlen(full);`);
    lines.push(`${indent}if(len > sizeof(buf) - 4) len = (uint32_t)(sizeof(buf) - 4);`);
    lines.push(`${indent}${generateComment('Never cut inside a UTF-8 sequence', options) || '/* Never cut inside a UTF-8 sequence */'}`);
    lines.push(`${indent}while(len > 0 && (((uint8_t)full[len]) & 0xC0) == 0x80) len--;`);
    lines.push('');
    lines.push(`${indent}while(i < len) {`);
    lines.push(`${indent}${indent}uint32_t next = i + 1;`);
    lines.push(`${indent}${indent}while(next < len && (((uint8_t)full[next]) & 0xC0) == 0x80) next++;`);
    lines.push(`${indent}${indent}lv_memcpy(buf, full, next);`);
    lines.push(`${indent}${indent}lv_memcpy(&buf[next], "\\xE2\\x80\\xA6", 4);`);
    lines.push(`${indent}${indent}lv_text_get_size(&size, buf, font, letter_space, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);`);
    lines.push(`${indent}${indent}if(size.x > max_w) break;`);
    lines.push(`${indent}${indent}fit = next;`);
    lines.push(`${indent}${indent}i = next;`);
    lines.push(`${indent}}`);
    lines.push('');
    lines.push(`${indent}lv_memcpy(buf, full, fit);`);
    lines.push(`${indent}lv_memcpy(&buf[fit], "\\xE2\\x80\\xA6", 4);`);
    lines.push(`${indent}lv_label_set_text(label, buf);`);
    lines.push('}');
    lines.push('');
    if (kinds.has('ellipsis-tr')) {
      emit(
        'ui_ellipsis_tr_cb',
        'ui_ellipsis_apply(lv_event_get_target_obj(e), lv_tr((const char *)lv_event_get_user_data(e)));',
      );
    }
    if (kinds.has('ellipsis-literal')) {
      emit(
        'ui_ellipsis_literal_cb',
        'ui_ellipsis_apply(lv_event_get_target_obj(e), (const char *)lv_event_get_user_data(e));',
      );
    }
  }
  if (kinds.has('dropdown')) {
    // lv_dropdown_set_options resets the selection to 0, so a language switch
    // would yank the user's choice without the save/restore. The index maps
    // across languages because the option count and order are shared — only
    // the words differ between a resource's language values.
    emit('ui_tr_dropdown_cb', [
      'lv_obj_t * obj = lv_event_get_target_obj(e);',
      'uint32_t selected = lv_dropdown_get_selected(obj);',
      'lv_dropdown_set_options(obj, lv_tr((const char *)lv_event_get_user_data(e)));',
      'lv_dropdown_set_selected(obj, selected);',
    ]);
  }
  if (kinds.has('checkbox')) {
    emit(
      'ui_tr_checkbox_cb',
      'lv_checkbox_set_text(lv_event_get_target_obj(e), lv_tr((const char *)lv_event_get_user_data(e)));',
    );
  }
  if (kinds.has('textarea-placeholder')) {
    emit(
      'ui_tr_textarea_placeholder_cb',
      'lv_textarea_set_placeholder_text(lv_event_get_target_obj(e), lv_tr((const char *)lv_event_get_user_data(e)));',
    );
  }
  if (kinds.has('textarea')) {
    emit(
      'ui_tr_textarea_cb',
      'lv_textarea_set_text(lv_event_get_target_obj(e), lv_tr((const char *)lv_event_get_user_data(e)));',
    );
  }

  return lines;
}

/** Component id → typography id, from what the components already carry. */
function collectStoredAssignments(
  screens: Screen[],
  texts: TextResource[],
): Map<string, string> {
  const assignments = new Map<string, string>();
  const walk = (components: LvglComponent[]) => {
    for (const comp of components) {
      // A text resource's typography wins over the widget's — one rule, shared
      // with the canvas and the property editor
      const typographyId = effectiveTypographyId(comp, texts);
      if (typographyId) assignments.set(comp.id, typographyId);
      walk(comp.children ?? []);
    }
  };
  for (const screen of screens) walk(screen.components);
  return assignments;
}

/** `Noto 24` → `ui_style_noto_24`. */
function typographySymbol(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `ui_style_${sanitized || 'text'}`;
}

/**
 * One `lv_style_t` per typography, plus the init that fills it in.
 *
 * Only properties that differ from LVGL's own defaults are set, so the emitted
 * style stays the same size the per-widget calls were.
 */
function generateTypographyStyles(
  typographies: Typography[],
  symbols: Map<string, string>,
  options: CodeGenOptions,
): { declarations: string[]; init: string[]; hasLanguageFonts: boolean } {
  const declarations: string[] = [];
  const init: string[] = [];

  // A language needs a runtime branch only when switching to it changes the
  // style: an lv_style property, or the fallback character, which changes the
  // font copy the style points at. A wildcard-only override is settled at
  // conversion time and generates nothing here.
  const runtimeCodes = (typography: Typography): string[] =>
    overriddenLanguages(typography).filter((code) =>
      languageDifferences(typography, code).some(
        (key) => key !== 'wildcardCharacters' && key !== 'wildcardRanges',
      ),
    );
  const withOverrides = typographies.filter(
    (typography) => runtimeCodes(typography).length > 0,
  );
  const hasLanguageFonts = withOverrides.length > 0;
  if (typographies.length === 0) return { declarations, init, hasLanguageFonts };

  const indent = getIndent(options);

  // Fallback characters, honoured through the one hook LVGL has for the job:
  // the lv_font_t.fallback chain. Each (font, character) pair a fallback
  // typography resolves to — the character varies per language now, as the
  // font always could — gets a mutable copy of the font whose chain ends in a
  // substitute: a second copy whose get_glyph_dsc answers every letter with
  // that language's character. The substitute shares the source font's
  // tables, so the character renders in the face and size of the text it
  // stands in for.
  interface FallbackFont { copySymbol: string; substSymbol: string; source: string; wrapper: string }
  const fallback = new Map<string, { byFont: Map<string, FallbackFont>; wrappers: Map<number, string> }>();
  for (const typography of typographies) {
    const symbol = symbols.get(typography.id)!;
    const byFont = new Map<string, FallbackFont>();
    const wrappers = new Map<number, string>();
    for (const language of [undefined, ...overriddenLanguages(typography)]) {
      const style = resolveTypographyStyle(typography, language);
      const char = style.fallbackCharacter?.codePointAt(0);
      if (char === undefined) continue;
      // A fallback chain is a copy of a named font; with no font named there is
      // nothing to copy, and the typography sets no font at all.
      const source = fontSymbol(style.fontResource, style.fontSize);
      if (!source) continue;
      const key = `${style.fontResource}@${style.fontSize}@${char}`;
      if (byFont.has(key)) continue;
      if (!wrappers.has(char)) {
        wrappers.set(char, wrappers.size === 0 ? `${symbol}_fb_dsc` : `${symbol}_fb_dsc${wrappers.size + 1}`);
      }
      const index = byFont.size + 1;
      byFont.set(key, {
        copySymbol: `${symbol}_fb${index}`,
        substSymbol: `${symbol}_fbsub${index}`,
        source,
        wrapper: wrappers.get(char)!,
      });
    }
    if (byFont.size > 0) fallback.set(typography.id, { byFont, wrappers });
  }

  /** The font a style assignment points at: the fallback copy when one exists. */
  const fontExprFor = (
    typography: Typography,
    style: ResolvedTypographyStyle,
  ): string | null => {
    const char = style.fallbackCharacter?.codePointAt(0);
    const entry = char === undefined
      ? undefined
      : fallback.get(typography.id)?.byFont.get(`${style.fontResource}@${style.fontSize}@${char}`);
    if (entry) return `&${entry.copySymbol}`;
    const named = fontSymbol(style.fontResource, style.fontSize);
    return named ? `&${named}` : null;
  };

  if (options.generateComments) {
    declarations.push(generateSectionHeader('Typographies', options));
    declarations.push('');
  }
  for (const typography of typographies) {
    declarations.push(`static lv_style_t ${symbols.get(typography.id)};`);
  }
  declarations.push('');

  for (const typography of typographies) {
    const entry = fallback.get(typography.id);
    if (!entry) continue;
    for (const font of entry.byFont.values()) {
      declarations.push(`static lv_font_t ${font.copySymbol};`);
      declarations.push(`static lv_font_t ${font.substSymbol};`);
    }
    // Every font the generator can name is fmt_txt-based — converted fonts and
    // the built-in Montserrat alike — so a substitute resolves its one
    // character through the fmt_txt lookup against the tables it shares with
    // the source font. One wrapper per distinct character: languages that
    // declare their own fallback each get theirs.
    for (const [char, wrapper] of entry.wrappers) {
      if (options.generateComments) {
        declarations.push(generateComment(
          `${typography.name}: a glyph its font lacks draws '${String.fromCodePoint(char)}' instead`, options,
        ));
      }
      declarations.push(`static bool ${wrapper}(const lv_font_t * font, lv_font_glyph_dsc_t * dsc, uint32_t letter, uint32_t letter_next) {`);
      declarations.push(`${indent}LV_UNUSED(letter);`);
      declarations.push(`${indent}return lv_font_get_glyph_dsc_fmt_txt(font, dsc, 0x${char.toString(16)}, letter_next);`);
      declarations.push('}');
      declarations.push('');
    }
  }

  if (hasLanguageFonts) {
    // Defined before ui_typography_init, which calls it so the boot language's
    // override applies from the first frame rather than the first switch
    if (options.generateComments) {
      init.push(generateComment('Swap each typography onto the font its language names', options));
    }
    init.push('static void ui_typography_apply_language_fonts(void) {');
    init.push(`${indent}const char * lang = lv_translation_get_language();`);
    init.push(`${indent}if(lang == NULL) return;`);
    const indent2 = getIndent(options, 2);
    for (const typography of withOverrides) {
      const symbol = symbols.get(typography.id)!;
      if (options.generateComments) {
        init.push(`${indent}${generateComment(typography.name, options)}`);
      }

      // The union of what any language changes at runtime. A fallback
      // character difference is a font difference — a different character
      // means the style points at a different font copy — and wildcard
      // differences were settled at conversion time. Every branch writes all
      // of them — including the else, which restores the Default — because a
      // style property set on the way into one language and left alone on the
      // way out would persist into the next.
      const codes = runtimeCodes(typography);
      const touched = new Set(
        codes
          .flatMap((code) => languageDifferences(typography, code))
          .map((key) => (key === 'fallbackCharacter' ? 'fontResource' : key))
          .filter((key) => key !== 'wildcardCharacters' && key !== 'wildcardRanges'),
      );

      codes.forEach((code, index) => {
        const keyword = index === 0 ? 'if' : 'else if';
        init.push(`${indent}${keyword}(lv_streq(lang, "${escapeCString(code)}")) {`);
        const resolved = resolveTypographyStyle(typography, code);
        for (const line of styleAssignments(symbol, resolved, touched, fontExprFor(typography, resolved))) {
          init.push(`${indent2}${line}`);
        }
        init.push(`${indent}}`);
      });
      init.push(`${indent}else {`);
      const base = resolveTypographyStyle(typography);
      for (const line of styleAssignments(symbol, base, touched, fontExprFor(typography, base))) {
        init.push(`${indent2}${line}`);
      }
      init.push(`${indent}}`);
      // No object uses the style yet at boot, in which case this is a no-op
      init.push(`${indent}lv_obj_report_style_change(&${symbol});`);
    }
    init.push('}');
    init.push('');
    init.push('static void ui_typography_language_cb(lv_event_t * e) {');
    init.push(`${indent}LV_UNUSED(e);`);
    init.push(`${indent}ui_typography_apply_language_fonts();`);
    init.push('}');
    init.push('');
  }

  init.push('static void ui_typography_init(void) {');
  if (fallback.size > 0) {
    if (options.generateComments) {
      init.push(`${indent}${generateComment('Fallback chains: source-font copy -> one-character substitute', options)}`);
    }
    for (const typography of typographies) {
      const entry = fallback.get(typography.id);
      if (!entry) continue;
      for (const font of entry.byFont.values()) {
        init.push(`${indent}lv_memcpy(&${font.substSymbol}, &${font.source}, sizeof(lv_font_t));`);
        init.push(`${indent}${font.substSymbol}.get_glyph_dsc = ${font.wrapper};`);
        init.push(`${indent}${font.substSymbol}.fallback = NULL;`);
        init.push(`${indent}lv_memcpy(&${font.copySymbol}, &${font.source}, sizeof(lv_font_t));`);
        init.push(`${indent}${font.copySymbol}.fallback = &${font.substSymbol};`);
      }
    }
    init.push('');
  }
  for (const typography of typographies) {
    const symbol = symbols.get(typography.id)!;
    if (options.generateComments) {
      init.push(`${indent}${generateComment(typography.name, options)}`);
    }
    init.push(`${indent}lv_style_init(&${symbol});`);
    const fontReference = fontExprFor(typography, resolveTypographyStyle(typography));
    if (fontReference) {
      init.push(`${indent}lv_style_set_text_font(&${symbol}, ${fontReference});`);
    }

    if (typography.letterSpace) {
      init.push(`${indent}lv_style_set_text_letter_space(&${symbol}, ${typography.letterSpace});`);
    }
    if (typography.lineSpace) {
      init.push(`${indent}lv_style_set_text_line_space(&${symbol}, ${typography.lineSpace});`);
    }
    if (typography.align && typography.align !== 'auto') {
      const alignMap: Record<string, string> = {
        left: 'LV_TEXT_ALIGN_LEFT',
        center: 'LV_TEXT_ALIGN_CENTER',
        right: 'LV_TEXT_ALIGN_RIGHT',
      };
      init.push(`${indent}lv_style_set_text_align(&${symbol}, ${alignMap[typography.align]});`);
    }
    if (typography.decor && typography.decor !== 'none') {
      const decorMap: Record<string, string> = {
        underline: 'LV_TEXT_DECOR_UNDERLINE',
        strikethrough: 'LV_TEXT_DECOR_STRIKETHROUGH',
      };
      init.push(`${indent}lv_style_set_text_decor(&${symbol}, ${decorMap[typography.decor]});`);
    }
    if (typography.baseDir && typography.baseDir !== 'auto') {
      // Needs LV_USE_BIDI to have any effect — see docs/text-typography-evaluation.md §6
      init.push(
        `${indent}lv_style_set_base_dir(&${symbol}, ${typography.baseDir === 'rtl' ? 'LV_BASE_DIR_RTL' : 'LV_BASE_DIR_LTR'});`,
      );
    }
  }
  if (hasLanguageFonts) {
    init.push(`${indent}ui_typography_apply_language_fonts();`);
  }
  init.push('}');

  return { declarations, init, hasLanguageFonts };
}

/**
 * Generate ui.c source file
 */
export function generateUiSource(screens: Screen[], options: CodeGenOptions, theme?: Theme, imageResources: ImageResource[] = [], defaultFont?: string, defaultFontSize?: number, fontResources: FontResource[] = [], useBuiltinSymbols?: boolean, symbolFont?: string, storedTypographies?: Typography[], texts: TextResource[] = [], languages: ProjectLanguage[] = [], animations: Animation[] = []): string {
  const lines: string[] = [];
  
  // Includes
  lines.push(generateInclude('ui.h'));
  lines.push(generateInclude('ui_events.h'));
  // Only when a screen actually carries a video. The header belongs to the
  // board's firmware rather than to LVGL, and a project with no video must not
  // acquire a dependency on hardware it never asked for.
  if (screensHaveVideo(screens)) {
    lines.push(generateInclude('hmi_video.h'));
  }
  // The QR encoder LVGL bundles, reached directly — see the QR support block.
  // lvgl/src is on every include path this project compiles with.
  if (screensHaveType(screens, 'qrcode')) {
    lines.push(generateInclude('libs/qrcode/qrcodegen.h'));
    lines.push(generateInclude('misc/cache/instance/lv_image_cache.h'));
  }

  // Built-in symbols note
  if (useBuiltinSymbols) {
    const symFontName = symbolFont ? `lv_font_${symbolFont}` : 'lv_font_montserrat_14';
    lines.push('');
    if (options.generateComments) {
      lines.push('/*');
      lines.push(` * LVGL Built-in Symbols (FontAwesome subset) — using font: ${symFontName}`);
      lines.push(' * Usage: lv_label_set_text(label, LV_SYMBOL_OK " Accept");');
      lines.push(` *        lv_obj_set_style_text_font(label, &${symFontName}, 0);`);
      lines.push(' * Symbols: LV_SYMBOL_AUDIO, LV_SYMBOL_VIDEO, LV_SYMBOL_LIST, LV_SYMBOL_OK,');
      lines.push(' * LV_SYMBOL_CLOSE, LV_SYMBOL_POWER, LV_SYMBOL_SETTINGS, LV_SYMBOL_HOME,');
      lines.push(' * LV_SYMBOL_DOWNLOAD, LV_SYMBOL_DRIVE, LV_SYMBOL_REFRESH, LV_SYMBOL_PLAY,');
      lines.push(' * LV_SYMBOL_PAUSE, LV_SYMBOL_STOP, LV_SYMBOL_PREV, LV_SYMBOL_NEXT,');
      lines.push(' * LV_SYMBOL_LEFT, LV_SYMBOL_RIGHT, LV_SYMBOL_UP, LV_SYMBOL_DOWN,');
      lines.push(' * LV_SYMBOL_PLUS, LV_SYMBOL_MINUS, LV_SYMBOL_WARNING, LV_SYMBOL_WIFI,');
      lines.push(' * LV_SYMBOL_BLUETOOTH, LV_SYMBOL_TRASH, LV_SYMBOL_EDIT, LV_SYMBOL_SAVE,');
      lines.push(' * LV_SYMBOL_FILE, LV_SYMBOL_BELL, LV_SYMBOL_KEYBOARD, LV_SYMBOL_GPS, etc.');
      lines.push(' */');
    }
    lines.push(`const lv_font_t *ui_symbol_font = &${symFontName};`);

    // Generate mutable font wrapper for fallback support
    // (const fonts in WASM are placed in read-only memory, so fallback pointer cannot be set at runtime)
    if (defaultFont && !/^montserrat_\d+$/.test(defaultFont)) {
      lines.push('');
      if (options.generateComments) {
        lines.push(`${generateComment('Mutable copy of default font with symbol fallback (const fonts are read-only in WASM)', options)}`);
      }
      lines.push(`static lv_font_t ui_default_font_with_fallback;`);
    }
  }

  // Collect used image resources and add extern declarations
  const usedImageResources = collectUsedImages(screens, imageResources);
  if (usedImageResources.length > 0) {
    lines.push('');
    if (options.generateComments) {
      lines.push(generateSectionHeader('Image Resource Declarations', options));
    }
    for (const img of usedImageResources) {
      lines.push(`${options.lvglVersion === '9' ? 'LV_IMAGE_DECLARE' : 'LV_IMG_DECLARE'}(${img.cArrayName});`);
    }
  }

  // Collect used custom font + size combinations and add LV_FONT_DECLARE
  // Resolved before the font declarations, which must cover typography fonts:
  // every stored typography is initialised whether or not a widget uses it, so
  // a font it names has to be declared even if no widget prop mentions it.
  // Stored ones win — a migrated project carries the author's naming, and
  // deriving again would throw it away. Deriving is the fallback for a project
  // file written before typographies existed.
  const { typographies, assignments } = storedTypographies?.length
    ? {
        typographies: storedTypographies,
        assignments: collectStoredAssignments(screens, texts),
      }
    : deriveTypographies(screens, defaultFont, defaultFontSize);

  const usedCustomFonts = collectUsedCustomFonts(screens, fontResources, defaultFont, defaultFontSize, typographies);
  if (usedCustomFonts.size > 0) {
    lines.push('');
    if (options.generateComments) {
      lines.push(generateSectionHeader('Font Declarations', options));
    }
    for (const [fontName, sizes] of usedCustomFonts) {
      const sortedSizes = [...sizes].sort((a, b) => a - b);
      for (const size of sortedSizes) {
        lines.push(`LV_FONT_DECLARE(${fontName}_${size});`);
      }
    }
  }
  lines.push('');

  // Typographies: one shared lv_style_t per distinct text style in the project
  // (resolved above, before the font declarations they feed).
  const typographySymbols = new Map<string, string>();
  const takenSymbols = new Set<string>();
  for (const typography of typographies) {
    let symbol = typographySymbol(typography.name);
    for (let suffix = 2; takenSymbols.has(symbol); suffix++) {
      symbol = `${typographySymbol(typography.name)}_${suffix}`;
    }
    takenSymbols.add(symbol);
    typographySymbols.set(typography.id, symbol);
  }
  /** Component id → the style symbol to add, and whether its font is custom. */
  const componentStyles = new Map<string, TypographyBinding>();
  const isBuiltin = (font: string) => /^montserrat_\d+$/.test(font);
  /**
   * Every face a typography can resolve to, not only its Default's.
   *
   * `customFont` decides whether the dropdown's chevron has to be pinned to
   * the default font, and a chevron drawn in a text face is a box whichever
   * language put it there — so a typography that stays Montserrat by default
   * and switches to Noto for Japanese still counts as custom.
   */
  const usesCustomFont = new Map(
    typographies.map((typography) => [
      typography.id,
      !isBuiltin(typography.fontResource)
        || Object.values(typography.languages ?? {}).some(
          (style) => style.fontResource && !isBuiltin(style.fontResource),
        ),
    ]),
  );
  for (const [componentId, typographyId] of assignments) {
    const symbol = typographySymbols.get(typographyId);
    if (symbol) {
      componentStyles.set(componentId, {
        symbol,
        customFont: usesCustomFont.get(typographyId) ?? false,
      });
    }
  }

  const typographyCode = generateTypographyStyles(typographies, typographySymbols, options);
  if (typographyCode.declarations.length > 0) {
    lines.push(...typographyCode.declarations);
  }

  // Translations. Only emitted when the project has text resources: without
  // them every widget keeps its literal, which is what it did before.
  const translationCode = generateTranslations(texts, languages, options);
  if (translationCode.declarations.length > 0) {
    lines.push(...translationCode.declarations);
  }
  /** Component id → its tag and the prop the tag stands in for. */
  const componentTags = new Map<string, TranslationBinding>();
  /** Which callbacks are actually needed, so unused ones are not emitted. */
  const translationCallbackKinds = new Set<string>();
  if (texts.length > 0) {
    const keyById = new Map(texts.map((text) => [text.id, text.key]));
    const walkTags = (components: LvglComponent[]) => {
      for (const comp of components) {
        const key = comp.textId ? keyById.get(comp.textId) : undefined;
        if (key) {
          const prop = standInProp(comp);
          componentTags.set(comp.id, { tag: key, prop });
          if (comp.type === 'checkbox' && prop === 'text') translationCallbackKinds.add('checkbox');
          if (comp.type === 'dropdown' && prop === 'options') translationCallbackKinds.add('dropdown');
          if (comp.type === 'textarea') {
            if (prop === 'text') translationCallbackKinds.add('textarea');
            if (prop === 'placeholder') translationCallbackKinds.add('textarea-placeholder');
          }
        }
        walkTags(comp.children ?? []);
      }
    };
    for (const screen of screens) walkTags(screen.components);
  }

  // Ellipsis labels need the truncation helper whether or not they are linked
  // to a text resource, so this walk is independent of the tag walk above
  const walkEllipsis = (components: LvglComponent[]) => {
    for (const comp of components) {
      if (comp.type === 'label' && comp.props?.longMode === 'ellipsis') {
        const tagged = componentTags.get(comp.id)?.prop === 'text';
        if (tagged || (typeof comp.props.text === 'string' && comp.props.text.length > 0)) {
          translationCallbackKinds.add('ellipsis');
          translationCallbackKinds.add(tagged ? 'ellipsis-tr' : 'ellipsis-literal');
        }
      }
      walkEllipsis(comp.children ?? []);
    }
  };
  for (const screen of screens) walkEllipsis(screen.components);

  const translationCallbacks = generateTranslationCallbacks(translationCallbackKinds, options);
  if (translationCallbacks.length > 0) {
    lines.push(...translationCallbacks);
  }

  // Screen definitions
  if (options.generateComments) {
    lines.push(generateSectionHeader('Screen Definitions', options));
    lines.push('');
  }
  
  for (const screen of screens) {
    const varName = getScreenVarName(screen.name, options);
    lines.push(`lv_obj_t *${varName};`);
  }
  lines.push('');
  
  // Component definitions — detect cross-screen name collisions
  const componentsByName = new Map<string, { comp: LvglComponent; screenName: string }[]>();
  const flatten = (components: LvglComponent[], screenName: string) => {
    for (const comp of components) {
      const existing = componentsByName.get(comp.name) || [];
      existing.push({ comp, screenName });
      componentsByName.set(comp.name, existing);
      flatten(comp.children, screenName);
    }
  };
  for (const screen of screens) {
    flatten(screen.components, screen.name);
  }

  // Build a set of component IDs that need screen-prefixed variable names
  const needsScreenPrefix = new Set<string>();
  for (const [, entries] of componentsByName) {
    if (entries.length > 1) {
      // Multiple components share the same name — check if they're on different screens
      const uniquePages = new Set(entries.map(e => e.screenName));
      if (uniquePages.size > 1) {
        for (const entry of entries) {
          needsScreenPrefix.add(entry.comp.id);
        }
      }
    }
  }

  const allComponents: { comp: LvglComponent; screenName: string }[] = [];
  for (const [, entries] of componentsByName) {
    allComponents.push(...entries);
  }

  if (screensHaveType(screens, 'qrcode')) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('QR Code Support', options));
    }
    lines.push(QRCODE_SUPPORT_SOURCE);
    lines.push('');
  }

  if (allComponents.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Component Definitions', options));
      lines.push('');
    }

    for (const { comp, screenName } of allComponents) {
      const varName = needsScreenPrefix.has(comp.id)
        ? getComponentVarName(`${screenName}_${comp.name}`, options)
        : getComponentVarName(comp.name, options);
      lines.push(`lv_obj_t *${varName};`);
      // lv_line_set_points keeps the pointer it is given rather than copying,
      // so the array has to outlive the widget: file scope, beside it.
      if (comp.type === 'line' || comp.type === 'polygon') {
        lines.push(linePointsDeclaration(varName, comp, options));
      }
      // The same for a video's playlist: hmi_video_attach keeps the pointer.
      if (comp.type === 'video') {
        lines.push(videoPlaylistDeclaration(varName, comp));
      }
      // A QR code's settings and content, resolved to a plain string here:
      // the panel re-encodes only when communication changes the words.
      if (comp.type === 'qrcode') {
        lines.push(qrcodeContextDeclaration(varName, comp, texts, languages));
      }
    }
    lines.push('');
  }

  // Before any screen init registers it, and beside the point arrays it reads.
  const polygonFillSupport = generatePolygonFillSupport(
    allComponents.map(({ comp, screenName }) => ({
      comp,
      varName: needsScreenPrefix.has(comp.id)
        ? getComponentVarName(`${screenName}_${comp.name}`, options)
        : getComponentVarName(comp.name, options),
    })),
    options,
  );
  if (polygonFillSupport.length > 0) {
    lines.push(...polygonFillSupport);
  }

  const imageButtonSupport = generateImageButtonSupport(
    allComponents,
    needsScreenPrefix,
    options,
    imageResources,
  );
  if (imageButtonSupport.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Image Button State Support', options));
      lines.push('');
    }
    lines.push(...imageButtonSupport);
  }
  
  const animationSymbols = collectAnimationSymbols(animations, screens, options, needsScreenPrefix);

  // Animation exec-callback wrappers, emitted before anything calls them
  const animationHelpers = generateAnimationHelpers(animationSymbols, options);
  if (animationHelpers.length > 0) {
    lines.push(...animationHelpers);
  }

  const animFuncs = generateAnimationFunctions(animationSymbols, options);
  if (animFuncs.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Animations', options));
      lines.push('');
    }
    for (const source of animFuncs) {
      lines.push(source);
      lines.push('');
    }
  }

  // Animation start callbacks, defined before the init functions that bind them
  const screenAnimFuncs = screens
    .map((screen) => generateScreenAnimationFunc(screen, options, animationSymbols))
    .filter((source) => source !== '');
  if (screenAnimFuncs.length > 0) {
    if (options.generateComments) {
      lines.push(generateSectionHeader('Screen Animations', options));
      lines.push('');
    }
    for (const source of screenAnimFuncs) {
      lines.push(source);
      lines.push('');
    }
  }

  // Screen init functions (static)
  if (options.generateComments) {
    lines.push(generateSectionHeader('Screen Init Functions', options));
    lines.push('');
  }

  for (const screen of screens) {
    lines.push(generateScreenInitFunc(screen, options, needsScreenPrefix, animationSymbols, imageResources, defaultFont, defaultFontSize, useBuiltinSymbols, symbolFont, componentStyles, componentTags));
    lines.push('');
  }
  
  // Screen load functions
  if (options.generateComments) {
    lines.push(generateSectionHeader('Screen Load Functions', options));
    lines.push('');
  }
  
  for (const screen of screens) {
    lines.push(generateScreenLoadFunc(screen, options));
    lines.push('');
  }
  
  // Main init function
  if (options.generateComments) {
    lines.push(generateSectionHeader('Main Init Function', options));
    lines.push('');
  }
  
  const indent = getIndent(options);

  if (typographyCode.init.length > 0) {
    lines.push(...typographyCode.init);
    lines.push('');
  }

  if (translationCode.init.length > 0) {
    lines.push(...translationCode.init);
    lines.push('');
  }

  lines.push('void ui_init(void) {');

  // Registered before anything else: lv_label_set_translation_tag resolves the
  // tag immediately, so a label created first would show its tag as its text
  if (translationCode.init.length > 0) {
    lines.push(`${indent}ui_translation_init();`);
    lines.push('');
  }

  // Styles must be initialised before any screen init adds them to a widget
  if (typographyCode.init.length > 0) {
    lines.push(`${indent}ui_typography_init();`);
    lines.push('');
  }

  // Set symbol font as fallback for custom default font
  if (useBuiltinSymbols && defaultFont && !/^montserrat_\d+$/.test(defaultFont)) {
    const symFontName = symbolFont ? `lv_font_${symbolFont}` : 'lv_font_montserrat_14';
    const defaultFontCName = `${defaultFont}_${defaultFontSize || 16}`;
    lines.push('');
    if (options.generateComments) {
      lines.push(`${indent}${generateComment('Create mutable copy of default font and set symbol font as fallback', options)}`);
    }
    lines.push(`${indent}lv_memcpy(&ui_default_font_with_fallback, &${defaultFontCName}, sizeof(lv_font_t));`);
    lines.push(`${indent}ui_default_font_with_fallback.fallback = &${symFontName};`);
  }

  // Theme initialization
  if (theme) {
    if (options.generateComments) {
      lines.push(`${indent}${generateComment('Initialize theme', options)}`);
    }
    lines.push(`${indent}lv_theme_default_init(NULL, ${colorToLvgl(theme.colors.primary)}, ${colorToLvgl(theme.colors.secondary)}, ${theme.colors.background === '#121212' ? 'true' : 'false'}, LV_FONT_DEFAULT);`);
    lines.push('');
  }
  
  // Initialize all screens
  for (const screen of screens) {
    const initFunc = getScreenInitFuncName(screen.name, options);
    lines.push(`${indent}${initFunc}();`);
  }
  lines.push('');

  // Per-language typography fonts follow the language through this callback.
  // One screen is enough: lv_translation_set_language walks every screen of
  // every display, active or not, so the first screen always hears the event.
  if (typographyCode.hasLanguageFonts && screens.length > 0) {
    if (options.generateComments) {
      lines.push(`${indent}${generateComment('Re-apply per-language typography fonts on language change', options)}`);
    }
    lines.push(
      `${indent}lv_obj_add_event_cb(${getScreenVarName(screens[0].name, options)}, ui_typography_language_cb, LV_EVENT_TRANSLATION_LANGUAGE_CHANGED, NULL);`,
    );
    lines.push('');
  }
  
  // Load the entry screen
  const entryScreen = getEntryScreen(screens);
  if (entryScreen) {
    const loadFunc = getScreenLoadFuncName(entryScreen.name, options);
    lines.push(`${indent}${loadFunc}();`);
  }
  
  // User code section
  if (options.userCodeMarkers) {
    lines.push('');
    lines.push(`${indent}${generateUserCodeSection('ui_init', options)}`);
  }
  
  lines.push('}');
  
  return lines.join('\n');
}
