# SWF Editor & Converter (JPEXS-based)

A SWF (Adobe Flash) editor built on [JPEXS Free Flash Decompiler
(FFDec)](https://github.com/jindrapetrik/jpexs-decompiler), extended with:

- **Export animations to WebM with a real, transparent alpha channel** (VP9 +
  `yuva420p`) — for dropping Flash animations straight into modern web/video
  pipelines with the background actually transparent, not flattened to a
  color.
- **Open and save `.mco`/`.mct` "wink" packages** — Microsoft Cabinet
  archives (a `content.xml` manifest + thumbnail + `.swf`, sometimes nested)
  used by messenger "wink"/emoticon packs — directly, without manually
  unpacking them first.

A companion web app (`webapp/`) offers the same WebM+alpha conversion for
already-rendered video, entirely client-side in the browser (no upload, no
server) via [ffmpeg.wasm](https://ffmpegwasm.netlify.app/).

> **Status**: actively developed. The desktop editor builds and runs — a real
> `ffdec.exe` has been produced (`ant build`) and launched successfully with
> both new features wired in. See [CLAUDE_CONTEXT.md](CLAUDE_CONTEXT.md) for
> exactly what has and hasn't been exercised end-to-end (the WebM-alpha
> export and wink import/export code paths themselves haven't been clicked
> through in the running GUI yet, only compiled and launched).

## Repository layout

```
repos/jpexs-decompiler-master/   FFDec — the desktop editor (Java/Swing, Ant)
tools/ffmpeg/win64/              Bundled ffmpeg (Git LFS) used for WebM export
webapp/                          Client-side WebM/alpha converter (Next.js)
```

## Getting started

### Desktop editor (FFDec)

Requires JDK 8+ and [Apache Ant](https://ant.apache.org/).

```bash
cd repos/jpexs-decompiler-master
ant run
```

**WebM (alpha) export**: open a SWF, right-click a sprite/frame range →
Export → choose **WebM (alpha)**. FFDec looks for ffmpeg in this order: a
path you set in Settings → paths → *ffmpeg executable path*, then the
bundled `tools/ffmpeg/win64/ffmpeg.exe` next to this repo, then `ffmpeg` on
your system `PATH`. On Mac/Linux there's no bundled binary here — install
ffmpeg with libvpx support yourself (e.g. `brew install ffmpeg` /
`apt install ffmpeg`) or point Settings at one.

**Wink packages**: File → Open, pick a `.mco`/`.mct` file (or drag one in —
it's included in the "all supported" filter). If it contains more than one
wink (a collection file), you'll be asked which one to open. Edit as normal;
File → Save writes back to the original `.mco`/`.mct` automatically. File →
Save As lets you pick a new name/location, still as a wink package, as long
as you keep the `.mco`/`.mct` extension.

### Web app (client-side converter)

Requires [Node.js](https://nodejs.org/) or [Bun](https://bun.sh/).

```bash
cd webapp
cp .env.example .env.local   # sets NEXT_PUBLIC_URL — required, app 500s without it
bun install                   # or npm install
bun run dev                   # http://localhost:3000
```

Drop in a video, set format to **WEBM**, toggle **Transparent background
(alpha)**, hit Compress. Everything runs in your browser via WebAssembly —
nothing is uploaded anywhere.

> Known issue: the alpha-encoding path currently crashes in this app's
> bundled ffmpeg.wasm core (`RuntimeError: memory access out of bounds`) —
> confirmed to be a limitation of the single-threaded WASM core, not the
> ffmpeg command itself (the identical command works perfectly through the
> desktop app's native ffmpeg). See CLAUDE_CONTEXT.md for the investigation
> and the likely fix (a multi-threaded core build).

## Why "all-in-one ffmpeg"

`tools/ffmpeg/win64/` bundles an official ffmpeg build with the codecs this
project needs (VP8/VP9 via libvpx, WebP via libwebp) already compiled in —
used as a normal external process from the desktop editor. The web app uses
a completely separate ffmpeg build (ffmpeg.wasm) that runs inside the browser
sandbox instead. Both point at the same underlying ffmpeg project; which one
runs depends on whether you're using the desktop editor or the web app.

Building ffmpeg from source for other platforms (Mac/Linux binaries,
custom/trimmed builds) is not done in this repo — see CLAUDE.md's
"Environment constraints" for what that would require.

## Documentation

- [CLAUDE.md](CLAUDE.md) — architecture, conventions, commands (for humans
  and for Claude Code)
- [CLAUDE_CONTEXT.md](CLAUDE_CONTEXT.md) — current project state: what's
  implemented, what's pending, decisions made and why, known issues

## License

FFDec is GPLv3 (`repos/jpexs-decompiler-master/license.txt`); its `libsrc/`
libraries are individually LGPL or their own respective licenses. The bundled
ffmpeg build is GPLv3 (`tools/ffmpeg/win64/FFMPEG-LICENSE.txt`). The web app
retains its original license (`webapp/LICENSE`).
