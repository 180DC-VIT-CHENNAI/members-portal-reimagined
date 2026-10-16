import { EmptyState, useTitle } from '../../components/ui.tsx';

export function Forbidden({ title }: { title: string }) {
  useTitle(title);
  return (
    <div className="page page-narrow">
      <EmptyState icon="shield" title="You don't have access to this">
        Ask someone who manages access in your club to grant it.
      </EmptyState>
    </div>
  );
}
