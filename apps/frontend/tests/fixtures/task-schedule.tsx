import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProjectTasksSection from '../../src/pages/members/ProjectTasksSection';
import '../../src/index.css';
import '../../src/pages/members/MembersLayout.css';
function Fixture() {
  const [token, setToken] = useState('synthetic-browser-a');
  return <main style={{ padding: 16 }}><button onClick={() => setToken("synthetic-browser-b")}>Switch synthetic account</button><ProjectTasksSection authToken={token} projectId="project-1" projectStatus="active" canManageTasks={!new URLSearchParams(location.search).has('member')} isBoard={false} assignees={[{ id: "member-1", name: "Synthetic member" }, { id: "member-2", name: "Synthetic new owner" }]} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
