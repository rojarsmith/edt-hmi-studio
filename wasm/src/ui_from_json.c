/*
 * ui_from_json.c  –  Parse JSON and create real LVGL widgets
 * Uses cJSON for parsing.
 */
#include "ui_from_json.h"
#include "cJSON.h"
#include "lvgl.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/* Parse "#RRGGBB" to lv_color_t */
static lv_color_t hex_to_color(const char *hex) {
    if (!hex || hex[0] != '#' || strlen(hex) < 7)
        return lv_color_hex(0x000000);
    unsigned long v = strtoul(hex + 1, NULL, 16);
    return lv_color_hex(v);
}

static const char *cjson_get_string(const cJSON *obj, const char *key) {
    cJSON *item = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsString(item)) return item->valuestring;
    return NULL;
}

static int cjson_get_int(const cJSON *obj, const char *key, int def) {
    cJSON *item = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsNumber(item)) return item->valueint;
    return def;
}

static double cjson_get_double(const cJSON *obj, const char *key, double def) {
    cJSON *item = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsNumber(item)) return item->valuedouble;
    return def;
}

static int cjson_get_bool(const cJSON *obj, const char *key, int def) {
    cJSON *item = cJSON_GetObjectItemCaseSensitive(obj, key);
    if (cJSON_IsBool(item)) return cJSON_IsTrue(item);
    return def;
}

/* ------------------------------------------------------------------ */
/*  Style application                                                  */
/* ------------------------------------------------------------------ */

static void apply_style_state(lv_obj_t *obj, const cJSON *style, lv_style_selector_t sel) {
    if (!style) return;

    const char *s;
    cJSON *item;

    /* bgColor */
    s = cjson_get_string(style, "bgColor");
    if (s && strcmp(s, "transparent") != 0) {
        lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, sel);
        lv_obj_set_style_bg_color(obj, hex_to_color(s), sel);
    } else if (s && strcmp(s, "transparent") == 0) {
        lv_obj_set_style_bg_opa(obj, LV_OPA_TRANSP, sel);
    }

    /* borderColor */
    s = cjson_get_string(style, "borderColor");
    if (s && strcmp(s, "transparent") != 0)
        lv_obj_set_style_border_color(obj, hex_to_color(s), sel);

    /* borderWidth */
    item = cJSON_GetObjectItemCaseSensitive(style, "borderWidth");
    if (cJSON_IsNumber(item))
        lv_obj_set_style_border_width(obj, item->valueint, sel);

    /* borderRadius */
    item = cJSON_GetObjectItemCaseSensitive(style, "borderRadius");
    if (cJSON_IsNumber(item))
        lv_obj_set_style_radius(obj, item->valueint, sel);

    /* textColor */
    s = cjson_get_string(style, "textColor");
    if (s) lv_obj_set_style_text_color(obj, hex_to_color(s), sel);

    /* opacity */
    item = cJSON_GetObjectItemCaseSensitive(style, "opacity");
    if (cJSON_IsNumber(item)) {
        int opa = item->valueint;
        if (opa <= 1) opa = (int)(item->valuedouble * 255);
        lv_obj_set_style_opa(obj, (lv_opa_t)opa, sel);
    }

    /* padding (uniform) */
    item = cJSON_GetObjectItemCaseSensitive(style, "padding");
    if (cJSON_IsNumber(item))
        lv_obj_set_style_pad_all(obj, item->valueint, sel);

    /* four-direction padding */
    item = cJSON_GetObjectItemCaseSensitive(style, "paddingTop");
    if (cJSON_IsNumber(item)) lv_obj_set_style_pad_top(obj, item->valueint, sel);
    item = cJSON_GetObjectItemCaseSensitive(style, "paddingBottom");
    if (cJSON_IsNumber(item)) lv_obj_set_style_pad_bottom(obj, item->valueint, sel);
    item = cJSON_GetObjectItemCaseSensitive(style, "paddingLeft");
    if (cJSON_IsNumber(item)) lv_obj_set_style_pad_left(obj, item->valueint, sel);
    item = cJSON_GetObjectItemCaseSensitive(style, "paddingRight");
    if (cJSON_IsNumber(item)) lv_obj_set_style_pad_right(obj, item->valueint, sel);

    /* shadow */
    s = cjson_get_string(style, "shadowColor");
    if (s) lv_obj_set_style_shadow_color(obj, hex_to_color(s), sel);
    item = cJSON_GetObjectItemCaseSensitive(style, "shadowWidth");
    if (cJSON_IsNumber(item)) lv_obj_set_style_shadow_width(obj, item->valueint, sel);
    item = cJSON_GetObjectItemCaseSensitive(style, "shadowOffsetX");
    if (cJSON_IsNumber(item)) lv_obj_set_style_shadow_offset_x(obj, item->valueint, sel);
    item = cJSON_GetObjectItemCaseSensitive(style, "shadowOffsetY");
    if (cJSON_IsNumber(item)) lv_obj_set_style_shadow_offset_y(obj, item->valueint, sel);
    item = cJSON_GetObjectItemCaseSensitive(style, "shadowSpread");
    if (cJSON_IsNumber(item)) lv_obj_set_style_shadow_spread(obj, item->valueint, sel);
    item = cJSON_GetObjectItemCaseSensitive(style, "shadowOpacity");
    if (cJSON_IsNumber(item)) lv_obj_set_style_shadow_opa(obj, (lv_opa_t)item->valueint, sel);

    /* background gradient */
    s = cjson_get_string(style, "bgGradColor");
    if (s) lv_obj_set_style_bg_grad_color(obj, hex_to_color(s), sel);
    s = cjson_get_string(style, "bgGradDir");
    if (s) {
        if (strcmp(s, "hor") == 0) lv_obj_set_style_bg_grad_dir(obj, LV_GRAD_DIR_HOR, sel);
        else if (strcmp(s, "ver") == 0) lv_obj_set_style_bg_grad_dir(obj, LV_GRAD_DIR_VER, sel);
    }

    /* outline */
    s = cjson_get_string(style, "outlineColor");
    if (s) lv_obj_set_style_outline_color(obj, hex_to_color(s), sel);
    item = cJSON_GetObjectItemCaseSensitive(style, "outlineWidth");
    if (cJSON_IsNumber(item)) lv_obj_set_style_outline_width(obj, item->valueint, sel);
    item = cJSON_GetObjectItemCaseSensitive(style, "outlinePad");
    if (cJSON_IsNumber(item)) lv_obj_set_style_outline_pad(obj, item->valueint, sel);
}

static void apply_styles(lv_obj_t *obj, const cJSON *styles) {
    if (!styles) return;
    apply_style_state(obj, cJSON_GetObjectItemCaseSensitive(styles, "default"), LV_PART_MAIN | LV_STATE_DEFAULT);
    apply_style_state(obj, cJSON_GetObjectItemCaseSensitive(styles, "pressed"), LV_PART_MAIN | LV_STATE_PRESSED);
    apply_style_state(obj, cJSON_GetObjectItemCaseSensitive(styles, "focused"), LV_PART_MAIN | LV_STATE_FOCUSED);
    apply_style_state(obj, cJSON_GetObjectItemCaseSensitive(styles, "disabled"), LV_PART_MAIN | LV_STATE_DISABLED);
}

/* ------------------------------------------------------------------ */
/*  ID map – so children can find their parent by id string            */
/* ------------------------------------------------------------------ */

#define MAX_COMPONENTS 256

typedef struct {
    char id[64];
    lv_obj_t *obj;
} id_map_entry_t;

static id_map_entry_t id_map[MAX_COMPONENTS];
static int id_map_count = 0;

static void id_map_reset(void) { id_map_count = 0; }

static void id_map_add(const char *id, lv_obj_t *obj) {
    if (id_map_count >= MAX_COMPONENTS) return;
    strncpy(id_map[id_map_count].id, id, 63);
    id_map[id_map_count].id[63] = '\0';
    id_map[id_map_count].obj = obj;
    id_map_count++;
}

static lv_obj_t *id_map_find(const char *id) {
    if (!id) return NULL;
    for (int i = 0; i < id_map_count; i++) {
        if (strcmp(id_map[i].id, id) == 0) return id_map[i].obj;
    }
    return NULL;
}

/* ------------------------------------------------------------------ */
/*  Component creators                                                 */
/* ------------------------------------------------------------------ */

static lv_obj_t *create_obj(lv_obj_t *parent, const cJSON *comp) {
    (void)comp;
    return lv_obj_create(parent);
}

static lv_obj_t *create_btn(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *btn = lv_button_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text) {
            lv_obj_t *lbl = lv_label_create(btn);
            lv_label_set_text(lbl, text);
            lv_obj_center(lbl);
        }
    }
    return btn;
}

static lv_obj_t *create_label(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *lbl = lv_label_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text) lv_label_set_text(lbl, text);
    }
    return lbl;
}

static lv_obj_t *create_slider(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *slider = lv_slider_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int mn = cjson_get_int(props, "min", 0);
        int mx = cjson_get_int(props, "max", 100);
        int val = cjson_get_int(props, "value", 50);
        lv_slider_set_range(slider, mn, mx);
        lv_slider_set_value(slider, val, LV_ANIM_OFF);
    }
    return slider;
}

static lv_obj_t *create_bar(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *bar = lv_bar_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int mn = cjson_get_int(props, "min", 0);
        int mx = cjson_get_int(props, "max", 100);
        int val = cjson_get_int(props, "value", 50);
        lv_bar_set_range(bar, mn, mx);
        lv_bar_set_value(bar, val, LV_ANIM_OFF);
    }
    return bar;
}

static lv_obj_t *create_arc(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *arc = lv_arc_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int mn = cjson_get_int(props, "min", 0);
        int mx = cjson_get_int(props, "max", 100);
        int val = cjson_get_int(props, "value", 75);
        lv_arc_set_range(arc, mn, mx);
        lv_arc_set_value(arc, val);
    }
    return arc;
}

static lv_obj_t *create_switch(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *sw = lv_switch_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int checked = cjson_get_bool(props, "checked", 0);
        if (checked) lv_obj_add_state(sw, LV_STATE_CHECKED);
    }
    return sw;
}

static lv_obj_t *create_checkbox(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *cb = lv_checkbox_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text) lv_checkbox_set_text(cb, text);
        int checked = cjson_get_bool(props, "checked", 0);
        if (checked) lv_obj_add_state(cb, LV_STATE_CHECKED);
    }
    return cb;
}

static lv_obj_t *create_dropdown(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *dd = lv_dropdown_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        cJSON *options = cJSON_GetObjectItemCaseSensitive(props, "options");
        if (cJSON_IsArray(options)) {
            /* Build newline-separated options string */
            char buf[512] = {0};
            int first = 1;
            cJSON *opt;
            cJSON_ArrayForEach(opt, options) {
                if (cJSON_IsString(opt)) {
                    if (!first) strncat(buf, "\n", sizeof(buf) - strlen(buf) - 1);
                    strncat(buf, opt->valuestring, sizeof(buf) - strlen(buf) - 1);
                    first = 0;
                }
            }
            lv_dropdown_set_options(dd, buf);
        }
        int sel = cjson_get_int(props, "selected", 0);
        lv_dropdown_set_selected(dd, (uint32_t)sel);
    }
    return dd;
}

static lv_obj_t *create_textarea(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *ta = lv_textarea_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *text = cjson_get_string(props, "text");
        if (text && text[0]) lv_textarea_set_text(ta, text);
        const char *ph = cjson_get_string(props, "placeholder");
        if (ph) lv_textarea_set_placeholder_text(ta, ph);
    }
    return ta;
}

static lv_obj_t *create_table(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *tbl = lv_table_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int rows = cjson_get_int(props, "rows", 3);
        int cols = cjson_get_int(props, "cols", 3);
        lv_table_set_row_count(tbl, (uint32_t)rows);
        lv_table_set_column_count(tbl, (uint32_t)cols);
        /* Fill header row */
        for (int c = 0; c < cols; c++) {
            char hdr[32];
            snprintf(hdr, sizeof(hdr), "Col %d", c + 1);
            lv_table_set_cell_value(tbl, 0, (uint32_t)c, hdr);
        }
    }
    return tbl;
}

static lv_obj_t *create_chart(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *chart = lv_chart_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        const char *type_str = cjson_get_string(props, "type");
        if (type_str && strcmp(type_str, "bar") == 0)
            lv_chart_set_type(chart, LV_CHART_TYPE_BAR);
        else
            lv_chart_set_type(chart, LV_CHART_TYPE_LINE);

        cJSON *data = cJSON_GetObjectItemCaseSensitive(props, "data");
        if (cJSON_IsArray(data)) {
            int cnt = cJSON_GetArraySize(data);
            lv_chart_set_point_count(chart, (uint32_t)cnt);
            lv_chart_series_t *ser = lv_chart_add_series(chart, lv_color_hex(0x2196F3), LV_CHART_AXIS_PRIMARY_Y);
            cJSON *val;
            cJSON_ArrayForEach(val, data) {
                if (cJSON_IsNumber(val))
                    lv_chart_set_next_value(chart, ser, val->valueint);
            }
        }
    }
    return chart;
}

static lv_obj_t *create_calendar(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *cal = lv_calendar_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    if (props) {
        int year = cjson_get_int(props, "year", 2026);
        int month = cjson_get_int(props, "month", 1);
        lv_calendar_set_today_date(cal, (uint32_t)year, (uint32_t)month, 1);
        lv_calendar_set_showed_date(cal, (uint32_t)year, (uint32_t)month);
    }
    return cal;
}

static lv_obj_t *create_tabview(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *tv = lv_tabview_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    const char *comp_id = cjson_get_string(comp, "id");
    if (props) {
        /* Set tab bar position */
        const char *pos = cjson_get_string(props, "tabPosition");
        if (pos) {
            lv_dir_t dir = LV_DIR_TOP;
            if (strcmp(pos, "bottom") == 0) dir = LV_DIR_BOTTOM;
            else if (strcmp(pos, "left") == 0) dir = LV_DIR_LEFT;
            else if (strcmp(pos, "right") == 0) dir = LV_DIR_RIGHT;
            lv_tabview_set_tab_bar_position(tv, dir);
        }
        int tab_size = cjson_get_int(props, "tabBarSize", 50);
        lv_tabview_set_tab_bar_size(tv, tab_size);

        cJSON *tabs = cJSON_GetObjectItemCaseSensitive(props, "tabs");
        if (cJSON_IsArray(tabs)) {
            int idx = 0;
            cJSON *tab;
            cJSON_ArrayForEach(tab, tabs) {
                if (cJSON_IsString(tab)) {
                    lv_obj_t *page = lv_tabview_add_tab(tv, tab->valuestring);
                    /* Register tab page with virtual ID so children can find it */
                    if (comp_id && page) {
                        char vid[128];
                        snprintf(vid, sizeof(vid), "%s__tab__%d", comp_id, idx);
                        id_map_add(vid, page);
                    }
                    idx++;
                }
            }
        }
        int active = cjson_get_int(props, "activeTab", 0);
        lv_tabview_set_active(tv, (uint32_t)active, LV_ANIM_OFF);
    }
    return tv;
}

static lv_obj_t *create_tileview(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *tv = lv_tileview_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    const char *comp_id = cjson_get_string(comp, "id");
    if (props) {
        int rows = cjson_get_int(props, "rows", 2);
        int cols = cjson_get_int(props, "cols", 2);
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                lv_obj_t *tile = lv_tileview_add_tile(tv, (uint8_t)c, (uint8_t)r, LV_DIR_ALL);
                /* Register tile with virtual ID */
                if (comp_id && tile) {
                    char vid[128];
                    snprintf(vid, sizeof(vid), "%s__tile__%d-%d", comp_id, r, c);
                    id_map_add(vid, tile);
                }
            }
        }
        int cr = cjson_get_int(props, "currentRow", 0);
        int cc = cjson_get_int(props, "currentCol", 0);
        lv_tileview_set_tile_by_index(tv, (uint32_t)cc, (uint32_t)cr, LV_ANIM_OFF);
    }
    return tv;
}

static lv_obj_t *create_win(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *win = lv_win_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    const char *comp_id = cjson_get_string(comp, "id");
    if (props) {
        const char *title = cjson_get_string(props, "title");
        if (title) lv_win_add_title(win, title);
    }
    /* Register win content area with virtual ID */
    if (comp_id) {
        lv_obj_t *content = lv_win_get_content(win);
        if (content) {
            char vid[128];
            snprintf(vid, sizeof(vid), "%s__win_content", comp_id);
            id_map_add(vid, content);
        }
    }
    return win;
}

/*
 * A video, in a browser tab that has no SD card.
 *
 * The Emulator runs the real LVGL against the real screen definition, but the
 * one thing it cannot have is the panel's card reader — so it draws the frame
 * the picture will occupy and says, in the widget itself, that the file is not
 * read here. Showing "Video not found" would be a different claim: that the
 * card was looked at and came back empty. Only the panel can say that.
 */
static lv_obj_t *create_video(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *frame = lv_obj_create(parent);
    lv_obj_remove_flag(frame, LV_OBJ_FLAG_SCROLLABLE);

    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    const char *file = props ? cjson_get_string(props, "fileName") : NULL;
    if (file && file[0] == 0) file = NULL;

    lv_obj_t *text = lv_label_create(frame);
    lv_label_set_long_mode(text, LV_LABEL_LONG_MODE_DOTS);
    lv_obj_set_width(text, lv_pct(90));
    lv_obj_set_style_text_align(text, LV_TEXT_ALIGN_CENTER, 0);
    if (file) {
        lv_label_set_text_fmt(text, LV_SYMBOL_VIDEO " %s\nNot played in the Emulator", file);
    } else {
        lv_label_set_text(text, LV_SYMBOL_VIDEO " No file named");
    }
    lv_obj_center(text);
    return frame;
}

static lv_obj_t *create_spinner(lv_obj_t *parent, const cJSON *comp) {
    (void)comp;
    return lv_spinner_create(parent);
}

/*
 * lv_line_set_points keeps the pointer it is given rather than copying, so the
 * points have to outlive the widget. One shared array would make every line on
 * the screen draw the last one's points, so each takes a slot from this pool,
 * which is emptied with the rest of the UI on every load.
 */
#define LINE_POOL_LINES 32
#define LINE_POOL_POINTS 8
static lv_point_precise_t line_point_pool[LINE_POOL_LINES][LINE_POOL_POINTS];
static int line_pool_used;

static void line_pool_reset(void) { line_pool_used = 0; }

static lv_obj_t *create_line(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *line = lv_line_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    int slot = line_pool_used < LINE_POOL_LINES ? line_pool_used++ : LINE_POOL_LINES - 1;
    lv_point_precise_t *points = line_point_pool[slot];
    int w = cjson_get_int(comp, "width", 100);
    int count = 0;

    if (props) {
        cJSON *pts = cJSON_GetObjectItemCaseSensitive(props, "points");
        if (cJSON_IsArray(pts)) {
            cJSON *pt;
            cJSON_ArrayForEach(pt, pts) {
                if (count >= LINE_POOL_POINTS) break;
                if (!cJSON_IsArray(pt) || cJSON_GetArraySize(pt) < 2) continue;
                points[count].x = cJSON_GetArrayItem(pt, 0)->valueint;
                points[count].y = cJSON_GetArrayItem(pt, 1)->valueint;
                count++;
            }
        }
    }

    /* Fall back to the horizontal line the widget's own width describes */
    if (count < 2) {
        points[0].x = 0; points[0].y = 0;
        points[1].x = w; points[1].y = 0;
        count = 2;
    }
    lv_line_set_points(line, points, count);

    /* The line_* styles are the whole of a line's appearance, and apply_styles
       does not touch them, so they are set here. */
    if (props) {
        const cJSON *item = cJSON_GetObjectItemCaseSensitive(props, "lineWidth");
        if (cJSON_IsNumber(item))
            lv_obj_set_style_line_width(line, item->valueint, LV_PART_MAIN);
        const char *color = cjson_get_string(props, "lineColor");
        if (color)
            lv_obj_set_style_line_color(line, hex_to_color(color), LV_PART_MAIN);
        if (cjson_get_bool(props, "lineRounded", 0))
            lv_obj_set_style_line_rounded(line, true, LV_PART_MAIN);
        item = cJSON_GetObjectItemCaseSensitive(props, "lineDashWidth");
        if (cJSON_IsNumber(item) && item->valueint > 0) {
            const cJSON *gap = cJSON_GetObjectItemCaseSensitive(props, "lineDashGap");
            lv_obj_set_style_line_dash_width(line, item->valueint, LV_PART_MAIN);
            lv_obj_set_style_line_dash_gap(
                line,
                cJSON_IsNumber(gap) && gap->valueint > 0 ? gap->valueint : item->valueint,
                LV_PART_MAIN);
        }
    }
    return line;
}

/*
 * The Polygon widget: a closed line over a fill of triangles.
 *
 * LVGL has no polygon widget and no filled-polygon primitive, so the outline
 * is an lv_line whose first point is repeated at the end, and the fill is a
 * fan of triangles sharing that point - the same pair of things the generated
 * firmware draws, so this preview shows what the panel will.
 *
 * A fan only covers a convex outline. A concave one is drawn unfilled here
 * exactly as it is on the canvas and on the panel.
 */
typedef struct {
    const lv_point_precise_t *points;
    uint32_t point_cnt;
    lv_color_t color;
} polygon_fill_t;

#define POLYGON_POOL_SHAPES LINE_POOL_LINES
static polygon_fill_t polygon_fill_pool[POLYGON_POOL_SHAPES];
static int polygon_pool_used;

static void polygon_pool_reset(void) { polygon_pool_used = 0; }

/* True when the outline turns the same way all the way round. */
static bool polygon_is_convex(const lv_point_precise_t *p, int n) {
    int sign = 0;
    if (n < 3) return false;
    for (int i = 0; i < n; i++) {
        int32_t ax = (int32_t)p[i].x, ay = (int32_t)p[i].y;
        int32_t bx = (int32_t)p[(i + 1) % n].x, by = (int32_t)p[(i + 1) % n].y;
        int32_t cx = (int32_t)p[(i + 2) % n].x, cy = (int32_t)p[(i + 2) % n].y;
        int32_t cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
        int turn;
        if (cross == 0) continue;
        turn = cross > 0 ? 1 : -1;
        if (sign == 0) sign = turn;
        else if (turn != sign) return false;
    }
    return sign != 0;
}

static void polygon_fill_cb(lv_event_t *e) {
    lv_obj_t *obj = lv_event_get_target(e);
    lv_layer_t *layer = lv_event_get_layer(e);
    const polygon_fill_t *fill = lv_event_get_user_data(e);
    lv_area_t area;
    int32_t x_ofs, y_ofs;
    lv_draw_triangle_dsc_t dsc;
    uint32_t i;

    lv_obj_get_coords(obj, &area);
    x_ofs = area.x1 - lv_obj_get_scroll_x(obj);
    y_ofs = area.y1 - lv_obj_get_scroll_y(obj);

    lv_draw_triangle_dsc_init(&dsc);
    dsc.color = fill->color;
    dsc.opa = lv_obj_get_style_opa(obj, LV_PART_MAIN);

    for (i = 1; i + 1 < fill->point_cnt; i++) {
        dsc.p[0].x = fill->points[0].x + x_ofs;
        dsc.p[0].y = fill->points[0].y + y_ofs;
        dsc.p[1].x = fill->points[i].x + x_ofs;
        dsc.p[1].y = fill->points[i].y + y_ofs;
        dsc.p[2].x = fill->points[i + 1].x + x_ofs;
        dsc.p[2].y = fill->points[i + 1].y + y_ofs;
        lv_draw_triangle(layer, &dsc);
    }
}

static lv_obj_t *create_polygon(lv_obj_t *parent, const cJSON *comp) {
    lv_obj_t *poly = lv_line_create(parent);
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    const cJSON *styles = cJSON_GetObjectItemCaseSensitive(comp, "styles");
    int slot = line_pool_used < LINE_POOL_LINES ? line_pool_used++ : LINE_POOL_LINES - 1;
    lv_point_precise_t *points = line_point_pool[slot];
    int count = 0;
    const char *fill_color = NULL;

    if (props) {
        cJSON *pts = cJSON_GetObjectItemCaseSensitive(props, "points");
        if (cJSON_IsArray(pts)) {
            cJSON *pt;
            cJSON_ArrayForEach(pt, pts) {
                /* One slot is kept for the repeat that closes the run. */
                if (count >= LINE_POOL_POINTS - 1) break;
                if (!cJSON_IsArray(pt) || cJSON_GetArraySize(pt) < 2) continue;
                points[count].x = cJSON_GetArrayItem(pt, 0)->valuedouble;
                points[count].y = cJSON_GetArrayItem(pt, 1)->valuedouble;
                count++;
            }
        }
    }
    if (count < 3) return poly;

    if (styles) {
        const cJSON *def = cJSON_GetObjectItemCaseSensitive(styles, "default");
        if (def) fill_color = cjson_get_string(def, "bgColor");
    }

    if (fill_color && strcmp(fill_color, "transparent") != 0 &&
        polygon_is_convex(points, count) && polygon_pool_used < POLYGON_POOL_SHAPES) {
        polygon_fill_t *fill = &polygon_fill_pool[polygon_pool_used++];
        fill->points = points;
        fill->point_cnt = (uint32_t)count;
        fill->color = hex_to_color(fill_color);
        lv_obj_add_event_cb(poly, polygon_fill_cb, LV_EVENT_DRAW_MAIN_BEGIN, fill);
    }

    /* Closed here, because lv_line draws an open polyline. */
    points[count] = points[0];
    lv_line_set_points(poly, points, count + 1);

    if (props) {
        const cJSON *item = cJSON_GetObjectItemCaseSensitive(props, "lineWidth");
        if (cJSON_IsNumber(item))
            lv_obj_set_style_line_width(poly, item->valueint, LV_PART_MAIN);
        const char *color = cjson_get_string(props, "lineColor");
        if (color)
            lv_obj_set_style_line_color(poly, hex_to_color(color), LV_PART_MAIN);
        if (cjson_get_bool(props, "lineRounded", 0))
            lv_obj_set_style_line_rounded(poly, true, LV_PART_MAIN);
    }
    return poly;
}

/*
 * The Circle widget. Everything it draws is circular: a disc is a plain
 * object with a circular radius, a sector is an arc's background part with a
 * width thick enough to close the wedge. The software renderer has no
 * elliptical primitive, which is why the widget keeps a square box.
 */
static lv_obj_t *create_circle(lv_obj_t *parent, const cJSON *comp) {
    const cJSON *props = cJSON_GetObjectItemCaseSensitive(comp, "props");
    const char *shape = props ? cjson_get_string(props, "shape") : NULL;

    if (shape == NULL || strcmp(shape, "sector") != 0) {
        lv_obj_t *disc = lv_obj_create(parent);
        lv_obj_set_style_radius(disc, LV_RADIUS_CIRCLE, LV_PART_MAIN);
        return disc;
    }

    lv_obj_t *arc = lv_arc_create(parent);
    int w = cjson_get_int(comp, "width", 100);
    int h = cjson_get_int(comp, "height", 100);
    int radius = (w < h ? w : h) / 2;
    int start = cjson_get_int(props, "startAngle", 0);
    int end = cjson_get_int(props, "endAngle", 270);
    int thickness = cjson_get_int(props, "thickness", 0);
    int sweep = end - start;

    while (sweep < 0) sweep += 360;
    if (sweep == 0 || sweep >= 360) { start = 0; sweep = 360; }
    if (thickness <= 0 || thickness >= radius) thickness = radius;

    /* An arc is a control; this one is a decoration. */
    lv_obj_remove_style(arc, NULL, LV_PART_KNOB);
    lv_obj_set_style_arc_opa(arc, LV_OPA_TRANSP, LV_PART_INDICATOR);
    lv_arc_set_bg_angles(arc, start, sweep >= 360 ? 360 : (start + sweep) % 360);
    lv_obj_set_style_arc_width(arc, thickness, LV_PART_MAIN);
    lv_obj_set_style_arc_rounded(arc, false, LV_PART_MAIN);

    /* The fill colour reaches an arc as arc_color; apply_styles would only put
       it behind the wedge as a background. */
    {
        const cJSON *styles = cJSON_GetObjectItemCaseSensitive(comp, "styles");
        const cJSON *dflt = styles
            ? cJSON_GetObjectItemCaseSensitive(styles, "default")
            : NULL;
        const char *bg = dflt ? cjson_get_string(dflt, "bgColor") : NULL;
        if (bg && strcmp(bg, "transparent") != 0)
            lv_obj_set_style_arc_color(arc, hex_to_color(bg), LV_PART_MAIN);
    }
    return arc;
}

static lv_obj_t *create_img(lv_obj_t *parent, const cJSON *comp) {
    (void)comp;
    /* Image source handling would require asset management;
       for now just create the widget */
    return lv_image_create(parent);
}

/* ------------------------------------------------------------------ */
/*  Dispatch table                                                     */
/* ------------------------------------------------------------------ */

typedef lv_obj_t *(*creator_fn)(lv_obj_t *parent, const cJSON *comp);

typedef struct {
    const char *type;
    creator_fn  fn;
} type_entry_t;

static const type_entry_t type_table[] = {
    { "obj",       create_obj },
    { "panel",     create_obj },
    { "container", create_obj },
    /* A rectangle is a plain object wearing the shape's styles. */
    { "rectangle", create_obj },
    { "circle",   create_circle },
    { "btn",       create_btn },
    { "label",     create_label },
    { "slider",    create_slider },
    { "bar",       create_bar },
    { "arc",       create_arc },
    { "switch",    create_switch },
    { "checkbox",  create_checkbox },
    { "dropdown",  create_dropdown },
    { "textarea",  create_textarea },
    { "table",     create_table },
    { "chart",     create_chart },
    { "calendar",  create_calendar },
    { "tabview",   create_tabview },
    { "tileview",  create_tileview },
    { "win",       create_win },
    { "spinner",   create_spinner },
    { "video",     create_video },
    { "line",      create_line },
    { "polygon",   create_polygon },
    { "img",       create_img },
    { NULL, NULL }
};

static creator_fn find_creator(const char *type) {
    for (int i = 0; type_table[i].type; i++) {
        if (strcmp(type_table[i].type, type) == 0)
            return type_table[i].fn;
    }
    return NULL;
}

/* ------------------------------------------------------------------ */
/*  Main entry – two-pass: create all, then reparent children          */
/* ------------------------------------------------------------------ */

void ui_from_json(const char *json_str) {
    if (!json_str) return;

    cJSON *root = cJSON_Parse(json_str);
    if (!root) return;

    lv_obj_t *screen = lv_screen_active();
    id_map_reset();
    line_pool_reset();
    polygon_pool_reset();

    /* Apply screen settings */
    cJSON *scr_cfg = cJSON_GetObjectItemCaseSensitive(root, "screen");
    if (scr_cfg) {
        const char *bg = cjson_get_string(scr_cfg, "bgColor");
        if (bg) {
            lv_obj_set_style_bg_color(screen, hex_to_color(bg), LV_PART_MAIN);
            lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, LV_PART_MAIN);
        }
    }

    /* Pass 1: create all components on screen first */
    cJSON *components = cJSON_GetObjectItemCaseSensitive(root, "components");
    if (!cJSON_IsArray(components)) { cJSON_Delete(root); return; }

    cJSON *comp;
    cJSON_ArrayForEach(comp, components) {
        const char *type = cjson_get_string(comp, "type");
        const char *id   = cjson_get_string(comp, "id");
        if (!type) continue;

        /* Determine parent */
        const char *parent_id = cjson_get_string(comp, "parent");
        lv_obj_t *parent = screen;
        if (parent_id) {
            lv_obj_t *p = id_map_find(parent_id);
            if (p) parent = p;
        }

        /* Create widget */
        creator_fn fn = find_creator(type);
        lv_obj_t *obj;
        if (fn) {
            obj = fn(parent, comp);
        } else {
            obj = lv_obj_create(parent);
        }

        if (!obj) continue;

        /* Position & size */
        int x = cjson_get_int(comp, "x", 0);
        int y = cjson_get_int(comp, "y", 0);
        int w = cjson_get_int(comp, "width", LV_SIZE_CONTENT);
        int h = cjson_get_int(comp, "height", LV_SIZE_CONTENT);
        lv_obj_set_pos(obj, x, y);
        lv_obj_set_size(obj, w, h);

        /* Apply styles */
        cJSON *styles = cJSON_GetObjectItemCaseSensitive(comp, "styles");
        apply_styles(obj, styles);

        /* Flags */
        cJSON *flags = cJSON_GetObjectItemCaseSensitive(comp, "flags");
        if (flags) {
            if (cjson_get_bool(flags, "hidden", 0)) lv_obj_add_flag(obj, LV_OBJ_FLAG_HIDDEN);
            if (!cjson_get_bool(flags, "clickable", 1)) lv_obj_remove_flag(obj, LV_OBJ_FLAG_CLICKABLE);
            if (!cjson_get_bool(flags, "scrollable", 1)) lv_obj_remove_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
        }

        /* Register in id map */
        if (id) id_map_add(id, obj);
    }

    cJSON_Delete(root);
}
