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

This app consolidates and serializes PDF objects into compressed object streams. That is safe for interactive PDFs, but already optimized or image-heavy PDFs may not become smaller. In that case, the original bytes are returned instead of a larger file.
