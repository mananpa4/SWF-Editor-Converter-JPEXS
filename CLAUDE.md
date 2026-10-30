# CLAUDE.md

Guidance for Claude Code when working in this repository. This file holds only
**relatively permanent** information — architecture, conventions, commands.

**Before making any non-trivial change, read [CLAUDE_CONTEXT.md](CLAUDE_CONTEXT.md).**
It is the living memory of this project: current state, what's implemented,
what's in progress, decisions already made (and why), known issues, and the
recommended next steps. Update it whenever you finish meaningful work here.

## What this project is

A SWF (Adobe Flash) editor/converter built around three components living in
one repository:

1. **`repos/jpexs-decompiler-master/`** — a vendored, modified copy of
   [JPEXS Free Flash Decompiler (FFDec)](https://github.com/jindrapetrik/jpexs-decompiler),
   a full-featured Java Swing SWF viewer/editor/decompiler. This is "the
   editor." It has been extended with two custom features (see below) not
   present upstream.
2. **`tools/ffmpeg/win64/`** — a minimal, real, working copy of an official
   ffmpeg GPLv3 build (with libvpx/libwebp/libx264/libx265 etc.), used as the
   "ffmpeg all-in-one" runtime dependency for video encoding. Tracked via Git
   LFS (see below).
3. **`webapp/`** — a Next.js client-side video converter (forked from
   [video-compress-main](https://github.com/pranavp10/video-compress)),
   extended with a WebM+alpha output profile using `@ffmpeg/ffmpeg`
   (ffmpeg.wasm). A companion/standalone tool — it does not render SWF itself.

### The two custom FFDec features

- **WebM (alpha) frame/sprite export** — a new `FrameExportMode.WEBM_ALPHA` /
  `SpriteExportMode.WEBM_ALPHA` that renders a frame sequence exactly like the
  existing PNG/APNG export path (alpha-preserving `TYPE_INT_ARGB_PRE`), writes
  it as temp PNGs, then shells out to ffmpeg (`-c:v libvpx-vp9 -pix_fmt
  yuva420p -auto-alt-ref 0 -lossless 1`) to produce a WebM with a real,
  transparent alpha channel.
- **`.mco`/`.mct` "wink" package import/export** — these are Microsoft
  Cabinet (MS-CAB, `MSCF` signature) archives, sometimes nested, holding a
  `content.xml` manifest + thumbnail image + SWF animation. FFDec can now
  open one directly (extracting the SWF into a normal tab) and save/save-as
  back into an equivalent, real-world-compatible `.mco`/`.mct` file.

Both features are implemented as small, self-contained, non-invasive
libraries under a new package,
`com.jpexs.decompiler.flash.exporters.{ffmpeg,cab}`, in
`libsrc/ffdec_lib/src/...`, wired into the existing FFDec UI/export machinery
at a handful of clearly-marked points. See CLAUDE_CONTEXT.md for the exact
file list and design rationale.

## Architecture

```
SWF-Editor-Converter-JPEXS/
├── repos/jpexs-decompiler-master/   FFDec (Java, Ant build, target Java 8)
│   ├── src/                          GUI layer (Swing) — Main.java, MainPanel.java, dialogs
│   ├── libsrc/ffdec_lib/src/         Core library — SWF model, tags, exporters, rendering
│   │   └── com/jpexs/decompiler/flash/exporters/
│   │       ├── ffmpeg/                FFmpegLocator, FFmpegVideoEncoder (new)
│   │       └── cab/                   CabReader, CabWriter, WinkPackageIO (new)
│   ├── libsrc/*/                     Bundled third-party libs (avi, gif, apng, webp4j, ...)
│   ├── lib/                          Prebuilt jars these libs compile to
│   └── build.xml                     Ant build (Ant is NOT installed in this dev sandbox)
├── tools/ffmpeg/win64/               Minimal ffmpeg.exe + DLLs (Git LFS)
├── webapp/                           Next.js WebM/alpha web converter (video-compress-main fork)
├── .gitattributes                    Git LFS rules for the binaries above
├── CLAUDE.md                         This file
├── CLAUDE_CONTEXT.md                 Living project state — READ BEFORE BIG CHANGES
└── README.md                         User-facing overview
```

### Rendering pipeline (why alpha export was possible without a rewrite)

`SWF.frameToImageGet(...)` (in `libsrc/ffdec_lib/.../SWF.java`) already
renders any frame to a `BufferedImage` of type `TYPE_INT_ARGB_PRE` — alpha is
preserved end-to-end. `FrameExporter` decides per-mode whether to keep that
alpha (`usesTransparency`) or flatten it onto a background color. The WebM
export simply joins the same `usesTransparency = true` list that
PNG/GIF/WEBP/APNG already use.

### FFmpeg wrapper design

No C/C++ compiler toolchain is available in this dev environment (see
"Environment constraints" below), so `tools/ffmpeg/win64/` is a **prebuilt**
official ffmpeg GPL binary — not something built from source here.
`FFmpegLocator` resolves, in order: (1) `Configuration.ffmpegLocation` if the
user set one, (2) walking up from the running jar/classes directory looking
for `tools/ffmpeg/<platform>/ffmpeg(.exe)` (covers this repo's layout), (3)
`ffmpeg` on the system `PATH` (typical for Mac/Linux with Homebrew/apt).
`FFmpegVideoEncoder` just builds the argv and runs it via `ProcessBuilder`.

### MS-CAB library design

`CabReader`/`CabWriter` implement the parts of the public [MS-CAB
spec](https://learn.microsoft.com/en-us/previous-versions/bb417343(v=msdn.10))
actually needed here: CFHEADER/CFFOLDER/CFFILE parsing, STORED and MSZIP
decompression (MSZIP blocks are **not** one continuous deflate stream — each
block is its own raw-deflate stream primed with the previous block's last
32KB of uncompressed output as an `inflateSetDictionary`-style dictionary;
get this wrong and later files in a folder silently decode to garbage even
though sizes look right). The writer always emits STORED (uncompressed) data
and **zero CFDATA checksums** — real-world `.mco`/`.mct` samples' own
checksums don't validate against the documented [MS-CAB] checksum algorithm
either, and empirically, Windows' own `expand.exe`/FDI accepts zero checksums
but rejects ones computed "correctly" per that algorithm. Verified round-trip
against both this repo's own `CabReader` and Windows' native `expand.exe`.

`WinkPackageIO.repackage()` always emits a wink as a **standalone** package
(its own subtree only) — it does not attempt to reconstruct a multi-wink
collection cabinet with untouched sibling winks re-inserted, since decoded
leaf bytes for those siblings aren't retained by design.

## Tech stack

| Component | Stack |
|---|---|
| FFDec editor | Java 8, Swing, Ant, NetBeans project layout |
| ffmpeg wrapper | Java (`ProcessBuilder`), no external deps |
| MS-CAB library | Java (`java.util.zip.Inflater` only), no external deps |
| Web app | Next.js 14 (App Router), React 18, TypeScript, Tailwind, shadcn/Radix, `@ffmpeg/ffmpeg` (ffmpeg.wasm), bun |

## Commands

### FFDec (Java editor)
```bash
cd repos/jpexs-decompiler-master
ant build              # compiles + produces dist/ffdec.exe, dist/ffdec.jar, dist/lib/
ant run                # build + launch the GUI directly
```
Requires JDK 8+ and Apache Ant — **neither is guaranteed to be on PATH**.
`ant` was not installed in the primary dev environment this project has been
built in; when that happens, download a portable Ant binary (no admin/install
needed) and point `ANT_HOME`/`JAVA_HOME` at it for that shell session:
```bash
curl -sL -o ant.zip https://archive.apache.org/dist/ant/binaries/apache-ant-1.10.15-bin.zip
unzip -q ant.zip
export ANT_HOME="$(pwd)/apache-ant-1.10.15" JAVA_HOME="<your JDK 8+ home>"
"$ANT_HOME/bin/ant" build
```
`ant build` has been run successfully this way — see CLAUDE_CONTEXT.md for
what was verified. The resulting `dist/ffdec.exe` is a thin native launcher;
it only works with `dist/ffdec.jar` and `dist/lib/` sitting next to it (all
three come from the same `ant build`).

### Web app
```bash
cd webapp
bun install             # or npm/pnpm install
bun run dev              # http://localhost:3000
bun run build && bun run start
```
Needs `.env.local` with `NEXT_PUBLIC_URL="http://localhost:3000"` (copy from
`.env.example`) — without it, `app/layout.tsx`'s `new URL(...)` throws and
every route 500s.

### ffmpeg binary sanity check
```bash
tools/ffmpeg/win64/ffmpeg.exe -version
```
Must be run with that directory as the working directory (or via an absolute
path from a shell that resolves sibling DLLs from the exe's own folder) — all
7 DLLs (`avcodec-63.dll`, `avdevice-63.dll`, `avfilter-12.dll`,
`avformat-63.dll`, `avutil-61.dll`, `swresample-7.dll`, `swscale-10.dll`) are
hard load-time dependencies of `ffmpeg.exe`, including `avdevice` even though
nothing here uses capture devices.

## Conventions

- **FFDec Java code**: follow existing FFDec conventions exactly — GPL/LGPL
  header block per file (LGPL for `libsrc/ffdec_lib`, GPL for `src/`), 4-space
  indent, `@author JPEXS` javadoc tag, translations via `.properties` files
  under `src/com/jpexs/decompiler/flash/gui/locales/` keyed as
  `<lowercase-category>.<enum_value_lowercase>` (see `ExportDialog.properties`)
  or `config.name.<field>` / `config.description.<field>` for Settings dialog
  entries (see `AdvancedSettingsDialog.properties`). New `Configuration`
  fields follow the `@ConfigurationDefault*` / `@ConfigurationCategory` /
  `ConfigurationItem<T>` pattern already used throughout
  `Configuration.java` — mirror an existing field (e.g. `graphVizDotLocation`)
  rather than inventing a new pattern.
- **Web app**: follow the existing `video-compress-main` conventions — one
  `get<Format>Command` function per output format in `utils/ffmpegCommands.ts`,
  settings flow through `VideoInputSettings` (types.ts) and the
  `VideoInputControl` component (Switch/Select per option, shadcn style).
- Don't reformat files you're not otherwise editing.
- No emojis in code, comments, or commit messages unless explicitly asked.

## Environment constraints (matter for planning any future work here)

The sandbox this project has mostly been developed in does **not** have: a
C/C++ compiler, NASM/YASM, GNU Make (only a non-GNU `make` was present),
`pkg-config`, Docker, or Apache Ant. That means:
- **Apache Ant is not installed by default** — but its absence is not a hard
  blocker: a portable Ant binary (no admin rights needed, see "Commands"
  above) is enough to `ant build` and produce a real, working
  `dist/ffdec.exe`. This has been done and verified (app launches, GUI
  renders, opens/plays real SWFs) — see CLAUDE_CONTEXT.md. Re-run `ant build`
  after any further change to `repos/jpexs-decompiler-master` before trusting
  it compiles; don't assume a change is fine just because it looks correct.
- **ffmpeg/x264/x265/libvpx cannot be compiled from source there.** The
  `tools/ffmpeg/win64/` binaries are copied from an already-built official
  release, not compiled here. A real from-source build additionally needs
  NASM + GNU Make even where an MSVC install exists.
- Node/npm/bun, Python (with Pillow), PowerShell, and a native Windows
  `expand.exe`/cabinet API *were* available and used to genuinely test the
  ffmpeg and MS-CAB pieces end-to-end (see CLAUDE_CONTEXT.md for what was
  actually verified vs. what's untested).

## Working rules for Claude

1. Read CLAUDE_CONTEXT.md before starting non-trivial work in this repo.
2. When touching `repos/jpexs-decompiler-master`, grep for an existing,
   similar feature first and mirror its exact pattern (enum values,
   `.properties` translation keys, `Configuration` field style) — this
   codebase is large, and consistency matters more than local cleverness.
3. Don't assume you can compile/run FFDec — verify claims about it by reading
   code carefully and, where possible, testing the *logic* standalone (as
   done for `FFmpegLocator`/`CabReader`/`CabWriter`), not by running the full
   app.
4. Any change to the `tools/ffmpeg` binaries or `webapp/public/download`
   wasm core is a large binary change — keep `.gitattributes` LFS rules in
   sync (`git lfs install` once per machine before committing).
5. Never commit or push unless the user explicitly asks.
6. Update CLAUDE_CONTEXT.md after finishing meaningful work — that's where
   state belongs, not here.
