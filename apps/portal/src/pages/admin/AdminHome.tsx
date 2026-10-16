import { Icon } from '../../components/icons.tsx';
import { EmptyState, PageHeader } from '../../components/ui.tsx';
import { visibleAdminTools } from '../../lib/access.ts';
import { Link } from '../../lib/router.tsx';
import { useSession } from '../../lib/session.tsx';

export function AdminHome() {
  const { permissions } = useSession();
  const tools = visibleAdminTools(permissions);
  return (
    <div className="page">
      <PageHeader overline="Admin" title="Manage the club" lede="Tools you have permission to use." />
      {tools.length === 0 ? (
        <EmptyState icon="shield" title="No admin tools">
          Your access role doesn't include any admin permissions.
        </EmptyState>
      ) : (
        <div className="tool-grid">
          {tools.map((tool) => (
            <Link key={tool.path} to={tool.path} className="tool-card">
              <span className="tool-icon">
                <Icon name={tool.icon} size={22} />
              </span>
              <h2>{tool.label}</h2>
              <p>{tool.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
