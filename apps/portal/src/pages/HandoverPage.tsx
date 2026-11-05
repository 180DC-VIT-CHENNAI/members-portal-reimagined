import { ErrorState, LoadingBlock, PageHeader, useTitle } from '../components/ui.tsx';
import { api, useLoad } from '../lib/api.ts';
import { HandoverCard } from './admin/HandoverCard.tsx';

export function HandoverPage() {
  useTitle('Board handover');
  const terms = useLoad(() => api('/api/terms'), []);
  return (
    <div className="page">
      <PageHeader title="Board handover" lede="Your continuity checklist for the incoming board. Owners mark their own items done." />
      {terms.problem ? <ErrorState problem={terms.problem} onRetry={terms.reload} /> :
        !terms.data ? <LoadingBlock /> : terms.data.length > 0 ? <HandoverCard terms={terms.data} /> : <p>No terms yet.</p>}
    </div>
  );
}
