# Spinner (spinner) — Widget Design Document

<p align="center">
  <strong>English</strong> · <a href="../zh-TW/components/spinner.md">繁體中文</a>
</p>

## 1. Name and summary

Spinner shows a loading or waiting state. In LVGL it is a specialisation of Arc: a continuously rotating arc animation indicating that a background operation is in progress. Its rotation speed and arc length are configurable.

Spinner is not a container (`isContainer = false`) and cannot hold children.

## 2. Type identifier

```
type: 'spinner'
```

## 3. Category

| Field | Value |
|---|---|
| Category id | `display` |
| Category name | Display |
| Category icon | 📊 |
| Widget icon | ⏳ |

## 4. Default size

| Property | Value |
|---|---|
| defaultWidth | 50 |
| defaultHeight | 50 |

> A spinner is normally square, so that the circular animation renders correctly.

## 5. Container?

```
isContainer: false
```

Spinner is a pure display widget and cannot hold children.

## 6. Parent/child rules

### Can be a child of

- **Screen (page root)** — placed directly on the page
- **Button (btn)** — as a loading indicator inside a button
- **Container (obj)** — placed inside a generic container
- **Tab View (tabview)** — placed in a tab's content area
- **Tile View (tileview)** — placed in a tile
- **Window (win)** — placed in the window content area

### Can contain

Nothing. Spinner is not a container and cannot hold any children.

## 7. Properties (props)

| Name | Type | Default | Description |
|---|---|---|---|
| `speed` | `number` | `1000` | Time for one full rotation, in milliseconds |
| `arcLength` | `number` | `60` | Angular length of the rotating arc, in degrees |

### props type

```typescript
interface SpinnerProps {
  speed: number;
  arcLength?: number;
}
```

### About the properties

- `speed` controls how fast the spinner turns. Smaller is faster; 1000ms is one rotation per second.
- `arcLength` controls how much of the circle the visible arc covers. 60° is one sixth of the circumference; larger values give a longer arc.

How these reach LVGL depends on the version — see [LVGL API mapping](#11-lvgl-api-mapping).

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
| `borderColor` | `string` | `'#2196F3'` | Border colour (used as the arc indicator colour; the LVGL theme's primary) |
| `borderWidth` | `number` | `15` | Border width (mapped onto the arc width) |
| `borderRadius` | `number` | `0` | Corner radius (unused) |
| `textColor` | `string` | `'#212121'` | Text colour |
| `opacity` | `number` | `1` | Opacity |
| `padding` | `number` | `0` | Padding |

### Where the defaults come from

Spinner shares Arc's defaults, taken from LVGL's default theme:
- Arc background track colour: `#E0E0E0` (`color_grey`)
- Arc indicator colour: `#2196F3` (`color_primary`)
- Arc width: 15px

> Note: in the editor's style system, `borderColor` stores the arc indicator colour and `borderWidth` stores the arc width. This is a mapping convention; LVGL itself uses the `arc_color` (on `LV_PART_INDICATOR`) and `arc_width` style properties.

### Extended style properties

Spinner supports these shared extended styles:

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

> Note: a spinner rarely needs event handlers — it is purely visual feedback — and is not clickable by default.

## 10. UI layers

### 10.1 Editor canvas (CanvasComponent.tsx)

On the editor canvas the spinner is rendered with React DOM plus a CSS animation:

```tsx
<div className="lvgl-spinner" style={{
  width: '100%', height: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}}>
  <div style={{
    width: '80%', height: '80%',
    border: '4px solid #e0e0e0',
    borderTopColor: defaultStyle.borderColor || '#2196F3',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  }} />
</div>
```

Key behaviour:
- Uses the CSS border trick to simulate the arc: a grey ring with a coloured top border
- Rotates continuously via `animation: spin 1s linear infinite`
- The arc colour comes from `borderColor` (default `#2196F3`)
- The background track is fixed at `#e0e0e0`
- The inner ring is 80% of the widget size
- Transparent background (`resolvedBgColor` returns `'transparent'` for the spinner type)
- Supports selection highlight, hover, dragging and resize handles

> Requires `@keyframes spin { to { transform: rotate(360deg); } }` in the CSS.

### 10.2 Prototype (PreviewPanel.tsx)

In the Canvas 2D simple preview the spinner is drawn by `drawSpinner()`:

```typescript
drawSpinner(ctx, x, y, w, h, {
  borderColor: styles.borderColor || '#2196F3',
});
```

The implementation:

```typescript
function drawSpinner(ctx, x, y, w, h, opts) {
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const radius = Math.min(w, h) / 2 - 4;

  // Background ring
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Rotating arc (static snapshot)
  ctx.strokeStyle = opts.borderColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI / 3);
  ctx.stroke();
}
```

Key behaviour:
- Draws the full grey background ring
- Draws a coloured arc on top of it (from -90° to 60°, roughly 150° long)
- Round arc caps (`lineCap = 'round'`)
- The spinner is static here — a single snapshot, not animated
- Line width is fixed at 4px (a rendering simplification)
- Supports animation state on top

### 10.3 Simulator

#### JSON serialisation (editorStateToJson.ts)

The spinner is serialised as a flattened JSON node:

```json
{
  "type": "spinner",
  "id": "comp-xxx",
  "parent": null,
  "x": 100, "y": 100,
  "width": 50, "height": 50,
  "props": { "speed": 1000 },
  "styles": {
    "default": {
      "bgColor": "transparent",
      "borderColor": "#2196F3",
      "borderWidth": 15,
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
static lv_obj_t *create_spinner(lv_obj_t *parent, const cJSON *comp) {
    (void)comp;
    return lv_spinner_create(parent);
}
```

Key behaviour:
- Creates the spinner with `lv_spinner_create(parent)` (the v9 signature)
- The WASM preview does not yet pass `speed` or `arcLength`, so LVGL's defaults apply
- LVGL starts the rotation animation itself
- Applies position, size and styles

> Note: the spinner really rotates in the WASM preview, driven by LVGL's own animation. That is the main difference from the editor canvas and the simple preview.

### 10.4 Generated code (ui.c.ts)

For LVGL v9:

```c
// Create spinner: my_spinner
my_spinner = lv_spinner_create(parent);
lv_obj_set_pos(my_spinner, 100, 100);
lv_obj_set_size(my_spinner, 50, 50);
lv_obj_set_style_bg_opa(my_spinner, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_color(my_spinner, lv_color_hex(0x2196F3), 0);
lv_obj_set_style_border_width(my_spinner, 15, 0);
lv_spinner_set_anim_params(my_spinner, 1000, 60);
```

For LVGL v8:

```c
my_spinner = lv_spinner_create(parent, 1000, 60);
```

Key behaviour:
- v9 takes only the parent at creation, then sets the animation with `lv_spinner_set_anim_params(obj, speed, arcLength)`
- v8 keeps the three-argument creation form, so `speed` and `arcLength` are creation parameters
- On v8, a non-default `speed` or `arcLength` produces a comment noting that the value was set in the create call

The special case in `getCreateFunction`:

```typescript
if (type === 'spinner') {
  if (isV9) {
    return `lv_spinner_create(${parentVar})`;
  }
  const speed = props?.speed || 1000;
  const arcLength = props?.arcLength || 60;
  return `lv_spinner_create(${parentVar}, ${speed}, ${arcLength})`;
}
```

And in `generatePropsCode`:

```typescript
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
```

## 11. LVGL API mapping

### Creation

| Version | API | Notes |
|---|---|---|
| LVGL v9 | `lv_spinner_create(parent)` | The only valid form in v9 |
| LVGL v8 | `lv_spinner_create(parent, speed, arcLength)` | Speed and arc length are creation parameters |

### Key APIs

| API | Description |
|---|---|
| `lv_spinner_create(parent)` | Create the spinner (v9) |
| `lv_spinner_create(parent, speed, arc_length)` | Create with speed and arc length (v8) |
| `lv_spinner_set_anim_params(spinner, speed, arc_length)` | Set speed and arc length (v9) |
| `lv_obj_set_pos(spinner, x, y)` | Set the position |
| `lv_obj_set_size(spinner, w, h)` | Set the size |
| `lv_obj_set_style_arc_color(spinner, color, LV_PART_INDICATOR)` | Set the arc indicator colour |
| `lv_obj_set_style_arc_width(spinner, width, LV_PART_INDICATOR)` | Set the arc indicator width |
| `lv_obj_set_style_arc_color(spinner, color, LV_PART_MAIN)` | Set the background track colour |
| `lv_obj_set_style_arc_width(spinner, width, LV_PART_MAIN)` | Set the background track width |
| `lv_obj_add_flag(spinner, LV_OBJ_FLAG_HIDDEN)` | Hide the spinner |

### Spinner and Arc

Spinner is a specialisation of Arc:
- It creates an Arc object internally
- It adds a rotation animation (`lv_anim`) automatically
- It does not support user interaction (the arc cannot be dragged)
- It does not support value or range (unlike Arc)

## 12. Design notes

1. **Where speed and arc length are set**: on v9 they are applied after creation with `lv_spinner_set_anim_params`, so they can be changed at runtime. On v8 they are creation parameters and cannot be changed afterwards — the spinner has to be destroyed and recreated.

2. **Three rendering layers behave differently**:
   - Editor canvas: rotates continuously via a CSS animation (closest to the real thing)
   - Prototype: a static arc snapshot, not animated
   - WASM preview: rotates under LVGL's own animation (real LVGL behaviour)

3. **Style mapping convention**: `borderColor` maps onto the arc indicator colour and `borderWidth` onto the arc width. In LVGL these are the `arc_color` and `arc_width` style properties applied to `LV_PART_INDICATOR`.

4. **Background track**: the grey track colour (`#E0E0E0`) is hard-coded in the editor and not exposed through the style system. In LVGL it can be changed through `arc_color` on `LV_PART_MAIN`.

5. **Keep it square**: a spinner should have equal width and height to stay circular. The editor does not enforce this, but prompting the user to keep it square would be a sensible improvement.

6. **WASM preview simplification**: `create_spinner` does not pass `speed` or `arcLength`, so LVGL's defaults are used. Changing either property in the editor is therefore not reflected in the WASM preview.

7. **Performance**: the rotation is driven by LVGL's `lv_anim` system and triggers continuous redraws. Several spinners running at once may affect performance on a resource-constrained device.

8. **Show and hide**: a spinner is usually shown when an asynchronous operation starts and hidden when it ends. Use the `LV_OBJ_FLAG_HIDDEN` flag, or the `show`/`hide` built-in actions in the event system.
