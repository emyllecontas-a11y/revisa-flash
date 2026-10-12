// src/contexts/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'escuro' | 'claro';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Aplica as classes no <html> e no <body>, nos dois formatos usados pelo app.
// - .light / .dark → usado pelo CSS (modo-claro.css)
// - .tema-claro / .tema-escuro → usado por estilos legados
function aplicarTema(tema: Theme) {
  const root = document.documentElement;
  const body = document.body;

  root.classList.remove('light', 'dark', 'tema-claro', 'tema-escuro');
  body.classList.remove('tema-claro', 'tema-escuro');

  if (tema === 'claro') {
    root.classList.add('light', 'tema-claro');
    body.classList.add('tema-claro');
  } else {
    root.classList.add('dark', 'tema-escuro');
    body.classList.add('tema-escuro');
  }
}

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('escuro');

  // Na primeira montagem, lê a preferência salva.
  // Aceita tanto 'tema' (padrão atual do app) quanto 'theme' (chave antiga),
  // para não perder a escolha de quem já usou a versão anterior.
  useEffect(() => {
    const salvo = localStorage.getItem('tema') || localStorage.getItem('theme');

    if (salvo === 'claro' || salvo === 'light') {
      setTheme('claro');
      return;
    }
    if (salvo === 'escuro' || salvo === 'dark') {
      setTheme('escuro');
      return;
    }

    // Nada salvo: segue a preferência do sistema operacional
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('claro');
    } else {
      setTheme('escuro');
    }
  }, []);

  // Sempre que o tema mudar, aplica as classes e salva.
  // Salva nas DUAS chaves para ficar compatível com o `configuracoes.tsx`
  // (que lê 'tema') e com versões antigas que possam ler 'theme'.
  useEffect(() => {
    aplicarTema(theme);
    localStorage.setItem('tema', theme);
    localStorage.setItem('theme', theme === 'claro' ? 'light' : 'dark');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'escuro' ? 'claro' : 'escuro'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  }
  return context;
};