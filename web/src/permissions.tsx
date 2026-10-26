import {createContext,useContext,useCallback,type ReactNode} from 'react';
const PermissionContext=createContext<string[]|null>(null);
export function PermissionProvider({permissions,children}:{permissions:string[]|null;children:ReactNode}) {
  return <PermissionContext.Provider value={permissions}>{children}</PermissionContext.Provider>;
}
export function useCan(){
  const permissions=useContext(PermissionContext);
  return useCallback((permission:string)=>permissions===null||permissions.includes(permission),[permissions]);
}
