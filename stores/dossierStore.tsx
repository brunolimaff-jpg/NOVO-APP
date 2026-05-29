import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

export type ExportStatus = 'idle' | 'loading' | 'success' | 'error';
export type RemoteSaveStatus = 'idle' | 'success' | 'error';

interface DossierStoreState {
  exportStatus: ExportStatus;
  exportError: string | null;
  pdfReportContent: string | null;
  isSavingRemote: boolean;
  remoteSaveStatus: RemoteSaveStatus;
}

type DossierStoreAction =
  | { type: 'set_export_status'; payload: SetStateAction<ExportStatus> }
  | { type: 'set_export_error'; payload: SetStateAction<string | null> }
  | { type: 'set_pdf_report_content'; payload: SetStateAction<string | null> }
  | { type: 'set_is_saving_remote'; payload: SetStateAction<boolean> }
  | { type: 'set_remote_save_status'; payload: SetStateAction<RemoteSaveStatus> };

export interface DossierStoreValue extends DossierStoreState {
  setExportStatus: Dispatch<SetStateAction<ExportStatus>>;
  setExportError: Dispatch<SetStateAction<string | null>>;
  setPdfReportContent: Dispatch<SetStateAction<string | null>>;
  setIsSavingRemote: Dispatch<SetStateAction<boolean>>;
  setRemoteSaveStatus: Dispatch<SetStateAction<RemoteSaveStatus>>;
}

const initialState: DossierStoreState = {
  exportStatus: 'idle',
  exportError: null,
  pdfReportContent: null,
  isSavingRemote: false,
  remoteSaveStatus: 'idle',
};

const DossierStoreContext = createContext<DossierStoreValue | null>(null);

function dossierStoreReducer(state: DossierStoreState, action: DossierStoreAction): DossierStoreState {
  switch (action.type) {
    case 'set_export_status':
      return { ...state, exportStatus: applyStateUpdate(state.exportStatus, action.payload) };
    case 'set_export_error':
      return { ...state, exportError: applyStateUpdate(state.exportError, action.payload) };
    case 'set_pdf_report_content':
      return { ...state, pdfReportContent: applyStateUpdate(state.pdfReportContent, action.payload) };
    case 'set_is_saving_remote':
      return { ...state, isSavingRemote: applyStateUpdate(state.isSavingRemote, action.payload) };
    case 'set_remote_save_status':
      return { ...state, remoteSaveStatus: applyStateUpdate(state.remoteSaveStatus, action.payload) };
    default:
      return state;
  }
}

function applyStateUpdate<T>(current: T, next: SetStateAction<T>): T {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function DossierStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(dossierStoreReducer, initialState);

  const setExportStatus = useCallback<Dispatch<SetStateAction<ExportStatus>>>(next => {
    dispatch({ type: 'set_export_status', payload: next });
  }, []);

  const setExportError = useCallback<Dispatch<SetStateAction<string | null>>>(next => {
    dispatch({ type: 'set_export_error', payload: next });
  }, []);

  const setPdfReportContent = useCallback<Dispatch<SetStateAction<string | null>>>(next => {
    dispatch({ type: 'set_pdf_report_content', payload: next });
  }, []);

  const setIsSavingRemote = useCallback<Dispatch<SetStateAction<boolean>>>(next => {
    dispatch({ type: 'set_is_saving_remote', payload: next });
  }, []);

  const setRemoteSaveStatus = useCallback<Dispatch<SetStateAction<RemoteSaveStatus>>>(next => {
    dispatch({ type: 'set_remote_save_status', payload: next });
  }, []);

  const value = useMemo<DossierStoreValue>(
    () => ({
      ...state,
      setExportStatus,
      setExportError,
      setPdfReportContent,
      setIsSavingRemote,
      setRemoteSaveStatus,
    }),
    [setExportError, setExportStatus, setIsSavingRemote, setPdfReportContent, setRemoteSaveStatus, state],
  );

  return <DossierStoreContext.Provider value={value}>{children}</DossierStoreContext.Provider>;
}

export function useDossierStore() {
  const context = useContext(DossierStoreContext);
  if (!context) {
    throw new Error('useDossierStore must be used within a DossierStoreProvider');
  }

  return context;
}

export function useMaybeDossierStore() {
  return useContext(DossierStoreContext);
}
