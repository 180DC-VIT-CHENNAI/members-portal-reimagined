import { Button, EmptyState, useTitle } from '../components/ui.tsx';
import { navigate } from '../lib/router.tsx';

export function NotFoundPage() {
  useTitle('Not found');
  return (
    <div className="page page-narrow">
      <EmptyState icon="info" title="This page doesn't exist" action={<Button onClick={() => navigate('/')}>Go home</Button>}>
        Check the link, or use the menu.
      </EmptyState>
    </div>
  );
}
