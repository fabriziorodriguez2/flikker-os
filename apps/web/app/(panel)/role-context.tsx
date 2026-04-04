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
