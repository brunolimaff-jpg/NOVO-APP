import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../../hooks/useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.className = '';
  });

  it('inicializa com isDarkMode=false quando localStorage está vazio', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDarkMode).toBe(false);
  });

  it('inicializa com isDarkMode=true quando localStorage tem "dark"', () => {
    localStorage.setItem('scout360_theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDarkMode).toBe(true);
  });

  it('toggleTheme alterna de false para true', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.isDarkMode).toBe(true);
  });

  it('toggleTheme alterna de true para false', () => {
    localStorage.setItem('scout360_theme', 'dark');
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.isDarkMode).toBe(false);
  });

  it('persiste preferência no localStorage ao alternar', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });
    expect(localStorage.getItem('scout360_theme')).toBe('dark');
  });

  it('persiste "light" no localStorage ao voltar para light', () => {
    localStorage.setItem('scout360_theme', 'dark');
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });
    expect(localStorage.getItem('scout360_theme')).toBe('light');
  });

  it('aplica classe "dark" no body quando isDarkMode=true', () => {
    localStorage.setItem('scout360_theme', 'dark');
    renderHook(() => useTheme());
    expect(document.body.className).toBe('dark');
  });

  it('aplica classe "light" no body quando isDarkMode=false', () => {
    renderHook(() => useTheme());
    expect(document.body.className).toBe('light');
  });

  it('setIsDarkMode permite definir tema diretamente', () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setIsDarkMode(true);
    });
    expect(result.current.isDarkMode).toBe(true);
  });
});
