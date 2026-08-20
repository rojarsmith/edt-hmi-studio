# Screen transitions

<p align="center">
  <strong>English</strong> · <a href="./zh-TW/screen-transitions.md">繁體中文</a>
</p>

A navigation says how it is drawn. Choosing **Navigate to Screen** in the Edit
Event dialog asks for three things under the screen it goes to: which effect,
which way it travels, and over how long.

The choice belongs to the navigation rather than to the destination. Next
wants to slide left and Back wants to slide right, and the screen being
entered cannot know which of the two brought the user there — so two buttons
reaching the same screen can look completely different doing it.

## The five effects

The word list is TouchGFX Designer's, because that is the vocabulary most
people arrive with. Four of the five are a family LVGL draws natively:

| Effect | LVGL | What moves |
| --- | --- | --- |
| **None** | instant load | nothing — the new screen is simply there on the next frame |
| **Slide** | `LV_SCR_LOAD_ANIM_MOVE_*` | both screens, the old one pushed out by the new |
| **Cover** | `LV_SCR_LOAD_ANIM_OVER_*` | only the screen arriving, over the old one |
| **Wipe** | `LV_SCR_LOAD_ANIM_OUT_*` | only the screen leaving, uncovering the new one beneath |
| **Fade** | `LV_SCR_LOAD_ANIM_FADE_IN` | neither — the new screen fades in over the old |

TouchGFX's fifth effect, Block, repaints the screen in chunks and has no LVGL
counterpart; LVGL's fade has no TouchGFX counterpart. Fade takes that slot
rather than offering a name the engine could not honour.

**None** is worth knowing for what it makes possible. A widget drawn
identically at the same position on both screens does not move at all, so the
change is invisible: a toolbar can stay put while everything under it is
replaced, and the user sees one screen rather than two.

### Direction

Left, Right, Up and Down name the direction the picture **travels**, as LVGL
names it, not the edge the incoming screen appears from. A Slide Left moves
everything leftwards, which means the new screen arrives from the right.

Direction only appears for the three effects that travel. LVGL says `TOP` and
`BOTTOM` where the editor says Up and Down.

## What is generated

The load call is written out in the event handler rather than delegated to the
screen's load function, because the transition belongs to that one navigation:

```c
static void ui_event_btn_next_clicked(lv_event_t * e) {
    /* Navigate to: Settings */
    lv_scr_load_anim(ui_screen_settings, LV_SCR_LOAD_ANIM_MOVE_LEFT, 300, 0, false);
}
```

None becomes `lv_scr_load(ui_screen_settings);` — LVGL's own shortcut for a
zero-length transition, which loads the screen between two frames.

`ui_<screen>_load()` still exists and still performs the project's default
fade. It is what `ui_init` calls to reach the entry screen, and what
hand-written code should call when it does not care how the change looks.

## Where else it appears

The logic graph's **Navigate to Screen** node offers the same five effects,
the same directions and the same duration, and compiles through the same
emitter — the same choice in either place produces the same line.

The preview honours it too: both screens are drawn on the panel at once,
moved and faded the way `lv_screen_load_anim` moves and fades them, so a
transition can be judged without flashing a board.

## Timing, and how it meets entry animations

LVGL brackets a transition with four events, two on each screen:

```
t=0        arriving: LV_EVENT_SCREEN_LOAD_START    leaving: LV_EVENT_SCREEN_UNLOAD_START
           ├──────────────── the transition ────────────────┤
t=duration arriving: LV_EVENT_SCREEN_LOADED        leaving: LV_EVENT_SCREEN_UNLOADED
```

A screen's entry animation is bound to **Screen Loaded**, so the transition
duration delays it: a 300 ms Cover followed by a 3 s entry animation takes
3.3 s from the button press. With None the four events fire back to back in
one call and the entry animation starts immediately.

The two compose correctly. The widgets an entry animation drives are parked at
their designed positions on **Screen Load Start**, before the first frame of
the transition is drawn, so the screen never appears mid-animation. And
`lv_screen_load_anim` only cancels animations whose variable is the screen
object itself — a widget's animation is untouched.

One consequence is worth designing around: Cover, Wipe and Slide make the new
screen partly visible while it travels, and its entry animation does not start
until it has arrived. The widgets sit still through the transition and then
move. At 300 ms this is hard to see; at 500 ms it is obvious.

Going the other way — playing an **exit** animation before the change — is a
binding on the animation rather than on the button: navigation happens at once
and would cut its own exit animation off part way. Bind the navigation to the
animation's **Animation Finished** event instead; see
[animation-model.md](./animation-model.md).

## What is deliberately absent

- **Per-screen defaults.** A screen cannot declare "I am always entered by
  fading". If a project wants that everywhere, every navigation says so.
- **Easing.** LVGL runs screen transitions on its linear path and offers no
  way to change it.
- **Block.** See above — the engine cannot draw it.
- **A transition on the boot screen.** `ui_init` loads the entry screen through
  its load function, which fades. Nothing is on the display before it, so
  there is nothing to transition from.
