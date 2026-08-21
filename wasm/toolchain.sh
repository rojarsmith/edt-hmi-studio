# Finds emcc and an LVGL checkout for the scripts in this directory.
#
# Sourced, not executed. It exists because build.sh and build_lvgl_lib.sh each
# used to carry the same two absolute paths inside one contributor's Linux home
# directory, which made them unrunnable anywhere else (docs/emulator.md §3.1).
#
# The search order matches server/emulator/toolchain.ts, so a script here and
# the dev server pick the same toolchain rather than two different ones.

HMI_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

hmi_find_lvgl() {
  local candidate
  if [ -n "$LVGL_ROOT" ] && [ -f "$LVGL_ROOT/src/lv_init.c" ]; then
    echo "$LVGL_ROOT"
    return 0
  fi
  # The pinned copy this repository installed, then any the firmware build
  # already placed — the same commit, and already on the disk.
  for candidate in \
    "$HMI_REPO_ROOT/.hmi-cache/emulator/lvgl" \
    "$HMI_REPO_ROOT"/firmware/*/.hmi-cache/Middlewares/Third_Party/lvgl
  do
    if [ -f "$candidate/src/lv_init.c" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

# Put emcc on PATH without sourcing emsdk_env.sh, which on Windows shells out to
# python3, meets the Microsoft Store's placeholder, and exports nothing.
hmi_activate_emcc() {
  local root config python

  for root in \
    "${EMSDK_ENV:+$(dirname "$EMSDK_ENV")}" \
    "$HMI_REPO_ROOT/.hmi-cache/emulator/emsdk" \
    "$EMSDK" \
    "$HOME/emsdk" \
    /opt/emsdk \
    /usr/lib/emsdk
  do
    [ -n "$root" ] || continue
    if [ -x "$root/upstream/emscripten/emcc" ] || [ -f "$root/upstream/emscripten/emcc.exe" ]; then
      export EMSDK="$root"
      export PATH="$root/upstream/emscripten:$PATH"
      config="$root/.emscripten"
      if [ -f "$config" ]; then
        export EM_CONFIG="$config"
        python="$(sed -n "s|^ *PYTHON *= *'\(.*\)'|\1|p" "$config" | head -1)"
        python="${python/\$CFGDIR/$root}"
        [ -n "$python" ] && [ -f "$python" ] && export EMSDK_PYTHON="$python"
      fi
      return 0
    fi
  done

  # Nothing installed here; an emcc the machine already provides will do.
  command -v emcc >/dev/null 2>&1
}

hmi_require_toolchain() {
  if ! hmi_activate_emcc; then
    echo "emcc not found. Run 'npm run emulator:setup' from the repository root," >&2
    echo "or set EMSDK to an existing emsdk installation." >&2
    return 1
  fi
  if ! LVGL_DIR="$(hmi_find_lvgl)"; then
    echo "No LVGL checkout found. Run 'npm run emulator:setup' from the repository" >&2
    echo "root, or set LVGL_ROOT to one." >&2
    return 1
  fi
  export LVGL_DIR
  return 0
}
