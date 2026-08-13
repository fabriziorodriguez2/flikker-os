'use client';

import { createContext, useContext } from 'react';

interface RoleContextValue {
  role: string | null;
}

const RoleContext = createContext<RoleContextValue>({ role: null });

export function RoleProvider({
  role,
  children,
}: {
  role: string | null;
  children: React.ReactNode;
}) {
  return (
    <RoleContext.Provider value={{ role }}>{children}</RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}

/** Returns true if the user can mutate (create/edit/delete). VIEWER cannot. */
export function useCanMutate() {
  const { role } = useRole();
  return role !== null && role !== 'VIEWER';
}

/**
 * Espeja `@Roles(OWNER, ADMIN)` del backend, que es más restrictivo que
 * `useCanMutate` (ésa deja pasar a OPERATOR). Sirve para no mostrar controles
 * que la API va a rechazar: OPERATOR entra a mirar y descargar, no a
 * administrar. El backend sigue siendo la autoridad — esto es solo UI.
 */
export function useIsOwnerOrAdmin() {
  const { role } = useRole();
  return role === 'OWNER' || role === 'ADMIN';
}
