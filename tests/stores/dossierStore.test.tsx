import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DossierStoreProvider, useDossierStore } from '../../stores/dossierStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DossierStoreProvider>{children}</DossierStoreProvider>
);

describe('DossierStoreProvider', () => {
  it('tracks export lifecycle and report payload through typed setters', () => {
    const { result } = renderHook(() => useDossierStore(), { wrapper });

    act(() => {
      result.current.setExportStatus('loading');
      result.current.setExportError('falha temporaria');
      result.current.setPdfReportContent('# Dossie');
    });

    expect(result.current.exportStatus).toBe('loading');
    expect(result.current.exportError).toBe('falha temporaria');
    expect(result.current.pdfReportContent).toBe('# Dossie');
  });

  it('updates remote save flags with functional state actions', () => {
    const { result } = renderHook(() => useDossierStore(), { wrapper });

    act(() => {
      result.current.setIsSavingRemote(true);
      result.current.setRemoteSaveStatus('success');
      result.current.setExportError(prev => (prev ? `${prev}!` : 'erro final'));
    });

    expect(result.current.isSavingRemote).toBe(true);
    expect(result.current.remoteSaveStatus).toBe('success');
    expect(result.current.exportError).toBe('erro final');
  });
});
