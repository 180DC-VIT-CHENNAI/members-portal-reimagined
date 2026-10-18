/**
 * Browser-only letter rendering: builds A4 pages inside an isolated, hidden
 * `.letter-document` root (styled by document.css), waits for fonts and
 * images, paginates by real measurement, and rasterises pages to a PDF with
 * lazily loaded html2canvas + jsPDF.
 *
 * Nothing is ever clipped silently: if a page's content does not fit its A4
 * content box after pagination/shrinking, rendering throws LetterRenderError.
 */

import { buildLetterHTML, LETTER_LAYOUTS, type LetterData } from './templates.ts';
import { planFlowPages, type FlowOps } from './pagination.ts';

export const EMAIL_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;
export const LEGACY_DOWNLOAD_TARGET_BYTES = 18 * 1024 * 1024;
const MIN_SHRINK = 0.92;
const A4_WIDTH_PX = (210 * 96) / 25.4;
const CAPTURE_WINDOW_WIDTH = 1280;
const FIT_TOLERANCE_PX = 0.5;

export type LetterRenderErrorKind =
  | 'not-browser'
  | 'stylesheet-missing'
  | 'asset-failed'
  | 'content-too-large'
  | 'signature-too-large'
  | 'page-overflow'
  | 'disposed';

const ERROR_MESSAGES: Readonly<Record<LetterRenderErrorKind, string>> = {
  'not-browser': 'Letters can only be rendered in a browser.',
  'stylesheet-missing': 'The letter stylesheet is not loaded, so the A4 layout cannot be measured.',
  'asset-failed': 'A letter image could not be loaded.',
  'content-too-large': 'Part of this document is too long to fit on an A4 page. Shorten it or break it into separate lines.',
  'signature-too-large': 'The signature block does not fit on an A4 page.',
  'page-overflow': 'A page would be cut off. Shorten the content (very long unbroken words or lines are a common cause).',
  disposed: 'This rendered letter was already discarded. Render it again.',
};

export class LetterRenderError extends Error {
  override readonly name = 'LetterRenderError';
  readonly kind: LetterRenderErrorKind;
  readonly detail: string;

  constructor(kind: LetterRenderErrorKind, detail = '') {
    super(ERROR_MESSAGES[kind]);
    this.kind = kind;
    this.detail = detail;
  }
}

export interface RenderLetterOptions {
  /** Appointment only: use the SVG letterhead artwork instead of PNG. */
  readonly vectorLetterhead?: boolean;
}

export interface RenderedLetter {
  readonly data: LetterData;
  readonly pageCount: number;
  /** Final page markup for a preview; place it inside an element with class `letter-document`. */
  readonly pagesHtml: string;
  readonly pages: readonly HTMLElement[];
  /** Removes the hidden render root. The PDF can no longer be generated afterwards. */
  dispose(): void;
}

export interface PdfProfile {
  readonly format: 'png' | 'jpeg';
  readonly scale: number;
  readonly quality: number;
}

/** Tried in order until one fits `maxBytes`; ordered by scale so captures are reused. */
export const PDF_PROFILES: readonly PdfProfile[] = [
  { format: 'png', scale: 3, quality: 1 },
  { format: 'jpeg', scale: 3, quality: 0.95 },
  { format: 'jpeg', scale: 2, quality: 0.92 },
  { format: 'jpeg', scale: 2, quality: 0.85 },
  { format: 'jpeg', scale: 1.5, quality: 0.8 },
];

export interface GenerateLetterPdfOptions {
  /** Stop at the first profile whose PDF is at most this size. Default: the 3 MiB email cap. */
  readonly maxBytes?: number;
  readonly profiles?: readonly PdfProfile[];
  readonly title?: string;
}

export interface LetterPdf {
  readonly blob: Blob;
  readonly bytes: number;
  readonly pageCount: number;
  /** bytes <= EMAIL_ATTACHMENT_MAX_BYTES. Larger PDFs are still valid downloads. */
  readonly emailable: boolean;
  /** bytes <= the requested maxBytes. False means the smallest attempt is returned. */
  readonly withinTarget: boolean;
  readonly profile: PdfProfile;
}

let rootCounter = 0;

function assertBrowser(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') throw new LetterRenderError('not-browser');
}

function createRoot(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'letter-document';
  rootCounter += 1;
  root.dataset['letterRenderRoot'] = String(rootCounter);
  root.setAttribute('aria-hidden', 'true');
  Object.assign(root.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '210mm',
    visibility: 'hidden',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  document.body.appendChild(root);
  return root;
}

function assertStylesheet(page: HTMLElement): void {
  if (Math.abs(page.offsetWidth - A4_WIDTH_PX) > 1) {
    throw new LetterRenderError('stylesheet-missing', `page width ${page.offsetWidth}px`);
  }
}

function shortSource(src: string): string {
  return src.length > 80 ? `${src.slice(0, 77)}...` : src;
}

async function decodeSource(src: string): Promise<void> {
  const image = new Image();
  image.src = src;
  await decodeImage(image);
}

async function decodeImage(image: HTMLImageElement): Promise<void> {
  try {
    await image.decode();
  } catch (error) {
    if (error instanceof DOMException) throw new LetterRenderError('asset-failed', shortSource(image.currentSrc || image.src));
    throw error;
  }
}

function backgroundUrls(element: Element): string[] {
  const value = getComputedStyle(element).backgroundImage;
  return Array.from(value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g), (match) => match[2] ?? '').filter(Boolean);
}

async function waitForAssets(root: HTMLElement): Promise<void> {
  await document.fonts.ready;
  const sources = new Set<string>();
  const images: HTMLImageElement[] = [];
  for (const image of Array.from(root.querySelectorAll('img'))) {
    if (!image.getAttribute('src')) throw new LetterRenderError('asset-failed', 'image without a source');
    images.push(image);
  }
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const url of backgroundUrls(element)) sources.add(url);
  }
  await Promise.all([...images.map(decodeImage), ...Array.from(sources, decodeSource)]);
}

function contentBoxHeight(page: HTMLElement): number {
  const style = getComputedStyle(page);
  return page.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
}

function fitsPage(target: HTMLElement, page: HTMLElement): boolean {
  return target.getBoundingClientRect().height <= contentBoxHeight(page) + FIT_TOLERANCE_PX;
}

function requireChild(parent: HTMLElement, selector: string): HTMLElement {
  const found = parent.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new TypeError(`Letter markup is missing ${selector}`);
  return found;
}

function clearShrink(target: HTMLElement): void {
  target.style.removeProperty('transform');
  target.style.removeProperty('transform-origin');
  target.style.removeProperty('width');
}

function shrinkToFit(target: HTMLElement, page: HTMLElement): boolean {
  clearShrink(target);
  const available = contentBoxHeight(page);
  let scale = 1;
  for (let attempt = 0; attempt < 4; attempt++) {
    const height = target.getBoundingClientRect().height;
    if (height <= available + FIT_TOLERANCE_PX) return true;
    scale = (scale * available) / height;
    if (scale < MIN_SHRINK) break;
    target.style.transformOrigin = 'top left';
    target.style.transform = `scale(${scale})`;
    target.style.width = `${100 / scale}%`;
  }
  clearShrink(target);
  return false;
}

const SPLITTABLE = new Set(['SECTION', 'UL', 'OL', 'TABLE']);
const TEXT_SPLITTABLE = new Set(['P', 'LI']);

interface Boundary {
  readonly node: Text;
  readonly offset: number;
}

function wordBoundaries(block: Element): Boundary[] {
  const boundaries: Boundary[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue;
    for (const match of node.data.matchAll(/\s+/g)) {
      if (match.index > 0 || boundaries.length > 0) boundaries.push({ node, offset: match.index });
    }
  }
  return boundaries;
}

function sliceBlock(block: Element, boundary: Boundary, side: 'head' | 'tail'): Element {
  const range = document.createRange();
  if (side === 'head') {
    range.setStart(block, 0);
    range.setEnd(boundary.node, boundary.offset);
  } else {
    range.setStart(boundary.node, boundary.offset);
    range.setEnd(block, block.childNodes.length);
  }
  const copy = block.cloneNode(false);
  if (!(copy instanceof Element)) throw new TypeError('Letter block clone is not an element');
  copy.appendChild(range.cloneContents());
  return copy;
}

function onlyElementChildren(element: Element): boolean {
  return Array.from(element.childNodes).every(
    (node) => node.nodeType === Node.ELEMENT_NODE || (node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim()),
  );
}

const domFlowOps = (
  fits: (blocks: readonly Element[], withSignature: boolean) => boolean,
): FlowOps<Element> => ({
  fits,
  parts(block) {
    if (!SPLITTABLE.has(block.tagName)) return null;
    if (block instanceof HTMLTableElement) {
      const body = block.tBodies[0];
      return body && block.tBodies.length === 1 ? Array.from(body.rows) : null;
    }
    return onlyElementChildren(block) ? Array.from(block.children) : null;
  },
  rebuild(block, parts) {
    const copy = block.cloneNode(false);
    if (!(copy instanceof Element)) throw new TypeError('Letter block clone is not an element');
    if (block instanceof HTMLTableElement) {
      const head = block.tHead;
      const body = block.tBodies[0];
      if (head) copy.appendChild(head.cloneNode(true));
      const bodyCopy = body ? body.cloneNode(false) : document.createElement('tbody');
      for (const part of parts) bodyCopy.appendChild(part.cloneNode(true));
      copy.appendChild(bodyCopy);
      return copy;
    }
    for (const part of parts) copy.appendChild(part.cloneNode(true));
    return copy;
  },
  splitInline(block, fitsWith) {
    if (!TEXT_SPLITTABLE.has(block.tagName)) return null;
    const boundaries = wordBoundaries(block);
    let low = 0;
    let high = boundaries.length - 1;
    let best: Boundary | null = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const boundary = boundaries[middle];
      if (boundary === undefined) break;
      if (fitsWith(sliceBlock(block, boundary, 'head'))) {
        best = boundary;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return best ? { head: sliceBlock(block, best, 'head'), tail: sliceBlock(block, best, 'tail') } : null;
  },
  isHeading(block) {
    if (/^H[1-6]$/.test(block.tagName)) return true;
    const only = block.children.length === 1 ? block.firstElementChild : null;
    return block.tagName === 'P' && only !== null && only.tagName === 'STRONG' && (block.textContent ?? '').trim() === (only.textContent ?? '').trim();
  },
});

interface FlowConfig {
  readonly minPages: number;
  readonly maxBlocksPerPage: readonly number[];
  readonly label: { readonly prefix: string; readonly className: string } | null;
}

function makeLabel(config: FlowConfig, text: string): HTMLElement | null {
  if (!config.label) return null;
  const label = document.createElement('div');
  label.className = config.label.className;
  label.textContent = `${config.label.prefix} | ${text}`;
  return label;
}

function flowPages(template: HTMLElement, root: HTMLElement, config: FlowConfig): HTMLElement[] {
  const content = requireChild(template, '.pagecontent');
  const body = requireChild(content, '.body');
  const signature = requireChild(content, 'table.sig');
  const blocks = Array.from(body.children);
  const placeholder = makeLabel(config, 'Page 00 of 00');

  const layout = (blocks: readonly Element[], withSignature: boolean, label: HTMLElement | null): void => {
    body.replaceChildren(...blocks.map((block) => block.cloneNode(true)), ...(label ? [label] : []));
    if (withSignature) content.appendChild(signature);
    else signature.remove();
  };
  const fits = (candidate: readonly Element[], withSignature: boolean): boolean => {
    layout(candidate, withSignature, placeholder);
    return fitsPage(content, template);
  };

  const plan = planFlowPages(blocks, domFlowOps(fits), config);
  if (!plan.ok) throw new LetterRenderError(plan.reason === 'block-too-large' ? 'content-too-large' : 'signature-too-large', `page ${plan.page + 1}`);

  const pages = plan.pages.map((chunk, index) => {
    const isLast = index === plan.pages.length - 1;
    layout(chunk, isLast, makeLabel(config, `Page ${index + 1} of ${plan.pages.length}`));
    const page = template.cloneNode(true);
    if (!(page instanceof HTMLElement)) throw new TypeError('Letter page clone is not an element');
    return page;
  });
  template.remove();
  for (const page of pages) root.appendChild(page);
  return pages;
}

function verifyPages(pages: readonly HTMLElement[]): void {
  pages.forEach((page, index) => {
    const target = page.querySelector<HTMLElement>('.pagecontent, .appt-body');
    if (!target) throw new TypeError('Letter page has no content element');
    if (!fitsPage(target, page)) throw new LetterRenderError('page-overflow', `page ${index + 1} is too tall`);
    if (target.scrollWidth > target.clientWidth + 1) {
      throw new LetterRenderError('page-overflow', `page ${index + 1} is too wide`);
    }
  });
}

/**
 * Render a letter into hidden A4 pages. Throws LetterRenderError when the
 * stylesheet is missing, an image fails, or content cannot fit without clipping.
 */
export async function renderLetter(data: LetterData, options: RenderLetterOptions = {}): Promise<RenderedLetter> {
  assertBrowser();
  const layout = LETTER_LAYOUTS[data.type];
  const root = createRoot();
  try {
    const template = document.createElement('div');
    template.className = layout.pageClass + (layout.kind === 'artwork' && options.vectorLetterhead ? ' letterhead-vector' : '');
    template.innerHTML = buildLetterHTML(data).trim();
    root.appendChild(template);
    assertStylesheet(template);
    await waitForAssets(root);

    let pages: HTMLElement[];
    switch (layout.kind) {
      case 'artwork':
        if (!shrinkToFit(requireChild(template, '.appt-body'), template)) throw new LetterRenderError('content-too-large', 'appointment letter is limited to one page');
        pages = [template];
        break;
      case 'letter':
        pages = shrinkToFit(requireChild(template, '.pagecontent'), template)
          ? [template]
          : flowPages(template, root, { minPages: 1, maxBlocksPerPage: [], label: null });
        break;
      case 'flow':
        pages = flowPages(template, root, layout);
        break;
    }
    await waitForAssets(root);
    verifyPages(pages);

    let disposed = false;
    return {
      data,
      pageCount: pages.length,
      pagesHtml: pages.map((page) => page.outerHTML).join(''),
      pages,
      dispose() {
        if (disposed) return;
        disposed = true;
        root.remove();
      },
    };
  } catch (error) {
    root.remove();
    throw error;
  }
}

interface PdfLibraries {
  readonly html2canvas: typeof import('html2canvas').default;
  readonly JsPdf: typeof import('jspdf').jsPDF;
}

async function loadPdfLibraries(): Promise<PdfLibraries> {
  const [canvasModule, pdfModule] = await Promise.all([import('html2canvas'), import('jspdf')]);
  return { html2canvas: canvasModule.default, JsPdf: pdfModule.jsPDF };
}

function renderRoot(page: HTMLElement): HTMLElement {
  const root = page.closest<HTMLElement>('[data-letter-render-root]');
  if (!root || !root.isConnected) throw new LetterRenderError('disposed');
  return root;
}

async function capturePage(libs: PdfLibraries, page: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  const root = renderRoot(page);
  const rootId = root.dataset['letterRenderRoot'] ?? '';
  const pageIndex = Array.from(root.children).indexOf(page);
  return libs.html2canvas(page, {
    scale,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    width: page.offsetWidth,
    height: page.offsetHeight,
    scrollX: 0,
    scrollY: 0,
    windowWidth: CAPTURE_WINDOW_WIDTH,
    windowHeight: Math.max(window.innerHeight, page.offsetHeight + 100),
    onclone(clonedDocument) {
      const clonedRoot = clonedDocument.querySelector<HTMLElement>(`[data-letter-render-root="${rootId}"]`);
      if (!clonedRoot) throw new LetterRenderError('disposed');
      Object.assign(clonedRoot.style, { position: 'absolute', left: '0', top: '0', visibility: 'visible' });
      Array.from(clonedRoot.querySelectorAll<HTMLElement>(':scope > .page')).forEach((child, index) => {
        if (index === pageIndex) child.style.margin = '0';
        else child.style.display = 'none';
      });
    },
  });
}

function releaseCanvases(canvases: readonly HTMLCanvasElement[]): void {
  for (const canvas of canvases) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function assemblePdf(libs: PdfLibraries, canvases: readonly HTMLCanvasElement[], profile: PdfProfile, title: string): Blob {
  const pdf = new libs.JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  pdf.setProperties({ title });
  canvases.forEach((canvas, index) => {
    if (index > 0) pdf.addPage('a4', 'portrait');
    const image = profile.format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', profile.quality);
    pdf.addImage(image, profile.format === 'png' ? 'PNG' : 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  });
  return pdf.output('blob');
}

/**
 * Rasterise the rendered pages into an A4 PDF, stepping down the quality
 * ladder until the file fits `maxBytes` (default: the 3 MiB email cap).
 */
export async function generateLetterPdf(rendered: RenderedLetter, options: GenerateLetterPdfOptions = {}): Promise<LetterPdf> {
  assertBrowser();
  const firstPage = rendered.pages[0];
  if (!firstPage) throw new LetterRenderError('disposed');
  const root = renderRoot(firstPage);
  const maxBytes = options.maxBytes ?? EMAIL_ATTACHMENT_MAX_BYTES;
  const profiles = options.profiles ?? PDF_PROFILES;
  const title = options.title ?? rendered.data.docnum;
  await waitForAssets(root);
  const libs = await loadPdfLibraries();

  let canvases: HTMLCanvasElement[] = [];
  let canvasScale = Number.NaN;
  let smallest: { readonly blob: Blob; readonly profile: PdfProfile } | null = null;
  try {
    for (const profile of profiles) {
      if (profile.scale !== canvasScale) {
        releaseCanvases(canvases);
        canvases = [];
        for (const page of rendered.pages) canvases.push(await capturePage(libs, page, profile.scale));
        canvasScale = profile.scale;
      }
      const blob = assemblePdf(libs, canvases, profile, title);
      if (!smallest || blob.size < smallest.blob.size) smallest = { blob, profile };
      if (blob.size <= maxBytes) break;
    }
  } finally {
    releaseCanvases(canvases);
  }
  if (!smallest) throw new RangeError('generateLetterPdf needs at least one PDF profile');
  return {
    blob: smallest.blob,
    bytes: smallest.blob.size,
    pageCount: rendered.pages.length,
    emailable: smallest.blob.size <= EMAIL_ATTACHMENT_MAX_BYTES,
    withinTarget: smallest.blob.size <= maxBytes,
    profile: smallest.profile,
  };
}
