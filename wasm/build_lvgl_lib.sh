#!/bin/bash
# Builds an LVGL static library for this directory's lv_conf.h.
#
# The Emulator no longer needs this script — it builds and caches its own
# library on demand, with SDL off, from server/emulator/lvglLib.ts. This one
# remains for the CMake build in build.sh and for building by hand.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=./toolchain.sh
source "$SCRIPT_DIR/toolchain.sh"
hmi_require_toolchain

CONF_DIR="$SCRIPT_DIR"
JOBS="$(nproc 2>/dev/null || echo 4)"

echo "=== Building LVGL static library (emcc) ==="
echo "LVGL:   $LVGL_DIR"
echo "Config: $CONF_DIR"

mkdir -p build/lvgl_objs
find "$LVGL_DIR/src" -name "*.c" | sort > build/lvgl_sources.txt
echo "Found $(wc -l < build/lvgl_sources.txt) source files, $JOBS at a time"

compile_one() {
  src="$1"
  # Named by the path below src/: a flattened absolute path carries the drive
  # colon on Windows, which is not a legal filename character.
  rel="${src#$LVGL_DIR/src/}"
  obj="build/lvgl_objs/$(printf '%s' "$rel" | tr -c 'A-Za-z0-9._-' '_').o"
  if [ -f "$obj" ] && [ "$obj" -nt "$src" ]; then
    return 0
  fi
  emcc -O2 -c "$src" -o "$obj" \
    -I"$CONF_DIR" \
    -I"$LVGL_DIR/.." \
    -DLV_CONF_INCLUDE_SIMPLE \
    -Wno-unused-function \
    -Wno-implicit-function-declaration
}
export -f compile_one
export LVGL_DIR CONF_DIR

xargs -a build/lvgl_sources.txt -I{} -P "$JOBS" "$BASH" -c 'compile_one "$@"' _ {}

echo "=== Archiving liblvgl_emcc.a ==="
rm -f build/liblvgl_emcc.a
# In batches: the object list is long enough to overrun a command line.
ls build/lvgl_objs/*.o | xargs -n 100 emar q build/liblvgl_emcc.a
emar s build/liblvgl_emcc.a

echo "=== Done: build/liblvgl_emcc.a ==="
ls -lh build/liblvgl_emcc.a
