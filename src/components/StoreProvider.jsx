import React, { createContext, useContext, useEffect, useState } from 'react';
import { loadCatalog } from '../services/catalogService';
const StoreContext = createContext({ products: [], settings: null, loading: true, error: '' });
export const useStore = () => useContext(StoreContext);
export default function StoreProvider({ children }) {
  const [state, setState] = useState({ products: [], settings: null, loading: true, error: '' });
  const refresh = async () => {
    try { const result = await loadCatalog(); setState({ ...result, loading: false, error: '' }); }
    catch (error) { setState(prev => ({ ...prev, settings: prev.settings ? {...prev.settings,sales_enabled:false} : null, loading: false, error: error.message })); }
  };
  useEffect(() => { refresh(); }, []);
  return <StoreContext.Provider value={{ ...state, refresh }}>{children}</StoreContext.Provider>;
}
