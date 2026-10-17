import { Icon, type IconName } from '../components/icons.tsx';
import { Card, PageHeader } from '../components/ui.tsx';
import { Link } from '../lib/router.tsx';

export interface MoreItem {
  to: string;
  label: string;
  icon: IconName;
}

/** On phones: the sections that don't fit in the tab bar. */
export function MorePage({ items }: { items: readonly MoreItem[] }) {
  return (
    <div className="page page-narrow">
      <PageHeader title="More" />
      <Card flush>
        <ul className="more-list">
          {items.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="more-link">
                <Icon name={item.icon} size={20} />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
