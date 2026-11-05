import type { BurndownResponse } from '../server/github/types.ts';

export interface BurndownGeometry {
  readonly width: number;
  readonly height: number;
  readonly plot: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
  readonly actual: string;
  readonly ideal: string | null;
  readonly yTicks: readonly { readonly value: number; readonly y: number }[];
  readonly xTicks: readonly { readonly date: string; readonly x: number }[];
  readonly last: { readonly x: number; readonly y: number };
}

const DAY_MS = 86_400_000;
const days = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const addDays = (date: string, offset: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
const fixed = (value: number): string => String(Math.round(value * 10) / 10);

/** Y-axis ceiling and tick values: every integer up to 5, else four equal steps of a whole number. */
export function yAxis(max: number): { readonly top: number; readonly ticks: readonly number[] } {
  if (max <= 5) return { top: Math.max(max, 1), ticks: Array.from({ length: Math.max(max, 1) + 1 }, (_, value) => value) };
  const step = Math.ceil(max / 4);
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((index) => index * step) };
}

/** Chart coordinates for a burndown with at least one point; the x axis runs to the due date when it is still ahead. */
export function burndownGeometry(data: Pick<BurndownResponse, 'milestone' | 'start' | 'end' | 'points'>, width = 640, height = 260): BurndownGeometry {
  const plot = { left: 40, right: width - 16, top: 12, bottom: height - 32 };
  const { dueOn } = data.milestone;
  const domainEnd = dueOn && dueOn > data.end ? dueOn : data.end;
  const span = days(data.start, domainEnd);
  const x = (date: string): number => (span === 0 ? (plot.left + plot.right) / 2 : plot.left + (days(data.start, date) / span) * (plot.right - plot.left));
  const axis = yAxis(Math.max(1, ...data.points.map((point) => point.open)));
  const y = (value: number): number => plot.bottom - (value / axis.top) * (plot.bottom - plot.top);

  const line = (coordinates: readonly (readonly [number, number])[]): string =>
    coordinates.map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${fixed(px)} ${fixed(py)}`).join(' ');
  const first = data.points[0];
  const lastPoint = data.points[data.points.length - 1];
  const ideal = dueOn && first && first.ideal !== null ? line([[x(first.date), y(first.ideal)], [x(dueOn), y(0)]]) : null;
  const xTicks = [...new Set([0, 1, 2, 3].map((index) => Math.round((span * index) / 3)))].map((offset) => {
    const date = addDays(data.start, offset);
    return { date, x: x(date) };
  });

  return {
    width,
    height,
    plot,
    actual: line(data.points.map((point) => [x(point.date), y(point.open)] as const)),
    ideal,
    yTicks: axis.ticks.map((value) => ({ value, y: y(value) })),
    xTicks,
    last: { x: x(lastPoint?.date ?? data.end), y: y(lastPoint?.open ?? 0) },
  };
}
