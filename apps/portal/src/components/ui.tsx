import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { ApiProblem } from '../lib/errors.ts';
import { initials, isHttpsUrl, STATUS_LABEL } from '../lib/format.ts';
import { Link } from '../lib/router.tsx';
import type { PersonStatus } from '../lib/types.ts';
import { Icon, type IconName } from './icons.tsx';

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | 180DC Portal`;
  }, [title]);
}

interface PageHeaderProps {
  overline?: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ overline, title, lede, actions }: PageHeaderProps) {
  useTitle(title);
  return (
    <header className="page-header">
      <div className="page-header-text">
        {overline && <p className="overline">{overline}</p>}
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="cluster">{actions}</div>}
    </header>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="back-link">
      <Icon name="arrowLeft" size={16} />
      {children}
    </Link>
  );
}

interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

export function Card({ title, description, actions, flush, className, children }: CardProps) {
  const titleId = useId();
  return (
    <section className={cx('card', className)} aria-labelledby={title ? titleId : undefined}>
      <div className={cx('card-inner', flush && 'flush')}>
        {(title || actions) && (
          <div className="card-head">
            <div className="card-head-text">
              {title && <h2 id={titleId}>{title}</h2>}
              {description && <p>{description}</p>}
            </div>
            {actions && <div className="cluster">{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm';
  busy?: boolean;
  icon?: IconName;
}

export function Button({ variant = 'secondary', size, busy, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  );
}

interface FieldShellProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
}

function useFieldIds(hint: ReactNode, error: string | undefined) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return { id, hintId, errorId, describedBy };
}

function FieldFrame({
  ids,
  label,
  hint,
  error,
  optional,
  className,
  children,
}: FieldShellProps & { ids: ReturnType<typeof useFieldIds>; children: ReactNode }) {
  return (
    <div className={cx('field', className)}>
      <label className="label" htmlFor={ids.id}>
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </label>
      {children}
      {hint && (
        <p className="hint" id={ids.hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={ids.errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, hint, error, optional, className, ...input }: FieldShellProps & InputHTMLAttributes<HTMLInputElement>) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldFrame ids={ids} label={label} hint={hint} error={error} optional={optional} className={className}>
      <input id={ids.id} className="input" aria-invalid={error ? true : undefined} aria-describedby={ids.describedBy} {...input} />
    </FieldFrame>
  );
}

export function SearchField({ label, hint, error, optional, className, ...input }: FieldShellProps & InputHTMLAttributes<HTMLInputElement>) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldFrame ids={ids} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className="input-icon-wrap">
        <Icon name="search" size={18} />
        <input id={ids.id} type="search" className="input" aria-describedby={ids.describedBy} {...input} />
      </div>
    </FieldFrame>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  className,
  children,
  ...select
}: FieldShellProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldFrame ids={ids} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className="select-wrap">
        <select id={ids.id} className="select" aria-invalid={error ? true : undefined} aria-describedby={ids.describedBy} {...select}>
          {children}
        </select>
        <Icon name="chevronDown" size={16} className="select-chevron" />
      </div>
    </FieldFrame>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  optional,
  className,
  ...textarea
}: FieldShellProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ids = useFieldIds(hint, error);
  return (
    <FieldFrame ids={ids} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea id={ids.id} className="textarea" aria-invalid={error ? true : undefined} aria-describedby={ids.describedBy} {...textarea} />
    </FieldFrame>
  );
}

const STATUS_TONE: Record<PersonStatus, string> = {
  active: 'badge-success',
  invited: '',
  on_leave: 'badge-warning',
  alumni: '',
  removed: 'badge-error',
};

export function StatusBadge({ status }: { status: PersonStatus }) {
  return (
    <span className={cx('badge', STATUS_TONE[status])}>
      <span className={cx('badge-dot', status === 'invited' && 'hollow')} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

type AlertTone = 'error' | 'success' | 'warning' | 'info';

const ALERT_ICON: Record<AlertTone, IconName> = { error: 'alert', success: 'checkCircle', warning: 'alert', info: 'info' };

export function Alert({ tone, title, children, className }: { tone: AlertTone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('alert', `alert-${tone}`, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICON[tone]} size={20} />
      <div className="alert-body">
        {title && <p className="alert-title">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function ProblemAlert({ problem, fieldsShown = [] }: { problem: ApiProblem | null | undefined; fieldsShown?: readonly string[] }) {
  if (!problem) return null;
  const extra = Object.entries(problem.fields).filter(([field]) => !fieldsShown.includes(field));
  const allExtra = extra.length > 0 && extra.length === Object.keys(problem.fields).length;
  return (
    <Alert tone="error" title={allExtra ? 'Fix this and try again.' : problem.message}>
      {extra.length > 0 && (
        <ul>
          {extra.map(([field, message]) => (
            <li key={field}>{message}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

export function EmptyState({ icon = 'search', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ problem, onRetry, title = "Couldn't load this" }: { problem: ApiProblem; onRetry?: () => void; title?: string }) {
  return (
    <div className="empty" role="alert">
      <span className="empty-icon">
        <Icon name="alert" size={22} />
      </span>
      <h3>{title}</h3>
      <p>{problem.message}</p>
      {onRetry && problem.status !== 401 && problem.status !== 403 && problem.status !== 404 && (
        <Button onClick={onRetry} icon="history">
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14 }: { width?: number | string; height?: number }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

export function LoadingBlock({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="stack-sm" role="status" aria-label={label} style={{ padding: 'clamp(18px, 3vw, 28px)' }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} width={`${90 - ((i * 17) % 35)}%`} height={16} />
      ))}
    </div>
  );
}

export function Avatar({ name, photo, size = 40 }: { name: string; photo?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = isHttpsUrl(photo) && !failed;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {showPhoto ? <img src={photo ?? undefined} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
}

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="card">
          <div className="card-inner">
            <h2 id={titleId}>{title}</h2>
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  problem?: ApiProblem | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({ open, title, confirmLabel, tone = 'primary', busy, problem, onConfirm, onClose, children }: ConfirmDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={busy ? () => {} : onClose}>
      {children}
      <ProblemAlert problem={problem} />
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onClose} disabled={busy} autoFocus={tone === 'danger'}>
          Cancel
        </Button>
        <Button variant={tone} busy={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
