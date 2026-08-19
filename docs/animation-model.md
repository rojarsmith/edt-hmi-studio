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

An animation carries a target, one clock — duration, delay, repeat, easing —
and a list of **tracks**, each naming a property and how far it travels.
Sliding a card in while fading it up is one animation with two tracks, not two
animations kept in step by hand.

There is no Animation Type. It said the same thing as the property beside it
and was free to contradict it: "Slide In from Left" stored against an opacity
animation, with only the property reaching the firmware. Presets remain in the
dialog as buttons that add tracks and are then forgotten, which is all a preset
ever was.

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
event bound to an animation that has since been deleted, and a screen playing
an animation aimed at a widget it does not show — the commonest way an entry
animation quietly does nothing, since it moves something invisible. Silently
dropping the reference would hide work the user still has to redo; nothing is generated for
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
alike: **Play Animation** runs one from the beginning however far a previous
run had reached — from its stated start, or from wherever the widget is if it
travels a distance — and **Stop Animation** leaves the widget where it had got
to. The binding names its animation by id, so renaming one cannot
quietly unbind every button that plays it.

An animation nothing binds simply never runs. That is what lets one be
reserved for a button while the screen's entry animations play on load.

### Parking

The starting place still has to be restored automatically. A widget keeps
whatever the last run left it at, so on a second visit to a screen it would
sit at its end position for the whole transition and then jump back. The
generator therefore parks the widgets a screen's entry animations drive, on
`LV_EVENT_SCREEN_LOAD_START` — before the transition draws.

Where it parks depends on how the animation states itself: an absolute one
goes back to its own start value, an offset one to the component's designed
position (see below).

Only those animations. One kept for a button is left where the user put it:
the screen has no business moving a widget it does not animate.

## Offset and absolute

A movement can be stated two ways, and they are different shapes rather than
different units:

- **Absolute** — two coordinates. Start at this x, end at that one.
- **Offset** — one **distance**, travelled from wherever the widget is when
  the animation runs. Negative moves left or up.

Offset reads the *live* position, not the designed one. A button that has
already nudged a widget rightwards nudges it further from there, which is what
"move by 40 pixels" has to mean if it is to be usable twice.

That leaves an entry animation needing somewhere to set off from, and the
answer is where the author parked the component. To slide a button in from the
left, place it *outside the screen* on the canvas — the editor shows it there,
beyond the white panel, rather than clipping it away — and give the distance
that brings it home. Its designed position **is** the animation's starting
place.

So a screen restores the designed position before replaying its entry
animations (see Parking above). Without that, travelling from the live
position would walk the widget further on every visit. An absolute animation
states its own start and parks there instead.

The dialog offers the choice for `x` and `y` only: those are the properties
with somewhere to travel from. A width of 100 is a hundred pixels wherever it
is measured from, and an opacity has no position at all. An animation carrying
no mode reads as absolute, which is what the generator always did with one.

The slide presets hand out a distance rather than a pair of coordinates, since
a slide is a journey. Fades and zooms stay absolute: they are values, not
places.

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
    int32_t from = lv_obj_get_x(ui_title);   /* wherever it is right now */
    lv_anim_set_values(&anim, from, from + (100));
    lv_anim_set_time(&anim, 400);
    lv_anim_set_path_cb(&anim, lv_anim_path_ease_out);
    lv_anim_start(&anim);
}

void ui_anim_slide_in_1_stop(void) {
    lv_anim_delete(ui_title, (lv_anim_exec_xcb_t)lv_obj_set_x);
}
```

The start function sets up one `lv_anim_t` per track and starts them
together — `lv_anim_start` copies the descriptor, so one local serves them
all — and stop deletes every one.

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

An animation from such a project carries no mode, so it stays absolute — what
the generator always did with it. A slide-in written before offsets existed is
therefore worth redoing: park the component where it should set off and give
the distance, rather than leaving it to state two coordinates that only work
for a component designed at zero.

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
| Distance, absolute, and parking | `src/utils/animationValues.ts` |
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
- **Offset for size.** `width` and `height` could reasonably travel a
  distance from their current value; the case has not come up.
