import { useEffect, useState } from 'react';
import { fetch } from 'void/client';

export function App() {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.status))
      .catch(() => setStatus('unreachable'));
  }, []);

  return (
    <main>
      <h1>180DC VIT Chennai portal</h1>
      <p>API: {status}</p>
    </main>
  );
}
