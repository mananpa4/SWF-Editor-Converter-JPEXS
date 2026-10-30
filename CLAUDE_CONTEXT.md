# CLAUDE_CONTEXT.md

Living memory of this project. Update this file whenever meaningful work
happens here — this is where state, decisions, and next steps belong (not
CLAUDE.md, which is permanent-info-only).

**Last updated:** 2026-07-26, during the initial build-out of the
ffmpeg/WebM-alpha + wink-package features and this documentation.

## Current state (2026-07-26)

First real development pass on this repo. Before this session the repo
contained only `FlashPlayer.exe` and an untracked `repos/jpexs-decompiler-master`
(vendored FFDec source, never committed). Nothing in this repo has been
`git add`ed/committed yet except the very first commit
(`FlashPlayer.exe` + `.gitattributes`) — **`repos/`, `tools/`, and `webapp/`
are all currently untracked.** Committing is left to the user (large binaries
via LFS — see "Known issues / gotchas" below before doing so).

**FFDec desktop build: now actually verified, not just written.** Ant was not
installed anywhere on this machine; a `winget`/system-wide `choco install ant`
both failed (no matching winget package; choco needs elevated rights this
shell doesn't have). Fixed by downloading the official portable Apache Ant
1.10.15 binary distribution from `archive.apache.org` into the OS temp
scratch dir (no install/admin needed — it's just jars + a launcher script)
and running it directly with `ANT_HOME`/`JAVA_HOME` set inline. `ant compile`
and `ant build` both ran **BUILD SUCCESSFUL** against every change described
below, producing `repos/jpexs-decompiler-master/dist/ffdec.exe` +
`dist/ffdec.jar` + `dist/lib/` (60 dependency jars) — a real, runnable
desktop build (version `0.0.0`, since no formal release tag exists yet).
Launched `ffdec.exe` for real and confirmed via screenshot: full GUI render,
tag tree, and — thanks to this user's pre-existing FFDec config on this
machine — it auto-restored a previous session and correctly played back
`kiss~.swf` (one of the real wink SWFs from `chismy-messenger`) in the
preview pane. This retroactively confirms every "not verified by
compilation" caveat below for the FFDec-side changes; those sections are
left as-written for the historical record of what was/wasn't known at each
point, but treat "Not verified: whether the full FFDec Swing app actually
builds/runs" as **resolved** — it does.

The portable Ant used for this only lives in this session's OS temp
directory, not in the repo or anywhere permanent — a fresh session (or this
same machine later) will hit "ant: command not found" again unless Ant is
installed properly (e.g. `choco install ant` from an elevated/admin shell,
since the non-elevated attempt failed on a lock-file permission error) or
the same portable-download trick is repeated.

## Implemented

### 1. ffmpeg all-in-one wrapper (desktop)
- `tools/ffmpeg/win64/` — `ffmpeg.exe`, `ffprobe.exe` + the 7 DLLs
  `ffmpeg.exe` hard-depends on at load time (`avcodec-63`, `avdevice-63`,
  `avfilter-12`, `avformat-63`, `avutil-61`, `swresample-7`, `swscale-10`),
  copied from `ffmpeg-modulo-multi/repo/ffmpeg/ffmpeg-master-latest-win64-gpl-shared`
  (an official GPLv3 ffmpeg build with libvpx/libwebp/libx264/libx265/libaom/
  libdav1d etc. already enabled). ~157MB, tracked via Git LFS
  (`.gitattributes`).
- `repos/jpexs-decompiler-master/libsrc/ffdec_lib/src/com/jpexs/decompiler/flash/exporters/ffmpeg/`:
  - `FFmpegLocator.java` — resolves the ffmpeg binary to run (configured path
    → bundled `tools/ffmpeg/<platform>/` found by walking up from the running
    jar/classes dir → `ffmpeg` on system `PATH`).
  - `FFmpegVideoEncoder.java` — `encodeAlphaWebM(frameDir, namePattern,
    frameRate, outputFile)`: builds and runs
    `ffmpeg -y -framerate F -i <pattern> -c:v libvpx-vp9 -pix_fmt yuva420p
    -auto-alt-ref 0 -lossless 1 <out>.webm` via `ProcessBuilder`.
- **Verified for real**: generated a PNG sequence with a genuine alpha
  gradient (Python/Pillow), ran it through the actual compiled
  `FFmpegLocator`/`FFmpegVideoEncoder` classes (not just the CLI by hand),
  decoded the result back (`ffmpeg -c:v libvpx-vp9 -i out.webm -pix_fmt rgba`)
  and confirmed per-pixel alpha values round-tripped exactly
  (0 → 113 → 255). Note: **decoding** WebM alpha with this ffmpeg build
  requires explicitly forcing the `libvpx-vp9` decoder
  (`-c:v libvpx-vp9` on the input) — the default "native" `vp9` decoder in
  this build does *not* merge the alpha side-channel and silently reports
  `yuv420p` (no alpha) instead of `yuva420p`. Not an issue for our use case
  (we only encode), but a real gotcha if anyone adds decode-side code later.

### 2. WebM (alpha) export wired into FFDec
- `FrameExportMode.WEBM_ALPHA` / `SpriteExportMode.WEBM_ALPHA` added
  (`.../exporters/modes/`), `available()` gated on `FFmpegLocator.isAvailable()`.
- `FrameExporter.java`: `WEBM_ALPHA` added to the `usesTransparency` list,
  new `case WEBM_ALPHA` in `exportFrames()`'s switch calling new
  `makeWebMAlpha(...)` (writes ARGB frames to a temp dir as PNGs via the
  existing `ImageHelper`, then calls `FFmpegVideoEncoder.encodeAlphaWebM`),
  and the `SpriteExportMode → FrameExportMode` mapping in
  `exportSpriteFrames()` extended.
- `Configuration.java`: new `ffmpegLocation` field (`paths` category, same
  pattern as `graphVizDotLocation`) — user-overridable ffmpeg path, surfaced
  automatically in the Settings dialog via `AdvancedSettingsDialog.properties`
  (`config.name.ffmpegLocation` / `config.description.ffmpegLocation`).
- Translations added: `frames.webm_alpha` / `sprites.webm_alpha` in
  `ExportDialog.properties` (English only — other locale `.properties` files
  were **not** updated, they'll just fall back to missing-key behavior for
  this one string until translated).
- `ExportDialog.java`/`MainPanel.java`/`CommandLineArgumentParser.java` needed
  **no changes** — they all drive off `FrameExportMode`/`SpriteExportMode`
  reflectively (enum values → combo box, `enumFromStr` for the CLI), so the
  new enum value is automatically exposed everywhere those already are.
- **Not verified**: whether the full FFDec Swing app actually builds/runs
  with these changes — no Ant in this dev sandbox. Verified instead: (a) the
  `ffmpeg`/`cab` packages compile and run correctly standalone via `javac`
  against a stub `Configuration` class, (b) every edit was hand-checked
  against the exact surrounding code it was inserted into.

### 3. MS-CAB (.mco/.mct) library + FFDec wiring
- `repos/jpexs-decompiler-master/libsrc/ffdec_lib/src/com/jpexs/decompiler/flash/exporters/cab/`:
  `CabEntry`, `CabReader`, `CabWriter`, `WinkPackageIO`. Pure Java, no
  third-party deps (`java.util.zip.Inflater` only).
- **Verified for real** against genuine sample files found at
  `../chismy-messenger/Assets_utilizados/` (a sibling project, not part of
  this repo) — `winks/Coca.MCO` (single wink, 2-level nesting:
  `content.xml` + `coca.cab` → `coca.png`/`coca.swf`/`content.xml`) and
  `Nueva carpeta/winks.mct` (17-wink collection, each nested one level:
  `content.xml` + `<name>.mct` → thumbnail + `.swf` + `content.xml`).
  `content.xml` turned out to be a real, well-formed MSN Messenger "wink"
  manifest (`xmlns="http://messenger.msn.com/messengercontent/1.0"`,
  `type="wink"`) — this is not a proprietary/unknown format, it's a
  documented public XML schema wrapped in a standard cabinet.
  - `CabReader.readRecursive()` correctly extracted **all** entries from
    both files, with correct PNG/JPEG/SWF file signatures on every single
    leaf across all 17 nested winks.
  - `CabWriter.write()` + `WinkPackageIO.repackage()` round-tripped every
    entry byte-for-byte back through `CabReader`, **and** the output was
    independently verified extractable by Windows' own `expand.exe` (real
    Cabinet API, not just our own reader) — both for a standalone wink
    (`Coca.MCO`) and for a wink extracted out of the 17-wink collection
    (`bow.mct`).
- Key technical finding: **MSZIP blocks in a CAB folder are not one
  continuous deflate stream.** Each block is compressed independently with
  its own dictionary primed from the *previous block's last 32KB of
  uncompressed output* (`Inflater.setDictionary`, reset per block) — treating
  it as one continuous `Inflater.inflate()` call across block boundaries
  silently corrupts every file after the first ~32KB in a folder (first
  discovered when `Coca.MCO`'s single nested cab decoded wrong, and
  `winks.mct`'s first wink decoded right but every subsequent one didn't).
- Key technical finding: **write CFDATA checksums as zero.** The documented
  [MS-CAB] checksum algorithm is implemented correctly here (verified against
  reference pseudocode), but real-world `.mco`/`.mct` samples' own stored
  checksums don't match it either — and empirically, Windows' `expand.exe`
  outright rejects a cabinet with a "correctly" computed non-zero checksum
  (`0xca00a009`, an odd "delta package expander" error) while accepting
  zero, which is spec-legal. Confirmed on a minimal single-file test cabinet
  before applying the fix repo-wide.
- `WinkPackageIO.repackage()` always produces a **standalone** wink (its own
  subtree, unwrapped one level from however deep it was nested) — see
  CLAUDE.md for why (sibling wink bytes aren't retained; re-inserting an
  edited wink into an intact 17-wink collection was tried and abandoned, see
  below).
- FFDec wiring (`src/com/jpexs/decompiler/flash/gui/`):
  - `WinkRegistry.java` (new) — weak-keyed `Openable → WinkData` map so a
    later save knows a tab came from a wink package.
  - `Main.java`:
    - `openFile(String, String, Runnable, boolean)`: detects `.mco`/`.mct`
      via `WinkPackageIO.isWinkPackageFile`, extracts (prompting the user to
      pick one via `JOptionPane` if the file has multiple winks), opens the
      extracted SWF from a temp file, registers it in `WinkRegistry`, and —
      important — calls `openable.setFile(originalMcoPath)` so plain
      **Save** (not just Save As) targets the original `.mco`/`.mct`, not the
      throwaway temp `.swf`.
    - `openFileDialog()`: `.mco`/`.mct` added to the "all supported" filter
      list + a dedicated "Wink packages" filter.
    - `saveFile(...)`: if the target `Openable` is wink-registered and the
      output path is `.mco`/`.mct`, serializes the SWF to bytes and calls
      `WinkPackageIO.repackage(...)` instead of writing raw SWF bytes.
    - `saveFileDialog(...)`: dedicated wink filter, made the default filter
      (with the correct `.mco` vs `.mct` extension remembered from import)
      when saving a wink-registered `Openable`, plus the extension-fixup
      block other filters already have (needed — the default `swfFilter`
      would otherwise mangle a typed `foo.mco` into `foo.mco.swf`).
  - New translation keys added: `open.wink.selectTitle` /
    `open.wink.selectPrompt` / `filter.wink` (`MainFrame.properties`,
    English only).
- **Known limitation, not fixed**: this only works smoothly through **Save
  As** in general use, or plain **Save** *after* the file was opened as a
  wink in this same session (via the `setFile()` fix above). If a brand-new
  SWF (never opened from a wink) is saved directly as `.mco`/`.mct` with no
  `WinkRegistry` entry, it silently falls through to writing raw SWF bytes
  under a `.mco` extension — not a valid cabinet. There's no synthesis of a
  `content.xml` manifest from scratch. Reasonable MVP scope; flagged rather
  than guessed at.
- **Not verified**: same as WebM-alpha above — the FFDec GUI wiring itself
  was never run (no Ant here). The underlying `WinkPackageIO` library was
  thoroughly verified standalone (see above).

### 4. Web app: WebM (alpha) profile
- `webapp/` = a full copy of `ffmpeg-modulo-multi/repo/video-compress-main`
  (Next.js 14 / React 18 / TypeScript / Tailwind / shadcn / `@ffmpeg/ffmpeg`
  0.12.10), with a "Transparent background (alpha)" toggle added (visible
  only when output format = WEBM): `types.ts` (`keepAlpha` field),
  `utils/ffmpegCommands.ts` (`getWebMCommand` branches to a
  `libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0` recipe), `videoInputControl.tsx`
  (the Switch), `compress.tsx` (default `false`).
- **Bug fixed in the upstream app while testing this**: `customVideoCompressionCommand`
  in `utils/ffmpegCommands.ts` had a "quick recompress" shortcut that fired
  whenever the *input* file happened to be `.mp4`, completely ignoring the
  user's chosen *output* format — meaning WEBM (and therefore alpha) was
  unreachable for any MP4 source, the single most common case. Fixed to only
  take that shortcut when the output format is also MP4.
- Ran via `bun install` + `bun run dev`, exercised in the actual browser
  (Claude Browser tool) end-to-end: uploaded a real video (via a synthetic
  `DataTransfer`/`change` event on the file input — no native OS file dialog
  needed for this kind of test), selected WEBM + alpha, clicked Compress,
  inspected ffmpeg.wasm's console output.
- **Known issue — WEBM+alpha crashes in this app's ffmpeg.wasm core**:
  `RuntimeError: memory access out of bounds`, reproduced on both a large
  (2208×1558) and tiny (320×240) test clip, with and without `-auto-alt-ref`,
  with and without `-b:v 0`, and even after swapping in a freshly
  `npm`-fetched `@ffmpeg/core@0.12.10` UMD build (same crash — ruled out
  "stale bundled core" as the cause). Plain VP8 WebM (no alpha, pre-existing
  code path) completes successfully in the same environment, confirming the
  crash is specific to `libvpx-vp9` + `yuva420p` in this **single-threaded**
  `@ffmpeg/core` build, not a bug in the command construction — the exact
  same recipe works perfectly via native ffmpeg (see section 1). Left the
  correct command in place (commented with this finding) rather than
  papering over it. See "Recommended next steps" for how to actually fix
  this (multi-threaded core, most likely).
- `.env.local` created locally (`NEXT_PUBLIC_URL="http://localhost:3000"`,
  gitignored) — without it `app/layout.tsx` throws on `new URL(undefined)`
  and every route 500s. Not committed (matches `.env*.local` in
  `webapp/.gitignore`); document this as a setup step, don't assume it exists
  on a fresh clone.

## Update (2026-07-26, later same day): audio support added to WebM export

User feedback after trying the real build: two issues.

1. **"No option to save/export as webm"** — turned out to be two separate
   causes, both resolved by clarification rather than code changes: (a) the
   user has a second, pre-existing, unmodified FFDec install at
   `C:\Program Files (x86)\ffdec\ffdec.exe` (their Start Menu/desktop
   shortcut) which obviously has none of this project's changes - only
   `repos/jpexs-decompiler-master/dist/ffdec.exe` does; (b) in the real
   build, "WebM (alpha)" **is** in the format dropdown, it's just the
   second-to-last of ~11 entries and needs scrolling to see. Verified via
   `computer-use`: opened the actual built app, selected a real wink's
   frames, scrolled the dropdown, selected WebM (alpha), ran a real export -
   0 errors, output file confirmed via ffprobe to have `TAG:alpha_mode=1`.
2. **"Export has no sound, and clicking Export produces everything as
   separate files"** — the "separate files" part is almost certainly
   FFDec's pre-existing, by-design "Exportar todas las partes" (Export All
   Parts) behavior, which exports every tag category (sounds, shapes,
   images, frames, scripts, ...) to its own file/folder - normal FFDec
   behavior, unrelated to this project's changes, not something to "fix".
   The right workflow for "one combined file" is to select only the
   frames/sprite node and use "Exportar selección" (as demonstrated above) -
   that already produces exactly one `.webm`. **The missing-audio part was
   real** and has been fixed - see below.

### Audio muxing implementation

`AudioTrackExtractor.java` (new,
`libsrc/ffdec_lib/src/.../exporters/ffmpeg/`) inspects a timeline's own
tag list (`Timelined.getTags()`) for the two unrelated ways SWF attaches
audio - confirmed empirically by extracting all 15 real `winks.mct` SWFs and
inspecting their tags (`SoundStreamHeadTag`/`SoundStreamHead2Tag` +
`SoundStreamBlockTag`s in 11/15 files; `DefineSoundTag` + `StartSoundTag` in
the other 4):

- **Streaming sound** (`SoundStreamHead(2)Tag`): already synced 1:1 with the
  timeline starting at frame 0. Exported via the *existing*
  `SoundExporter.exportSound(tag, SoundExportMode.WAV)` - no new decoding
  logic needed, `SoundStreamHeadTag.getRawSoundData()` already resolves
  through `swf.getTimeline().getSoundStreamBlocks(this)`, which is
  populated as a side effect of the `Timeline` FFDec already constructed to
  render the frames being exported (confirmed by reading
  `Timeline.populateSoundStreamBlocks` - no extra population step needed
  here).
- **Event sound** (`StartSoundTag` → `DefineSoundTag` via
  `swf.getCharacter(startSound.soundId)`): walks the tag list counting
  `ShowFrameTag`s to know which frame index each `StartSoundTag` sits on,
  exports the referenced `DefineSoundTag` to WAV, computes a millisecond
  delay from that frame index and the timeline's frame rate.
- Streaming sound takes priority if a timeline somehow has both (rare).
  Multiple event sounds are supported and get mixed together.

`FFmpegVideoEncoder.encodeAlphaWebM` gained an `audioTracks` parameter
(overload kept for the silent case). One zero-delay track maps straight
through (`-map 1:a`); anything else (multiple tracks, or one with nonzero
delay) goes through `-filter_complex` with one `adelay=Xms:all=1` per track
feeding an `amix`. Audio is encoded `-c:a libopus` (WebM only allows
Opus/Vorbis). `FrameExporter`'s `case WEBM_ALPHA:` now calls
`AudioTrackExtractor.extract(swf, tim.timelined, swf.frameRate)` once before
its export loop and cleans up the temp WAV file(s) in a `finally` block.

**Verified for real, end-to-end, through the actual built GUI** (not just
standalone): rebuilt (`ant build` - BUILD SUCCESSFUL), launched
`dist/ffdec.exe`, exported `water_balloon.swf`'s frames (a streaming-sound
file) as WebM (alpha) via the real Export dialog, and confirmed with
`ffprobe -show_streams` on the actual output: stream 0 is VP9 video with
`TAG:alpha_mode=1` (7.666s, matches 92 frames @ 12fps), stream 1 is Opus
audio (mono, 48kHz, 4.457s), and `ffmpeg -af volumedetect` confirms real
non-silent audio content (mean -19.2dB, peak -0.0dB) - not an empty/silent
track. The event-sound path (e.g. `kiss.swf`, `bow.swf`) was exercised via
the underlying extraction logic but not re-verified through the GUI in this
pass - same mechanism, lower incremental risk, but worth a spot-check if
audio timing on an event-sound wink ever looks off.

## Update (2026-07-26, later still): fixed a real audio sync bug

User reported the exported WebM's audio was "desfasado" (out of sync) after
the audio feature above shipped. Root cause found and fixed, not a false
alarm:

**Streaming sound is not one continuous track starting at frame 0.** SWF
splits it into one or more `SoundStreamFrameRange`s (see
`timeline/SoundStreamFrameRange.java`), each with its own `startFrame` -
playback can start partway into the timeline, or stop and restart later.
The original `AudioTrackExtractor` exported the `SoundStreamHeadTypeTag`
directly, whose `getRawSoundData()` silently concatenates every range back
to back with **no gap** and always got placed at `delayMs=0` - correct only
for the special case where the (only) range happens to start at frame 0.
For `water_balloon.swf`, the range actually starts at frame 29 (12fps →
2417ms in) - the audio was playing 2.4s too early, every time.

Fix: `AudioTrackExtractor` now calls `streamHead.getRanges()` and exports
**each range separately** via `SoundExporter.exportSound(range, ...)` -
`SoundStreamFrameRange` itself implements `SoundTag`, so this needed no new
decoding logic - computing each range's delay from its own `startFrame`
(`range.startFrame / frameRate`), reusing the existing multi-track
adelay+amix mixing path built for event sounds. Event-sound files (the
`StartSoundTag`/`DefineSoundTag` pattern - `kiss.swf`, `bow.swf`, etc.) were
already frame-accurate and are unaffected by this fix.

Verified with a real before/after comparison on `water_balloon.swf`:
diagnostic showed the corrected delay is 2417ms (vs. the old hardcoded 0);
rebuilt, re-exported through the actual running GUI, and ran
`ffmpeg -af silencedetect` on the real output - the audio track is now
silent until **~2.57s**, matching the expected 2.42s start (small
difference is just the detector's onset threshold, not error), where
before it had audible content from t=0.

## Update (2026-07-26, later still): SoundStreamHead parser robustness fix + bitrate control

Two more real user reports, both fixed and verified:

**1. "Error al leer un SWF, no se escucha el sonido"** - `laugh.swf` (a real
wink) failed to parse entirely, showing an "errored" tag
`Error (tcl: SoundStreamHead, tid: 18)` in the tree, losing all its sound
(and any tag data depending on it). Root-caused by manually walking the raw
tag bytes (bypassing FFDec's parser to get ground truth): the tag declares
MP3 streaming-sound compression (`streamSoundCompression=2`), which per
spec requires a trailing 2-byte `latencySeek` field - but the tag is only 4
bytes long, missing that field entirely. This is a genuinely malformed (or
just very old/nonstandard - the file is dated 2005) SWF, which real Flash
Player tolerates but FFDec's stricter parser threw
`EndOfStreamException` on and gave up, discarding the whole tag.
**Fixed in `SoundStreamHeadTag.java` and `SoundStreamHead2Tag.java`**
(both have the identical pattern): catch `EndOfStreamException` around the
`latencySeek` read and default it to 0 instead of aborting the tag - this
is a general FFDec parser robustness fix, not specific to the WebM/wink
features, and benefits every code path that touches this tag (rendering,
sound export, tag tree display), not just `AudioTrackExtractor`. Verified:
`laugh.swf` now parses with zero errors (confirmed both via a standalone
diagnostic and by actually opening it in the rebuilt GUI - no "errored"
node, audio track correctly detected).

**2. "¿Cómo se regula la velocidad de bits (kbps)?"** - it wasn't
regulable at all before; video was always encoded `-lossless 1` (quality
capped only by content, files can get large) and audio always used
libopus's automatic bitrate. Added two settings, following the exact
`ffmpegLocation` pattern: `Configuration.webmAlphaBitrateKbps` (0 = keep
lossless/current behavior; >0 switches `FFmpegVideoEncoder` to
constrained-quality mode: `-crf 30 -b:v <N>k`) and
`Configuration.webmAlphaAudioBitrateKbps` (0 = automatic; >0 sets `-b:a`
on the Opus track). Both surfaced in Settings under a new "export"
category, described in `AdvancedSettingsDialog.properties`. Verified with
a direct before/after encode of the same 30-frame test clip: default
(lossless) produced a 47,308-byte file; setting the target to 200kbps
produced 11,049 bytes from identical input - confirms the control is
real, not just plumbed through and ignored.

## In progress / pending

Nothing actively in progress — the four build tasks above are each in a
complete, tested (to the extent the sandbox allows), committable state.
Pending, in rough priority order:

1. **Run `ant` (or open in NetBeans) against `repos/jpexs-decompiler-master`**
   on a machine that has Ant + a JDK, to confirm the FFDec-side changes
   (Main.java, FrameExporter.java, Configuration.java, the new enum values,
   the new `ffmpeg`/`cab` packages) actually compile and the app launches.
   This is the single most important unverified thing in this repo.
2. **Fix or route around the ffmpeg.wasm VP9-alpha crash in `webapp/`** — see
   "Recommended next steps."
3. Decide whether/how to synthesize a `content.xml` manifest for a
   never-was-a-wink SWF being saved as `.mco`/`.mct` (currently unsupported,
   see "Known limitation" above), if that workflow turns out to matter.
4. Non-English translations for the new strings (`frames.webm_alpha`,
   `sprites.webm_alpha`, `open.wink.*`, `filter.wink`,
   `config.name/description.ffmpegLocation`) — only the base (English)
   `.properties` files were updated.
5. `git add`/commit the new content (`repos/`, `tools/`, `webapp/`,
   `.gitattributes`) — deliberately left undone, see "Known issues" below.

## Technical decisions (and why)

- **Prebuilt ffmpeg binary, not a from-source build** — no C compiler,
  NASM, or GNU Make in this dev sandbox (Visual Studio alone isn't enough;
  ffmpeg's build also needs those). The already-built official GPL Windows
  binary already has every codec this project needs (libvpx, libwebp, plus
  libx264/libx265/libaom/libdav1d for headroom). Revisit only if a genuinely
  custom/trimmed ffmpeg build becomes necessary — that would need `nasm` and
  a proper `make` installed first.
- **Git LFS for `tools/ffmpeg/win64/*` and `webapp/public/download/*.wasm`**
  — `avcodec-63.dll` alone is ~99MB; GitHub hard-rejects any single file
  ≥100MB without LFS, and even under that, un-LFS'd binaries this large
  permanently bloat repo history. `.gitattributes` already has the rules;
  `git lfs install` was run locally so filters are active, but **nothing has
  been committed** (see "Known issues").
- **`WinkPackageIO.repackage()` always exports a standalone wink**, never
  attempting to reinsert an edited wink back into its original multi-wink
  collection file. The alternative (preserve the other 16 winks byte-for-byte
  when re-saving one) was actually implemented first and found broken: it
  silently *dropped* every sibling wink, because `WinkData.allEntries` (from
  `CabReader.readRecursive()`) only retains decompressed leaf files, not each
  sibling cabinet's own raw bytes. Given every real sample is itself a
  standalone single-wink file, and re-encoding 16 untouched siblings on every
  edit would be wasteful even if the bytes were retained, "export as its own
  standalone file" is both simpler and the more useful default.
- **CFDATA checksums = 0 in `CabWriter`**, not "correctly" computed — see the
  finding under "MS-CAB library" above. This is empirically required for
  Windows' own cabinet API to accept the output, confirmed with a controlled
  before/after test.
- **`Configuration.ffmpegLocation` mirrors `graphVizDotLocation` exactly**
  rather than inventing a new settings pattern — FFDec already has this exact
  "external tool path, empty = not configured" shape for GraphViz `dot`.
- **Web app is a companion tool, not a SWF renderer.** No SWF-capable
  renderer (e.g. Ruffle) exists in this repo's dependency set, so the web app
  can't itself turn a `.swf` into pixels — it converts an already-rendered
  video/PNG-sequence source to WebM+alpha. FFDec (desktop) is what actually
  renders SWF frames.

## Known issues / gotchas

- **Nothing in this repo is committed yet** beyond the very first commit.
  `repos/`, `tools/`, and `webapp/` are all untracked. Before committing:
  run `git lfs install` (already done once on this machine, but confirm on
  any other), then be deliberate about `git add` — `tools/ffmpeg/win64/` and
  `webapp/public/download/*.wasm` are large; everything else here is normal
  source. Do **not** `git add -A` blindly given the size of `repos/`
  (149MB) and `webapp/node_modules` if it exists locally (already gitignored
  inside `webapp/`, but double-check `git status` before staging).
- **ffmpeg.wasm VP9+alpha crashes in the browser** (see section 4) — the
  desktop (FFDec) path is unaffected and fully verified; only the `webapp/`
  client-side path has this issue.
- **FFDec-side changes are unverified by compilation** — no Ant in this
  sandbox. Treat `repos/jpexs-decompiler-master` changes as "carefully
  written, not yet build-tested" until someone runs `ant`.
- **Plain "Save" on a wink only writes back correctly if the tab was opened
  from that wink in the current FFDec session** (see the `setFile()` note in
  section 3) — this is intentional/expected given the temp-file-based import,
  not a bug, but worth remembering when testing.
- `webapp/.env.local` must exist locally (see section 4) — not committed,
  not created automatically on a fresh clone.

## Recommended next steps

1. Get Ant installed and run `ant` in `repos/jpexs-decompiler-master`; fix
   any compile errors surfaced (expected to be small/mechanical if any,
   given how closely the new code mirrors existing patterns — but unverified
   is unverified).
2. For the ffmpeg.wasm VP9-alpha crash: try `@ffmpeg/core-mt` (multi-threaded
   core) instead of the single-threaded core currently bundled — this
   requires serving the app with `Cross-Origin-Opener-Policy: same-origin`
   and `Cross-Origin-Embedder-Policy: require-corp` headers (SharedArrayBuffer
   requirement), which means a `next.config.mjs` headers() change plus
   swapping the `coreURL`/`wasmURL` in `compress.tsx`'s `ffmpeg.load(...)`
   call to the `-mt` core's files. Untried here — flagged as the most
   promising fix, not yet attempted for time/scope reasons.
3. Once Ant-verified, actually exercise the two new FFDec features by hand:
   open a real `.mco`/`.mct` (samples exist at
   `../chismy-messenger/Assets_utilizados/`, outside this repo — copy one in
   for a manual smoke test if convenient), edit something, save, reopen, and
   separately export a sprite animation to WebM (alpha) and check it in a
   player/browser that supports transparent WebM.
4. If the "save a brand-new SWF as .mco/.mct" workflow turns out to matter,
   design a minimal default `content.xml` template rather than leaving that
   path silently producing an invalid file.
