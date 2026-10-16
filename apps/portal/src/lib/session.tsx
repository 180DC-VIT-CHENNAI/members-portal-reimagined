import { createContext, useContext } from 'react';
import type { PermissionMap } from './access.ts';
import type { Me } from './types.ts';

export interface Session {
  me: Me;
  permissions: PermissionMap;
  can: (permission: string, departmentId?: string | null) => boolean;
  refresh: () => void;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

export const SessionProvider = SessionContext.Provider;

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside the signed-in app');
  return session;
}
