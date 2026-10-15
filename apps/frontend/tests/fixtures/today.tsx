import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TodaySection from '../../src/pages/members/TodaySection';
import '../../src/index.css';
import '../../src/pages/members/MembersLayout.css';
function Fixture() {
  const [token, setToken] = useState('synthetic-browser-a');
  const [panel, setPanel] = useState('');
  return <main style={{ padding: 16, maxWidth: 1000, margin: 'auto' }}>
    <button onClick={() => setToken('synthetic-browser-b')}>Switch synthetic account</button>
    <p role="status">{panel ? `Opened ${panel}` : ''}</p>
    <TodaySection authToken={token} onOpen={setPanel} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
