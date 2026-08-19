# Animations — Definition, Target, Trigger

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/animation-model.md">繁體中文</a>
</p>

An animation used to be a property of the widget it moved: stored inside that
component, started because its screen appeared, and named only by its position
in a list. Nothing could name one, so nothing but "the screen loaded" could
ever start one, and designing an entry animation meant accepting whatever the
generator decided to do.

Three things are now separate, and that separation is the whole design:

| | What it answers | Where it lives |
| --- | --- | --- |
| **Definition** | What moves, how far, how long | The project's animation list |
| **Target** | Which widget it drives | `Animation.targetComponentId` |
| **Trigger** | When it runs | An event binding — on a screen, or on a widget |

A designer can therefore build a screen's entry animation without writing
code: place the widgets, define the animation, and bind it to the screen's
**Screen Loaded** event.

## The animation list

Animations are project assets, listed in the Animations manager whatever is
selected on the canvas — including nothing. Each one names the widget it
drives rather than living inside it, so retargeting an animation does not
move it, and deleting a widget does not delete the animations aimed at it.

Names are unique across the project because the name becomes the generated C
function's name (see below). The edit dialog hands out `Fade_In_1`,
`Slide_Left_1` and so on under the same gap-filling rule component ids use,
and refuses a name another animation already answers to.

### Missing dependencies are shown, never repaired

An animation whose target was deleted, or which never got one, keeps its place
in the list with a purple **LACK** badge naming what is missing. So does an
event bound to an animation that has since been deleted. Silently dropping the
reference would hide work the user still has to redo; nothing is generated for
either, and the build says so in a comment rather than calling a symbol that
does not exist.

## Triggers are event bindings

Screens carry events of their own, shown in the property editor's **Events**
category exactly as a component's are. A screen's catalogue is its lifecycle
rather than input:

| Event | When LVGL fires it |
| --- | --- |
| `LV_EVENT_SCREEN_LOADED` | The transition to this screen has finished — where an entry animation belongs |
| `LV_EVENT_SCREEN_LOAD_START` | Before the first frame of this screen is drawn |
| `LV_EVENT_SCREEN_UNLOAD_START` | As this screen begins to leave |
| `LV_EVENT_SCREEN_UNLOADED` | The screen has finished leaving |

Two built-in actions drive an animation, available to screens and widgets
alike: **Play Animation** starts one from its start value however far a
previous run had reached, and **Stop Animation** leaves the widget wherever it
had got to. The binding names its animation by id, so renaming one cannot
quietly unbind every button that plays it.

An animation nothing binds simply never runs. That is what lets one be
reserved for a button while the screen's entry animations play on load.

### Parking

The start values still have to be applied automatically. A widget keeps
whatever the last run left it at, so on a second visit to a screen it would
sit at its end position for the whole transition and then jump back. The
generator therefore parks the widgets a screen's entry animations drive, on
`LV_EVENT_SCREEN_LOAD_START` — before the transition draws.

Only those. An animation kept for a button is left where the user put it: the
screen has no business moving a widget it does not animate.

## Offset and absolute

A position animation's numbers count from where the component sits. "Slide in
from the left" hands out `x: -100 → 0`, which means *a hundred pixels to the
left of its place, then home* — not the coordinate `-100`, then the coordinate
`0`.

This was a real defect rather than a preference. The generator used to write
those numbers straight into `lv_obj_set_x`, so a widget designed anywhere but
`x: 0` slid to the wrong place on the board — while the preview, which drew
the same numbers as a shift from the component's position, showed it landing
correctly. The canvas and the firmware disagreed, and the firmware was wrong.
Both now resolve through `resolvedAnimationValues()` in
`src/utils/animationValues.ts`.

**Absolute** stays available for an animation that really does mean a
coordinate. The dialog offers the choice for `x` and `y` only: those are the
properties with a place to be offset from. A width of 100 is a hundred pixels
wherever it is measured from, and an opacity has no position at all.

The base is the **designed** position, not the live one. Counting from
wherever the widget happens to be at runtime would drift: parking it at its
start value before each screen load, then reading that parked position as the
next base, walks it further away on every visit.

## What gets generated

Each animation becomes a pair of functions named after the animation alone —
never its target, so pointing it at a different widget does not rename the
function a button calls:

```c
void ui_anim_slide_in_1_start(void) {
    lv_anim_t anim;
    lv_anim_init(&anim);
    lv_anim_set_var(&anim, ui_title);
    lv_anim_set_exec_cb(&anim, (lv_anim_exec_xcb_t)lv_obj_set_x);
    lv_anim_set_values(&anim, -70, 40);   /* designed at x: 40, offset -110 */
    lv_anim_set_time(&anim, 400);
    lv_anim_set_path_cb(&anim, lv_anim_path_ease_out);
    lv_anim_start(&anim);
}

void ui_anim_slide_in_1_stop(void) {
    lv_anim_delete(ui_title, (lv_anim_exec_xcb_t)lv_obj_set_x);
}
```

Both are declared in `ui.h`, so anything may call one. `lv_anim_start` already
drops a running animation with the same target and exec callback, so playing
one twice restarts it rather than stacking two — no delete of its own is
needed.

The trigger comes out of the event table like any other binding:

```c
void ui_event_screen_main_screen_loaded(lv_event_t *e) {
    lv_event_code_t code = lv_event_get_code(e);
    (void)code;

    if (code == LV_EVENT_SCREEN_LOADED) {
        ui_anim_slide_in_1_start();
    }
}
```

and the screen's init function registers it beside the parking callback:

```c
lv_obj_add_event_cb(ui_screen_main, ui_screen_main_reset_anims, LV_EVENT_SCREEN_LOAD_START, NULL);
lv_obj_add_event_cb(ui_screen_main, ui_event_screen_main_screen_loaded, LV_EVENT_SCREEN_LOADED, NULL);
```

### One handler per object per event type

A handler serves one object's one event type and runs every binding for it in
list order; the callback is registered once per type, not once per binding.
Emitting a function per binding gave two bindings of the same type the same
symbol, which does not compile — and a screen playing three entry animations
has exactly that shape by construction.

## Opening an older project

Two migrations run on open, on import, and on reading a project file, beside
the typography and text-resource migrations that already worked this way:

1. **Hoisting.** Animations stored inside a component are lifted into the
   project list, each taking the component it was found in as its target.
2. **Bindings.** Every animation on a screen gains a Screen Loaded binding on
   that screen, reproducing exactly what the generator used to do on its own.

An empty `events` array marks a screen as migrated. Removing every binding is
therefore a decision that survives the next open, rather than something the
migration undoes.

Position animations in such a project change behaviour on the board: they now
land where the preview always showed them landing. An animation that really
did want a coordinate can be switched to Absolute.

## The preview

The Quick Preview honours all of it. Entering a screen — booting into the
entry screen, pressing a navigation button, or clicking the screen in the
footer — plays that screen's Screen Loaded bindings, as the firmware does.
Clicking a widget runs its Play Animation and Stop Animation bindings. The
toolbar's play button replays the current screen's entry; a screen that binds
nothing falls back to every animation aimed at it, so one kept for a button is
still previewable.

## Where it is implemented

| Concern | File |
| --- | --- |
| Animation and binding types | `src/types/index.ts` |
| Naming rule | `src/utils/animationNames.ts` |
| Migrations, target resolution, LACK | `src/utils/animationAssets.ts` |
| Offset and absolute | `src/utils/animationValues.ts` |
| C symbols and resolved values | `src/codegen/animationSymbols.ts` |
| Animation functions and parking | `src/codegen/templates/ui.c.ts` |
| Event handlers and the two actions | `src/codegen/templates/ui_events.c.ts` |
| The animation manager | `src/components/AnimationPanel/` |
| The events category | `src/components/EventPanel/` |

## Not done yet

- **A timeline.** Animations are independent; there is no way to say "this
  one, then that one". The building block is there — an animation-finished
  event could become another trigger — but nothing exposes it.
- **Style transitions.** LVGL's `lv_style_transition_dsc` would cover the
  "pressed state feels responsive" case at almost no cost, and it is a
  different mechanism from this one rather than a competitor to it: state
  transitions give texture, triggers give choreography.
- **Offset for size.** `width` and `height` could reasonably be offset from
  the designed size; the case has not come up.
