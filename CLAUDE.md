# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # tsc compile → dist/
npm start            # node dist/server.js
npm run dev          # tsx src/server.ts (no compile step)
npm test             # vitest run (all tests)
npm run test:watch   # vitest watch mode

# Run a single test file
npx vitest run tests/generate.test.ts

# Run a single test by name
npx vitest run --reporter=verbose -t "returns 200 PDF for valid CFDI 4.0"
```

## Architecture

Stateless Fastify microservice: receives a CFDI XML body, returns a PDF stream. No database, no storage — purely functional.

```
src/
  server.ts       # Entry point — reads PORT/HOST from env, starts listener
  app.ts          # Fastify factory exported for tests; registers content-type parsers,
                  # calls initPdf(), registers routes
  pdf.ts          # Core logic: XML parsing → type detection → PDF stream
  nomina.ts       # NominaCfdiTranslator — custom layout for TipoDeComprobante="N"
  errors.ts       # PdfServiceError(message, code, statusCode)
  routes/
    health.ts     # GET /health → { status, version }
    generate.ts   # POST /generate?paper=letter|a4 → PDF stream
```

**Request flow:** `generate.ts` calls `generatePdf(buffer, paperSize)` in `pdf.ts`, which:
1. Parses XML with `nodeFromXmlString` (returns `XmlNode`, not a DOM node — use `.name()` not `.nodeName`)
2. Detects root element local name (`Comprobante` → CFDI, `Retenciones` → Retenciones)
3. Constructs `CfdiData` or `RetencionesData` (throws if `tfd:TimbreFiscalDigital` is absent)
4. For `Comprobante`, detects `TipoDeComprobante="N"` and uses `NominaCfdiTranslator` instead of `GenericCfdiTranslator`
5. Builds PDF via `PdfMakerBuilder.buildStream()` — **must call `.end()` on the returned PDFDocument** or the stream never closes

## Nómina translator (`src/nomina.ts`)

`GenericCfdiTranslator` v2.2.1 has zero support for the `nomina12:Nomina` complement — it renders nómina CFDIs as plain income documents. `NominaCfdiTranslator` wraps the generic translator and post-processes its content array to inject payroll-specific sections.

**Content array surgery** — after `inner.translate()`, the content array for a nómina CFDI is:
```
[top, space, emisor, space, receptor, space, conceptos, space, totales, space, details, space, stamp]
```
The translator:
1. Pops `stamp` (always last)
2. `splice(-4, 4)` — removes CFDI totales + details (the generic green banner and importe con letra)
3. `splice(4, 2, empleadoSection, '\n')` — replaces generic receptor section with nómina employee section
4. Pushes: percepciones/deducciones (2 columns), nómina totals, importe con letra + método/forma de pago, stamp

**Visual style rule**: all custom sections must match the library's native look:
- Section titles: `style: ['tableSubtitleHeader']` + `color: primaryColor`
- Employee/employer name: `style: ['subHeader']` + `color: primaryColor` (fontSize 10, bold)
- Field labels: inline `{ text: 'Label ', color: primaryColor }` inside a text array
- Cell backgrounds: `fillColor: bgGrayColor`
- Table wrappers: `layout: 'tableLayout'` (named layout registered by `PdfMakerBuilder`)
- Outer structure: `widths: ['49.5%', '*', '49.5%']` mirroring emisor/receptor sections

**SAT catalogs** are inlined in `nomina.ts` (no external dependency): `TIPOS_PERCEPCION`, `TIPOS_DEDUCCION`, `METODOS_PAGO`, `FORMAS_PAGO`, `TIPOS_NOMINA`.

**`numberToWords(amount)`** converts a MXN amount to "DIEZ MIL SETECIENTOS PESOS 00/100 M.N." format for the importe con letra field.

## Key library constraints

- `@nodecfdi/cfdi-to-pdf` v2.2.1 (no v3 on npm)
- Translators import from the main entry: `import { GenericCfdiTranslator, GenericRetencionesTranslator } from '@nodecfdi/cfdi-to-pdf'` — there is no `./templates` subpath in this version
- `PdfMakerBuilder` from `@nodecfdi/cfdi-to-pdf/node`
- `buildStream()` returns a PDFKit `PDFDocument` (synchronously, not a Promise). Always call `.end()` on it before returning — without it the stream never emits `end` and Fastify hangs
- No Chromium — PDF generation is pure Node.js via pdfmake/PDFKit
- `XmlNodeInterface.searchNode(...path)` returns `XmlNodeInterface | undefined`; `searchNodes(name)` returns `XmlNodes extends Array<XmlNodeInterface>`
- `TableCell` is a union interface — cannot spread with `...obj`; use `{ ...extra } as TableCell` inside the cell factory function instead
- Named layouts (`'tableLayout'`, `'tableHeader'`, etc.) are registered by `PdfMakerBuilder` — content can reference them by string and they resolve at render time

## ESM / TypeScript

- `"type": "module"` — all local imports need `.js` extension (e.g. `import { foo } from './pdf.js'`)
- `module: NodeNext`, `moduleResolution: NodeNext`
- `tsconfig.json` `include` covers only `src/` — TypeScript diagnostics in test files are expected and harmless (vitest handles test compilation independently)

## Tests

Vitest + `app.inject()` (in-memory, no real port). Fixtures in `tests/fixtures/`:

| File | Type |
|---|---|
| `cfdi40-valid.xml` | CFDI 4.0 with mock `tfd:TimbreFiscalDigital` |
| `cfdi33-valid.xml` | CFDI 3.3 |
| `retenciones-valid.xml` | Retenciones 1.0 — note `montoTotOperacion` must be **camelCase** (the SAT QR extractor is case-sensitive; `MontoTotOperacion` causes silent extraction failure → empty QR → pdfmake error) |
| `nomina-valid.xml` | CFDI 4.0 + Nómina 1.2 — has 4 percepciones, 3 deducciones, MetodoPago/FormaPago; use this to validate the full 2-column layout |
| `cfdi-invalid.xml` | Malformed XML for error-case testing |
