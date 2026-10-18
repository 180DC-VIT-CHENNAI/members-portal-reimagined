# Letter document modules

`templates.ts` retains all 13 legacy document types, form/data mappings, escaping and deterministic reference generation. `assets.ts` contains the embedded logos; public appointment letterheads live under `public/images/`.

`render.ts` measures under an isolated `.letter-document` root using `document.css`. It waits for fonts, inline images and backgrounds, splits flow content by measured space, reserves final signatures and refuses an unfit atomic block rather than clipping it. `pagination.ts` is its pure, tested flow planner. Physical A4 geometry is independent of browser width and UI theme.

The studio validates the current form, calls `collectLetterData`, then `renderLetter`. The returned pages must remain in their hidden root until PDF generation finishes. Call `dispose()` in `finally`. Visible previews use the returned HTML in a separate, scaled clone.

`generateLetterPdf` lazy-imports html2canvas/jsPDF, tries successively smaller capture profiles, and returns its smallest PDF even if the email target cannot be met. html2canvas measures text baselines with a 1x1 `<img>` probe on the live `<body>`; `src/styles.css` keeps that probe inline despite the global `img { display: block }` reset, otherwise every captured line is drawn too low. The caller enforces separate save/email limits. Print setup belongs in the isolated print surface, not a global portal `@page` rule.

## Deliberate differences from legacy

- MOU validation requires its agreement fields, not a member registration number.
- Pagination includes headers, references and the final signature; tables split by rows and paragraphs by whitespace. Large one-page appointment content is refused rather than clipped.
- Mobile viewport rules do not alter the document geometry. Only the cloned capture root is revealed to html2canvas; the live measurement tree stays hidden.
- Reference hashes are not unique and do not include every field. Signatory names/tenure and printed signature marks remain legacy template copy, not cryptographic signatures.
- Tests assert field routing, escaping, reference values and layout decisions, not validation-message wording.

Run `pnpm test:unit` in `apps/portal`. Full acceptance additionally requires the studio UI, each exported PDF page, and the private save/email workflow to be exercised in a real browser.
