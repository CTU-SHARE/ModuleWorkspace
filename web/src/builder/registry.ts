import type { ComponentType } from 'react';
import type { API } from '../useApi';
export type Row = Record<string, any>;
export type PanelProps = {
  api: API;
  app: Row;
  collection?: Row;
  fields: Row[];
  admin: boolean;
  role: string;
  user: string;
  refresh: () => void;
};
export const appPanels: {
  id: string;
  name: string;
  component: ComponentType<PanelProps>;
  adminOnly?: boolean;
}[] = [];
export const collectionPanels: typeof appPanels = [];
export const appTools: typeof appPanels = [];
