#!/bin/bash
# Builds the LVGL Preview artifacts (rung 2) into public/wasm/.
#
# Its toolchain is resolved rather than assumed — see toolchain.sh.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=./toolchain.sh
source "$SCRIPT_DIR/toolchain.sh"
hmi_require_toolchain

mkdir -p build
cd build
emcmake cmake ..
emmake make -j"$(nproc)"

# Copy output to editor public directory
mkdir -p ../../public/wasm
cp lvgl_wasm.html lvgl_wasm.js lvgl_wasm.wasm ../../public/wasm/

echo "Build complete! Files in public/wasm/"
