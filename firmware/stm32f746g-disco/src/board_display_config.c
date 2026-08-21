#include "board_display.h"

/* For __weak, which is the HAL's spelling of __attribute__((weak)). */
#include "board.h"

/*
 * The display configuration's weak default, and the reason it is alone in a
 * file of its own.
 *
 * It cannot live in board_display.c, which is where it started and where it
 * looks like it belongs. GCC is entitled to read a `const` object's value
 * straight out of its own initialiser when the definition is visible in the
 * same translation unit, and it does so here even though the definition is
 * `__weak` and a generated hmi_display_generated.c may replace it at link
 * time. The result is silent and total: `hmi_display_config.orientation ==
 * HMI_DISPLAY_ORIENTATION_PORTRAIT` folds to false while compiling
 * board_display.c, the whole rotated path is dropped as dead code,
 * --gc-sections then discards the buffers it referenced, and the portrait
 * image comes out byte-for-byte identical to the landscape one. The linker map
 * still shows the strong definition winning, which is what makes it convincing
 * and wrong.
 *
 * Splitting the two apart removes the question rather than answering it: with
 * only the `extern` declaration from board_display.h in scope, there is no
 * initialiser for the compiler to fold against, and the value is settled where
 * it should be — at link time.
 *
 * `hmi_runtime_config` escapes the same trap by accident: its weak definition
 * is in hmi_runtime.c, but every read goes through a pointer main.c passes in,
 * so nothing ever reads it against a visible initialiser.
 */
__weak const hmi_display_config_t hmi_display_config = {
    .orientation = HMI_DISPLAY_ORIENTATION_LANDSCAPE,
};
