import { createContext, useContext } from 'react';
export type Route = { name: string; [k: string]: any };
export interface Nav { push: (r: Route) => void; pop: () => void; reset: (r: Route) => void; tick: number; bump: () => void }
export const NavCtx = createContext<Nav>(null as any);
export const useNav = () => useContext(NavCtx);
