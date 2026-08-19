// ui.c template generator

import type { Screen, LvglComponent, StyleProps, Theme, Animation, AnimationEasing } from '../../types';
import type { CodeGenOptions } from '../types';
import type { ImageResource, FontResource } from '../../resources/types';
import { collectUsedCustomFonts } from '../fontUsage';
import { deriveTypographies } from '../typography';
import { resolveText } from '../textResources';
import { effectiveTypographyId, standInProp } from '../../utils/componentText';
import { getEntryScreen } from '../../utils/entryScreen';
import {
  ANIM_WRAPPERS,
  ANIM_DIRECT_SETTERS,
  animStartFuncName,
  animStopFuncName,
  collectAnimationSymbols,
  type AnimationSymbol,
} from '../animationSymbols';
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
    textarea: 'lv_textarea_create',
    dropdown: 'lv_dropdown_create',
    checkbox: 'lv_checkbox_create',
    switch: 'lv_switch_create',
    slider: 'lv_slider_create',
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
  translation?: { tag: string; prop: TranslatableProp }
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
      
    case 'line':
      if (props.lineWidth && props.lineWidth !== 2) {
        lines.push(`${indent}lv_obj_set_style_line_width(${varName}, ${props.lineWidth}, 0);`);
      }
      if (props.lineColor) {
        lines.push(`${indent}lv_obj_set_style_line_color(${varName}, ${colorToLvgl(props.lineColor)}, 0);`);
      }
      break;
      
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
 * Statements that put an animated widget at its start value.
 *
 * Uses the same setter the animation drives, so the parked state is identical
 * to the animation's first frame.
 */
function generateAnimationInitialState(
  varName: string,
  animations: Animation[],
  options: CodeGenOptions
): string[] {
  const indent = getIndent(options);
  const lines: string[] = [];

  for (const anim of animations) {
    const wrapper = ANIM_WRAPPERS[anim.property];
    const setter = wrapper ? wrapper.name : ANIM_DIRECT_SETTERS[anim.property];
    if (!setter) continue;
    lines.push(`${indent}${setter}(${varName}, ${anim.startValue});`);
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
    if (ANIM_WRAPPERS[symbol.animation.property]) used.add(symbol.animation.property);
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
 * Generate animation code for a component
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
    lines.push(generateComment(`Animation: ${anim.name || anim.type} on ${symbol.targetVar}`, options));
  }

  lines.push(`void ${animStartFuncName(symbol)}(void) {`);
  lines.push(`${indent}lv_anim_t ${animVar};`);
  lines.push(`${indent}lv_anim_init(&${animVar});`);
  lines.push(`${indent}lv_anim_set_var(&${animVar}, ${symbol.targetVar});`);
  lines.push(`${indent}lv_anim_set_exec_cb(&${animVar}, ${symbol.execCb});`);
  lines.push(`${indent}lv_anim_set_values(&${animVar}, ${anim.startValue}, ${anim.endValue});`);
  lines.push(`${indent}lv_anim_set_time(&${animVar}, ${anim.duration});`);

  if (anim.delay > 0) {
    lines.push(`${indent}lv_anim_set_delay(&${animVar}, ${anim.delay});`);
  }

  lines.push(`${indent}lv_anim_set_path_cb(&${animVar}, ${getEasingPath(anim.easing)});`);

  if (anim.repeat > 0) {
    lines.push(`${indent}lv_anim_set_repeat_count(&${animVar}, ${anim.repeat});`);
  }

  // lv_anim_start drops any running animation with the same var and exec_cb,
  // so triggering this twice restarts it rather than stacking two.
  lines.push(`${indent}lv_anim_start(&${animVar});`);
  lines.push('}');
  lines.push('');
  lines.push(`void ${animStopFuncName(symbol)}(void) {`);
  lines.push(
    `${indent}${animDeleteFunc(options)}(${symbol.targetVar}, ${symbol.execCb});`,
  );
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
 * them. An unanimatable property gets no function — see the comment left in
 * its place by generateScreenAnimationFunc.
 */
export function generateAnimationFunctions(
  symbols: AnimationSymbol[],
  options: CodeGenOptions
): string[] {
  return symbols
    .filter((symbol) => symbol.execCb)
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
  const styleLines = generateStyleCode(varName, component.styles.default, options, '0', defaultFont, defaultFontSize, Boolean(typographyStyle));
  lines.push(...styleLines);

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

  // Component-specific properties
  const propLines = generatePropsCode(varName, component.type, component.props, options, imageResources, defaultFont, defaultFontSize, Boolean(typographyStyle), componentTags?.get(component.id));
  lines.push(...propLines);

  // Event bindings
  for (const event of component.events) {
    const handlerName = getEventHandlerName(component.name, event.eventType, options);
    lines.push(`${indent}lv_obj_add_event_cb(${varName}, ${handlerName}, ${event.eventType}, NULL);`);
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
function getScreenAnimFuncName(screenName: string, options: CodeGenOptions): string {
  return `${getScreenVarName(screenName, options)}_start_anims`;
}

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
function generateScreenAnimationFunc(
  screen: Screen,
  options: CodeGenOptions,
  symbols: AnimationSymbol[]
): string {
  const indent = getIndent(options);
  const startBody: string[] = [];
  const resetBody: string[] = [];

  for (const symbol of symbols) {
    if (symbol.screen.id !== screen.id) continue;
    const anim = symbol.animation;
    startBody.push(
      symbol.execCb
        ? `${indent}${animStartFuncName(symbol)}();`
        : `${indent}// Animation "${anim.name || anim.type}" skipped: property "${anim.property}" is not animatable`,
    );
  }

  for (const symbol of symbols) {
    if (symbol.screen.id !== screen.id) continue;
    resetBody.push(...generateAnimationInitialState(symbol.targetVar, [symbol.animation], options));
  }

  if (startBody.length === 0) return '';

  const sections: string[] = [];
  if (resetBody.length > 0) {
    sections.push([
      `static void ${getScreenAnimResetFuncName(screen.name, options)}(lv_event_t *event) {`,
      `${indent}LV_UNUSED(event);`,
      ...resetBody,
      '}',
    ].join('\n'));
  }
  sections.push([
    `static void ${getScreenAnimFuncName(screen.name, options)}(lv_event_t *event) {`,
    `${indent}LV_UNUSED(event);`,
    ...startBody,
    '}',
  ].join('\n'));

  return sections.join('\n\n');
}

/** Whether the screen has any animation start value worth parking. */
function screenHasAnimationResets(
  screen: Screen,
  options: CodeGenOptions,
  symbols: AnimationSymbol[]
): boolean {
  return symbols.some(
    (symbol) =>
      symbol.screen.id === screen.id &&
      generateAnimationInitialState(symbol.targetVar, [symbol.animation], options).length > 0,
  );
}

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

  // Park animated widgets before the transition draws, start them after it ends
  if (generateScreenAnimationFunc(screen, options, animationSymbols) !== '') {
    if (screenHasAnimationResets(screen, options, animationSymbols)) {
      lines.push(
        `${indent}lv_obj_add_event_cb(${screenVar}, ${getScreenAnimResetFuncName(screen.name, options)}, LV_EVENT_SCREEN_LOAD_START, NULL);`,
      );
    }
    lines.push(
      `${indent}lv_obj_add_event_cb(${screenVar}, ${getScreenAnimFuncName(screen.name, options)}, LV_EVENT_SCREEN_LOADED, NULL);`,
    );
    lines.push('');
  }

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
  fontExpr?: string,
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
    lines.push(`lv_style_set_text_font(&${symbol}, ${fontExpr ?? `&${fontSymbol(style.fontResource, style.fontSize)}`});`);
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
function fontSymbol(fontResource: string, fontSize: number): string {
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
      const key = `${style.fontResource}@${style.fontSize}@${char}`;
      if (byFont.has(key)) continue;
      if (!wrappers.has(char)) {
        wrappers.set(char, wrappers.size === 0 ? `${symbol}_fb_dsc` : `${symbol}_fb_dsc${wrappers.size + 1}`);
      }
      const index = byFont.size + 1;
      byFont.set(key, {
        copySymbol: `${symbol}_fb${index}`,
        substSymbol: `${symbol}_fbsub${index}`,
        source: fontSymbol(style.fontResource, style.fontSize),
        wrapper: wrappers.get(char)!,
      });
    }
    if (byFont.size > 0) fallback.set(typography.id, { byFont, wrappers });
  }

  /** The font a style assignment points at: the fallback copy when one exists. */
  const fontExprFor = (typography: Typography, style: ResolvedTypographyStyle): string => {
    const char = style.fallbackCharacter?.codePointAt(0);
    const entry = char === undefined
      ? undefined
      : fallback.get(typography.id)?.byFont.get(`${style.fontResource}@${style.fontSize}@${char}`);
    return entry ? `&${entry.copySymbol}` : `&${fontSymbol(style.fontResource, style.fontSize)}`;
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
    init.push(
      `${indent}lv_style_set_text_font(&${symbol}, ${fontExprFor(typography, resolveTypographyStyle(typography))});`,
    );

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
  const typographyFontById = new Map(
    typographies.map((typography) => [typography.id, typography.fontResource]),
  );
  for (const [componentId, typographyId] of assignments) {
    const symbol = typographySymbols.get(typographyId);
    if (symbol) {
      const fontResource = typographyFontById.get(typographyId) ?? '';
      componentStyles.set(componentId, {
        symbol,
        customFont: !/^montserrat_\d+$/.test(fontResource),
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
    }
    lines.push('');
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
