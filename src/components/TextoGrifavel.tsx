// src/components/TextoGrifavel.tsx
//
// Envolve um bloco de texto e permite grifar trechos com o mouse ou o dedo.
// Os grifos são reposicionados dinamicamente procurando o texto grifado no bloco —
// assim funcionam em qualquer tamanho de tela (celular, notebook) e se ajustam
// automaticamente ao redimensionar.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  CORES_GRIFO,
  type AnotacaoQuestao,
  type CorGrifo,
  type RectGrifo,
} from '@/lib/anotacoes-types';
import { Trash2 } from 'lucide-react';

interface Props {
  grifos: AnotacaoQuestao[];
  ativo?: boolean;
  onGrifar: (cor: CorGrifo, texto: string, rects: RectGrifo[]) => void;
  onRemover?: (id: string) => void;
  onTrocarCor?: (id: string, cor: CorGrifo) => void;
  children: ReactNode;
}

interface SelecaoState {
  texto: string;
  rects: RectGrifo[];
  x: number;
  y: number;
  preferBelow: boolean;
}

interface GrifoSelecionado {
  id: string;
  x: number;
  y: number;
}

/* ============================================================
 * Utilitários — Range a partir de offsets, rects a partir de Range
 * ============================================================ */

/** Cria um Range do DOM a partir de offsets no texto puro do wrapper. */
function criarRangePorOffset(wrapper: HTMLElement, inicio: number, fim: number): Range | null {
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
  let count = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (!startNode && count + len > inicio) {
      startNode = node;
      startOffset = inicio - count;
    }
    if (!endNode && count + len >= fim) {
      endNode = node;
      endOffset = fim - count;
      break;
    }
    count += len;
    node = walker.nextNode() as Text | null;
  }

  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  } catch {
    return null;
  }
}

/** Converte um Range em rects relativos ao wrapper (0..1). */
function rangeParaRects(range: Range, wrapper: HTMLElement): RectGrifo[] {
  const rectWrapper = wrapper.getBoundingClientRect();
  const rects: RectGrifo[] = [];
  const clientRects = Array.from(range.getClientRects());
  for (const r of clientRects) {
    if (r.width < 1 || r.height < 1) continue;
    const x1 = (r.left - rectWrapper.left) / rectWrapper.width;
    const y1 = (r.top - rectWrapper.top) / rectWrapper.height;
    const x2 = (r.right - rectWrapper.left) / rectWrapper.width;
    const y2 = (r.bottom - rectWrapper.top) / rectWrapper.height;
    if (x1 < -0.01 || y1 < -0.01 || x2 > 1.01 || y2 > 1.01) continue;
    rects.push({ x1, y1, x2, y2 });
  }
  return rects;
}

/* ============================================================
 * Componente
 * ============================================================ */

export function TextoGrifavel({
  grifos,
  ativo = true,
  onGrifar,
  onRemover,
  onTrocarCor,
  children,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [selecao, setSelecao] = useState<SelecaoState | null>(null);
  const [selecionado, setSelecionado] = useState<GrifoSelecionado | null>(null);
  const [posicoes, setPosicoes] = useState<Map<string, RectGrifo[]>>(new Map());

  // ============================================================
  // Recalcula posições sempre que o layout mudar
  // ============================================================
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const recalcular = () => {
      const w = wrapperRef.current;
      if (!w) return;
      const textoPuro = w.textContent || '';
      const novo = new Map<string, RectGrifo[]>();

      for (const g of grifos) {
        if (!g.texto_snippet) {
          if (g.rects?.length) novo.set(g.id, g.rects);
          continue;
        }
        const idx = textoPuro.indexOf(g.texto_snippet);
        if (idx < 0) {
          // Texto sumiu (raro) — usa os rects antigos como fallback
          if (g.rects?.length) novo.set(g.id, g.rects);
          continue;
        }
        const fim = idx + g.texto_snippet.length;
        const range = criarRangePorOffset(w, idx, fim);
        if (!range) {
          if (g.rects?.length) novo.set(g.id, g.rects);
          continue;
        }
        const rects = rangeParaRects(range, w);
        novo.set(g.id, rects.length > 0 ? rects : (g.rects ?? []));
      }

      setPosicoes(novo);
    };

    recalcular();

    const ro = new ResizeObserver(() => recalcular());
    ro.observe(wrapper);
    window.addEventListener('resize', recalcular);
    // Recalcula também quando a orientação do celular muda
    window.addEventListener('orientationchange', recalcular);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recalcular);
      window.removeEventListener('orientationchange', recalcular);
    };
  }, [grifos, children]);

  // ============================================================
  // Seleção (mouse ou dedo via selectionchange)
  // ============================================================
  useEffect(() => {
    if (!ativo) return;

    const handler = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setSelecao(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const texto = sel.toString().trim();
        if (!texto || texto.length < 2) {
          setSelecao(null);
          return;
        }

        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const common = range.commonAncestorContainer;
        if (!wrapper.contains(common)) {
          setSelecao(null);
          return;
        }

        const rects = rangeParaRects(range, wrapper);
        if (rects.length === 0) {
          setSelecao(null);
          return;
        }

        const firstRect = range.getClientRects()[0];
        const lastRect = range.getClientRects()[range.getClientRects().length - 1];
        const preferBelow = firstRect.top < 100;

        let toolbarX = firstRect.left + firstRect.width / 2;
        const margin = 160;
        if (toolbarX < margin) toolbarX = margin;
        if (toolbarX > window.innerWidth - margin) toolbarX = window.innerWidth - margin;

        const toolbarY = preferBelow ? lastRect.bottom + 8 : firstRect.top - 8;

        setSelecao({ texto, rects, x: toolbarX, y: toolbarY, preferBelow });
      }, 20);
    };

    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [ativo]);

  // ============================================================
  // Fechar toolbars ao clicar fora
  // ============================================================
  useEffect(() => {
    if (!selecao && !selecionado) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.tg-toolbar')) return;
      setSelecao(null);
      setSelecionado(null);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [selecao, selecionado]);

  // ============================================================
  // Handlers
  // ============================================================
  const handleGrifar = useCallback(
    (cor: CorGrifo) => {
      if (!selecao) return;
      onGrifar(cor, selecao.texto, selecao.rects);
      window.getSelection()?.removeAllRanges();
      setSelecao(null);
    },
    [selecao, onGrifar]
  );

  const handleClickGrifo = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      setSelecao(null);
      setSelecionado({ id, x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleRemover = useCallback(() => {
    if (!selecionado || !onRemover) return;
    onRemover(selecionado.id);
    setSelecionado(null);
  }, [selecionado, onRemover]);

  const handleTrocarCor = useCallback(
    (cor: CorGrifo) => {
      if (!selecionado || !onTrocarCor) return;
      onTrocarCor(selecionado.id, cor);
      setSelecionado(null);
    },
    [selecionado, onTrocarCor]
  );

  return (
    <>
      <div ref={wrapperRef} className="relative" style={{ position: 'relative' }}>
        {children}

        {/* Grifos (posições recalculadas a cada render) */}
        {grifos.map((g) => {
          const rects = posicoes.get(g.id) ?? g.rects ?? [];
          return rects.map((r, i) => (
            <div
              key={`${g.id}-${i}`}
              className="tg-grifo"
              onMouseDown={(e) => handleClickGrifo(e, g.id)}
              style={{
                position: 'absolute',
                left: `${r.x1 * 100}%`,
                top: `${r.y1 * 100}%`,
                width: `${(r.x2 - r.x1) * 100}%`,
                height: `${(r.y2 - r.y1) * 100}%`,
                backgroundColor: CORES_GRIFO[g.cor]?.bg || CORES_GRIFO.yellow.bg,
                mixBlendMode: 'multiply',
                pointerEvents: 'auto',
                cursor: 'pointer',
                borderRadius: 2,
                zIndex: 3,
              }}
            />
          ));
        })}
      </div>

      {/* Toolbar de grifar (aparece ao selecionar texto) */}
      {selecao && createPortal(
        <div
          className="tg-toolbar"
          style={{
            position: 'fixed',
            left: selecao.x,
            top: selecao.y,
            transform: selecao.preferBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            zIndex: 10000,
            maxWidth: 'calc(100vw - 16px)',
          }}
        >
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 shadow-2xl">
            {Object.entries(CORES_GRIFO).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleGrifar(key as CorGrifo)}
                className="grid h-6 w-6 place-items-center rounded-full border-2 border-white/30 transition-transform hover:scale-110 active:scale-95"
                style={{ backgroundColor: cfg.dot }}
                title={cfg.label}
              />
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Toolbar de grifo clicado (trocar cor / remover) */}
      {selecionado && createPortal(
        <div
          className="tg-toolbar"
          style={{
            position: 'fixed',
            left: selecionado.x,
            top: selecionado.y,
            transform: 'translate(-50%, 12px)',
            zIndex: 10001,
            maxWidth: 'calc(100vw - 16px)',
          }}
        >
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 shadow-2xl">
            {onTrocarCor && Object.entries(CORES_GRIFO).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleTrocarCor(key as CorGrifo)}
                className="grid h-6 w-6 place-items-center rounded-full border-2 border-white/30 transition-transform hover:scale-110"
                style={{ backgroundColor: cfg.dot }}
                title={`Trocar para ${cfg.label}`}
              />
            ))}
            {onRemover && (
              <>
                <div className="mx-1 h-5 w-px bg-border" />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleRemover}
                  className="grid h-6 w-6 place-items-center rounded-full text-destructive hover:bg-destructive/10 transition-colors"
                  title="Remover grifo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}