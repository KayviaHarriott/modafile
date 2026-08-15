# KiloFile

A lightweight native macOS utility for PDF compression and file conversion. PDF optimization keeps interactive content such as links, form fields, selectable text, and vector graphics intact.

## Run

```bash
npm start
```

For the usual Vite development command, use `npm run dev`.

## macOS app

Build the standalone, fixed-size macOS app with:

```bash
npm run app:build
```

The finished app is written to `standalone/KiloFile.app`.

Then open the local address shown in Terminal. Files are processed entirely in the browser and are never uploaded.

## Build

```bash
npm run build
```

## Compression scope

PDF compression uses a local Ghostscript installation to reduce embedded image sizes while retaining PDF annotations such as links.

## macOS downloads

Create a drag-and-drop installer disk image with `npm run app:dmg`. The result is `standalone/KiloFile.dmg`.

Create a package installer with `npm run app:pkg`. The result is `standalone/KiloFile.pkg` and installs KiloFile in `/Applications`.

These builds are ad-hoc signed for local use. To distribute without Gatekeeper warnings, sign with an Apple Developer ID Application certificate and notarize the DMG or PKG with Apple.
