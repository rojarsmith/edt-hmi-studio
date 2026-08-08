# Image (img) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/img.md">繁體中文</a>
</p>

## 1. Name and summary

Image displays an image resource. In LVGL an image object (`lv_image` / `lv_img`) shows either a pre-compiled C array image or a file from an external file system, and supports transforms such as rotation and scaling.

Image is not a container (`isContainer = false`) and cannot hold children.

## 2. Type identifier

```
type: 'img'
```

## 3. Category

| Field | Value |
|---|---|
| Category id | `basic` |
| Category name | Basic |
| Category icon | 📦 |
| Widget icon | 🖼️ |

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 100 |
| defaultHeight | 100 |

## 5. Container?

```
isContainer: false
```

Image is a pure display widget and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Button (btn)** — as an icon inside a button
- **Container (obj)** — placed inside a generic container
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area

### Can contain

Nothing. Image is not a container and cannot hold any children.

## 7. Properties (props)

| Name | Type | Default | Description |
|---|---|---|---|
| `src` | `string` | `''` | The image source: a resource id, a resource name, a C array name, or a data URL |
| `rotation` | `number` | `0` | Rotation in degrees (multiplied by 10 during generation, for LVGL's 0.1° unit) |
| `scaleMode` | `string` | `undefined` | Scaling mode: `'cover'` / `'contain'` (needs a custom implementation) |

### props type

```typescript
interface ImgProps {
  src: string;
  rotation?: number;
  scaleMode?: 'cover' | 'contain';
}
```

## 8. Styles

### Supported style states

| State | Selector | Description |
|---|---|---|
| `default` | `LV_STATE_DEFAULT` | Default/normal state |
| `pressed` | `LV_STATE_PRESSED` | Pressed |
| `focused` | `LV_STATE_FOCUSED` | Focused |
| `disabled` | `LV_STATE_DISABLED` | Disabled |

### Default state styles

| Style property | Type | Default | Description |
|---|---|---|---|
| `bgColor` | `string` | `'transparent'` | Background colour (transparent) |
| `borderColor` | `string` | `'transparent'` | Border colour (no border) |
| `borderWidth` | `number` | `0` | Border width |
| `borderRadius` | `number` | `0` | Corner radius |
| `textColor` | `string` | `'#212121'` | Text colour (used by the placeholder text) |
| `opacity` | `number` | `1` | Opacity |
| `padding` | `number` | `0` | Padding |

### Where the defaults come from

The image widget has no special styling in LVGL's default theme and uses the base object defaults:
- Transparent background
- No border, no corner radius, no padding

### Extended style properties

Image supports the shared extended styles inherited from `StyleProps`:

- Shadow: `shadowColor`, `shadowWidth`, `shadowOffsetX`, `shadowOffsetY`, `shadowSpread`, `shadowOpacity`
- Outline: `outlineColor`, `outlineWidth`, `outlinePad`
- Transform: `transformAngle`, `transformZoomX`, `transformZoomY`, `transformPivotX`, `transformPivotY`
- Blend mode: `blendMode`

## 9. Supported events

| Event | Description |
|---|---|
| `LV_EVENT_CLICKED` | Click |
| `LV_EVENT_PRESSED` | Press |
| `LV_EVENT_RELEASED` | Release |
| `LV_EVENT_LONG_PRESSED` | Long press |
| `LV_EVENT_FOCUSED` | Focus gained |
| `LV_EVENT_DEFOCUSED` | Focus lost |

> Note: an image is not clickable by default. To respond to events, set `clickable = true` in the flags.

## 10. UI layers

### 10.1 Editor canvas (CanvasComponent.tsx)

On the editor canvas the image is rendered by the `CanvasImageContent` child component:

```tsx
// With an image resource
<div className="lvgl-img" style={{
  width: '100%', height: '100%',
  backgroundImage: `url(${matched.data})`,
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
}} />

// Without an image resource (placeholder)
<div className="lvgl-img placeholder" style={{
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '100%', height: '100%', fontSize: '24px',
  backgroundColor: '#f0f0f0',
}}>
  🖼️
</div>
```

Key behaviour:
- Looks the resource up through `useResourceStore` (matching by id, name or C array name)
- When found, shows the image with `backgroundImage` at `100% 100%`, matching the stretch that generated code applies
- When not found, shows a 🖼️ placeholder
- An image widget itself is **never** given an opaque background fallback: one would sit behind the source's alpha channel and make a transparent PNG look opaque, which is not what LVGL draws. Only the placeholder fills itself, so a widget with no image resolved stays visible and clickable
- Supports selection highlight, hover, dragging and resize handles

### 10.2 Simple preview (PreviewPanel.tsx)

In the Canvas 2D simple preview the image is drawn by `drawImage()`:

```typescript
drawImage(ctx, x, y, w, h, {
  src: comp.props.src,
  loadImage,
});
```

Key behaviour:
- Loads the image through the `loadImage()` callback (resource id, name, data URL or HTTP URL)
- Uses an in-memory cache (`imageCache`) to avoid reloading
- Draws with `ctx.drawImage()` once loaded
- Draws a grey placeholder rectangle plus a 🖼️ icon when there is no source, or it has not loaded
- Triggers a redraw once loading completes

### 10.3 LVGL WASM preview

#### JSON serialisation (editorStateToJson.ts)

The image is serialised as a flattened JSON node:

```json
{
  "type": "img",
  "id": "comp-xxx",
  "parent": null,
  "x": 20, "y": 20,
  "width": 100, "height": 100,
  "props": { "src": "" },
  "styles": {
    "default": {
      "bgColor": "transparent",
      "borderColor": "transparent",
      "borderWidth": 0,
      "borderRadius": 0,
      "textColor": "#212121",
      "opacity": 1,
      "padding": 0
    }
  }
}
```

#### Creation on the C side (ui_from_json.c)

```c
static lv_obj_t *create_img(lv_obj_t *parent, const cJSON *comp) {
    (void)comp;
    /* Image source handling would require asset management;
       for now just create the widget */
    return lv_image_create(parent);
}
```

Key behaviour:
- Creates the image object with `lv_image_create()` (the v9 API)
- The WASM preview does not currently resolve image sources (that needs asset management)
- Only an empty image widget is created, with its position, size and styles applied

### 10.4 Generated code (ui.c.ts)

```c
// Create img: my_image
my_image = lv_image_create(parent);  // v9
// my_image = lv_img_create(parent); // v8
lv_obj_set_pos(my_image, 20, 20);
lv_obj_set_size(my_image, 100, 100);
lv_obj_set_style_bg_opa(my_image, LV_OPA_TRANSP, 0);

// Set the image source (the C array name when a resource matches)
lv_image_set_src(my_image, &my_icon);  // v9
// lv_img_set_src(my_image, &my_icon); // v8

// Stretch the source to the widget bounds (v9)
lv_image_set_inner_align(my_image, LV_IMAGE_ALIGN_STRETCH);

// Rotation (when rotation is set)
lv_image_set_rotation(my_image, 450);  // v9, 45° × 10
// lv_img_set_angle(my_image, 450);    // v8
```

Key behaviour:
- v9 uses `lv_image_create` / `lv_image_set_src` / `lv_image_set_rotation`
- v8 uses `lv_img_create` / `lv_img_set_src` / `lv_img_set_angle`
- Source resolution: look the id or name up in `imageResources` first and use its `cArrayName`; otherwise use `props.src` directly as the C variable name
- For v9, `lv_image_set_inner_align(..., LV_IMAGE_ALIGN_STRETCH)` is emitted so the source fills the widget bounds, matching what the canvas shows
- The rotation is multiplied by 10 (LVGL uses 0.1° units)
- `scaleMode` needs a custom implementation; generation emits a comment as a hint

## 11. LVGL API mapping

### Creation

| Version | API |
|---|---|
| LVGL v9 | `lv_image_create(parent)` |
| LVGL v8 | `lv_img_create(parent)` |

### Key APIs

| API (v9) | API (v8) | Description |
|---|---|---|
| `lv_image_create(parent)` | `lv_img_create(parent)` | Create the image object |
| `lv_image_set_src(img, src)` | `lv_img_set_src(img, src)` | Set the image source |
| `lv_image_set_rotation(img, angle)` | `lv_img_set_angle(img, angle)` | Set the rotation (0.1° units) |
| `lv_image_set_scale(img, zoom)` | `lv_img_set_zoom(img, zoom)` | Set the scale (256 = 100%) |
| `lv_image_set_inner_align(img, align)` | — | Set how the source is fitted to the widget |
| `lv_obj_set_pos(img, x, y)` | same | Set the position |
| `lv_obj_set_size(img, w, h)` | same | Set the size |
| `lv_obj_set_style_bg_opa(img, opa, sel)` | same | Set the background opacity |

### Image declaration macro

| Version | Macro | Description |
|---|---|---|
| LVGL v9 | `LV_IMAGE_DECLARE(var_name)` | Declare an external image C array |
| LVGL v8 | `LV_IMG_DECLARE(var_name)` | Declare an external image C array |

## 12. Design notes

1. **Resource management**: images are managed by `resourceStore`. Each resource carries an `id`, a `name`, a `cArrayName` (the C array variable) and `data` (base64 / data URL). `props.src` stores the resource id or name, and generation converts it into the C array reference.

2. **v8/v9 API differences**: Image has the largest API gap between v8 and v9 of any widget. The generator picks the API set from `options.lvglVersion`. The key differences:
   - Create: `lv_img_create` → `lv_image_create`
   - Set source: `lv_img_set_src` → `lv_image_set_src`
   - Rotate: `lv_img_set_angle` → `lv_image_set_rotation`
   - Scale: `lv_img_set_zoom` → `lv_image_set_scale`
   - Declaration macro: `LV_IMG_DECLARE` → `LV_IMAGE_DECLARE`

3. **WASM preview limitation**: image sources are not yet resolved in the WASM preview (`create_img` carries a TODO). An image appears there as an empty image widget.

4. **Transparency on the canvas**: image and image-button widgets deliberately keep a transparent background on the design canvas. An opaque fallback would sit behind the source's alpha channel and make a transparent PNG look opaque. Visibility is preserved instead by filling the placeholder that `CanvasImageContent` draws while no image resolves. The shared fallback table lives in `src/components/Canvas/widgetBackground.ts`.

5. **Image cache**: the simple preview caches loaded `HTMLImageElement` objects in an `imageCache` Map, so a redraw does not reload them.

6. **Rotation units**: LVGL rotates in 0.1° steps. The editor's `rotation` property is in degrees and is multiplied by 10 during generation.

7. **Scaling mode**: `scaleMode` (`cover`/`contain`) has no direct LVGL equivalent and needs a custom implementation; generation emits a comment telling the user to handle it. Note that the generator already emits `lv_image_set_inner_align(..., STRETCH)` for v9, which fills the widget bounds.

8. **Image declarations**: the images actually used are declared at the top of the generated file with `LV_IMAGE_DECLARE` (v9) or `LV_IMG_DECLARE` (v8). Only the resources in use are declared, filtered by `collectUsedImages`.

9. **Flash footprint**: an image widget stretches its source to the widget bounds, so pixels beyond the largest fixed-size use only cost target Flash. The HMI project source builder downscales plain image sources to their on-screen size for that reason.
