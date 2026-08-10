# Vendored dependency archives

Drop pre-downloaded upstream source archives here and `scripts/bootstrap-deps.ps1`
will use them instead of fetching from GitHub. This is a cache, not a source of
truth: the pins in `bootstrap-deps.ps1` remain the definition of what gets built,
and a build with an empty directory here behaves exactly as before.

The point is the LVGL archive, which is ~100 MB and dominates the first build of
a board. Reading it from disk takes about a second; downloading it takes minutes.

## Usage

Download the archive for the pinned commit and drop it in:

```bash
curl -L -o firmware/vendor/lvgl-9.5.0.zip https://github.com/lvgl/lvgl/archive/refs/tags/v9.5.0.zip
```

The next bootstrap prints `Using vendored ... from ...` instead of `Downloading ...`.

## How an archive is matched

**By commit, not by filename.** Every archive GitHub generates carries the source
commit in the zip's end-of-central-directory comment, and the bootstrap script
reads that field. An archive is used only when its embedded commit equals the
pinned one, so:

- The filename does not matter. `lvgl-9.5.0.zip`, `lvgl-85aa60d.zip` and
  `whatever.zip` are all fine.
- A tag URL and a commit URL are interchangeable, because they resolve to the
  same commit. The two archives are not byte-identical — the root directory name
  differs — but their contents are.
- A stale or wrong-version archive is ignored rather than silently built, and the
  script falls back to downloading the pinned commit.
- A file that is not a GitHub-generated archive is ignored; it has no commit
  comment to match.

This works for the ST dependencies too, not just LVGL, though those are small
enough that downloading them is not worth avoiding.

## Location

Defaults to this directory, shared by every board. Override with the
`HMI_VENDOR_ROOT` environment variable or the `-VendorRoot` parameter of
`bootstrap-deps.ps1` — useful for pointing several checkouts at one shared copy.

Archives here are gitignored; this README is not.
