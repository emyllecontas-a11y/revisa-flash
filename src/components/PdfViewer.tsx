// src/components/PdfViewer.tsx
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Search, X, Trash2, Highlighter, StickyNote, Pencil, Check, Plus, BookOpen, Minimize2, Copy, Strikethrough, Underline, Square, Move } from 'lucide-react';
import { getDb } from '@/lib/db';
import { enqueueOperation } from '@/services/queueService';
import { uid } from '@/utils/helpers';
import { ensureCached, getPdfBlob } from '@/services/pdfCache';
import { useAppUser } from '@/contexts/UserContext';

import '@/lib/pdfWorker';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

interface PdfViewerProps {
  url: string;
  fileId?: string;
}

type ZoomMode = 'manual' | 'fit-width';

interface HighlightRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface PdfHighlight {
  id: string;
  user_id: string;
  file_id: string;
  page_number: number;
  text_snippet: string;
  color: string;
  rects: HighlightRect[];
  created_at: string;
  updated_at: string;
  isDeleted?: boolean;
}

interface PdfNote {
  id: string;
  user_id: string;
  file_id: string;
  page_number: number;
  highlight_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  isDeleted?: boolean;
}

interface PdfTextBox {
  id: string;
  user_id: string;
  file_id: string;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  color: string;
  created_at: string;
  updated_at: string;
  isDeleted?: boolean;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const CORES_GRIFO: Record<string, { bg: string; label: string; dot: string }> = {
  yellow: { bg: 'rgba(255, 235, 59, 0.55)', label: 'Amarelo', dot: '#FFEB3B' },
  green:  { bg: 'rgba(139, 195, 74, 0.55)', label: 'Verde',   dot: '#8BC34A' },
  pink:   { bg: 'rgba(244, 143, 177, 0.55)', label: 'Rosa',   dot: '#F48FB1' },
  blue:   { bg: 'rgba(100, 181, 246, 0.55)', label: 'Azul',   dot: '#64B5F6' },
  red:    { bg: 'rgba(244, 67, 54, 0.45)',  label: 'Vermelho', dot: '#EF5350' },
};

const CORES_CAIXA: Record<string, {
  bg: string;
  border: string;
  label: string;
  dot: string;
  pattern: 'lines' | 'grid' | 'plain';
  lineColor: string;
}> = {
  yellow: {
    bg: '#FFF3A8',
    border: '#E8C400',
    label: 'Amarelo',
    dot: '#FFEB3B',
    pattern: 'lines',
    lineColor: 'rgba(180, 140, 0, 0.20)',
  },
  green: {
    bg: '#D4E8C1',
    border: '#7CB342',
    label: 'Verde',
    dot: '#8BC34A',
    pattern: 'grid',
    lineColor: 'rgba(70, 120, 40, 0.18)',
  },
  pink: {
    bg: '#FBD5DD',
    border: '#EC407A',
    label: 'Rosa',
    dot: '#F48FB1',
    pattern: 'lines',
    lineColor: 'rgba(200, 60, 100, 0.22)',
  },
  blue: {
    bg: '#CFE7FA',
    border: '#42A5F5',
    label: 'Azul',
    dot: '#64B5F6',
    pattern: 'lines',
    lineColor: 'rgba(40, 100, 170, 0.20)',
  },
  red: {
    bg: '#FCE4EC',
    border: '#EF5350',
    label: 'Vermelho',
    dot: '#EF5350',
    pattern: 'lines',
    lineColor: 'rgba(180, 50, 50, 0.18)',
  },
};

const COR_RISCADO = '#E53935';
const COR_SUBLINHADO = '#1976D2';

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getLastPageKey(fileId: string) {
  return `pdf_last_page_${fileId}`;
}

type MarkType = 'highlight' | 'strike' | 'underline';
function getMarkType(color: string): MarkType {
  if (color === 'strike') return 'strike';
  if (color === 'underline') return 'underline';
  return 'highlight';
}

function isTypingInField(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function PdfViewer({ url, fileId }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputPage, setInputPage] = useState<string>('1');

  const [readingMode, setReadingMode] = useState(false);
  const readingOverlayRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState<number>(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [buscaAberta, setBuscaAberta] = useState(false);
  const [buscaTexto, setBuscaTexto] = useState('');
  const [termoAtivo, setTermoAtivo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultadosBusca, setResultadosBusca] = useState<number[]>([]);
  const [indiceBusca, setIndiceBusca] = useState(0);
  const [buscaErro, setBuscaErro] = useState<string | null>(null);

  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [selection, setSelection] = useState<{
    text: string;
    rects: HighlightRect[];
    pageNumber: number;
    toolbarX: number;
    toolbarY: number;
    preferBelow: boolean;
  } | null>(null);
  const [clickedHighlight, setClickedHighlight] = useState<{ id: string; x: number; y: number; preferBelow: boolean } | null>(null);
  const [hoveredHighlight, setHoveredHighlight] = useState<{ id: string; x: number; y: number } | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [notes, setNotes] = useState<PdfNote[]>([]);
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<{ id: string; content: string } | null>(null);
  const [notePopover, setNotePopover] = useState<{
    mode: 'from-selection' | 'page-note';
    x: number;
    y: number;
    preferBelow: boolean;
    selection?: { text: string; rects: HighlightRect[]; pageNumber: number };
    color: string;
    content: string;
  } | null>(null);
  const [inlineNewNote, setInlineNewNote] = useState<{ highlightId: string; content: string } | null>(null);

  const [textBoxes, setTextBoxes] = useState<PdfTextBox[]>([]);
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [draggingBox, setDraggingBox] = useState<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [resizingBox, setResizingBox] = useState<{
    id: string;
    startX: number;
    startY: number;
    origWidth: number;
    origHeight: number;
  } | null>(null);
  const [colorPickerBoxId, setColorPickerBoxId] = useState<string | null>(null);
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);

  const { userId } = useAppUser();

  // ============================================================
  // Cache offline do PDF (blob)
  // ============================================================
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) {
      setResolvedUrl(url);
      return;
    }

    let cancelled = false;
    let blobUrl: string | null = null;

    (async () => {
      const cached = await getPdfBlob(fileId);
      if (cancelled) return;

      if (cached) {
        blobUrl = URL.createObjectURL(cached);
        setResolvedUrl(blobUrl);
        console.log('[PdfViewer] Usando PDF do cache local (offline disponível).');
        return;
      }

      setResolvedUrl(url);

      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      if (isOnline) {
        ensureCached(fileId, url, fileId).catch(() => { /* já logado dentro */ });
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [fileId, url]);

  const mostrarToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 1500);
  }, []);

  useEffect(() => {
    if (!readingMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReadingMode(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [readingMode]);

  useEffect(() => {
    if (!readingMode) return;
    const overlay = readingOverlayRef.current;
    if (!overlay) return;

    const toHide: { el: HTMLElement; originalDisplay: string }[] = [];
    const walkTree = (node: HTMLElement) => {
      if (node === overlay) return;
      if (node.contains(overlay)) {
        Array.from(node.children).forEach((child) => walkTree(child as HTMLElement));
      } else {
        toHide.push({ el: node, originalDisplay: node.style.display || '' });
      }
    };
    Array.from(document.body.children).forEach((child) => walkTree(child as HTMLElement));
    toHide.forEach(({ el }) => { el.style.display = 'none'; });

    const originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      toHide.forEach(({ el, originalDisplay }) => { el.style.display = originalDisplay; });
      document.body.style.overflow = originalBodyOverflow;
    };
  }, [readingMode]);

  useEffect(() => {
    if (readingMode && readingOverlayRef.current) {
      readingOverlayRef.current.scrollTop = 0;
    }
  }, [readingMode]);

  useEffect(() => {
    if (!readingMode) return;
    const overlay = readingOverlayRef.current;
    if (!overlay) return;

    const propsToNeutralize = [
      'transform', 'filter', 'perspective', 'will-change',
      'contain', 'container-type', 'backdrop-filter',
      'clip-path', 'mask', 'mask-image', 'contain-intrinsic-size',
      'animation', 'animation-name',
    ];

    const overrides: { el: HTMLElement; prop: string; original: string; originalPriority: string }[] = [];

    const overlayOriginalStyles = {
      position: overlay.style.position,
      top: overlay.style.top,
      left: overlay.style.left,
      right: overlay.style.right,
      bottom: overlay.style.bottom,
      width: overlay.style.width,
      height: overlay.style.height,
      margin: overlay.style.margin,
    };
    overlay.style.setProperty('position', 'fixed', 'important');
    overlay.style.setProperty('top', '0', 'important');
    overlay.style.setProperty('left', '0', 'important');
    overlay.style.setProperty('right', '0', 'important');
    overlay.style.setProperty('bottom', '0', 'important');
    overlay.style.setProperty('width', '100vw', 'important');
    overlay.style.setProperty('height', '100vh', 'important');
    overlay.style.setProperty('margin', '0', 'important');

    let node: HTMLElement | null = overlay.parentElement;
    while (node) {
      const computed = window.getComputedStyle(node);
      for (const prop of propsToNeutralize) {
        const val = computed.getPropertyValue(prop).trim();
        if (!val || val === 'none' || val === 'auto' || val === 'normal') continue;
        overrides.push({
          el: node,
          prop,
          original: node.style.getPropertyValue(prop),
          originalPriority: node.style.getPropertyPriority(prop),
        });
        const neutral = (prop === 'will-change' || prop === 'contain' || prop === 'container-type' || prop === 'contain-intrinsic-size')
          ? 'auto'
          : 'none';
        node.style.setProperty(prop, neutral, 'important');
      }
      if (node === document.documentElement) break;
      node = node.parentElement;
    }

    return () => {
      const overlayKeys: (keyof typeof overlayOriginalStyles)[] = [
        'position', 'top', 'left', 'right', 'bottom', 'width', 'height', 'margin',
      ];
      overlayKeys.forEach((key) => {
        const original = overlayOriginalStyles[key];
        if (!original) overlay.style.removeProperty(key);
        else overlay.style.setProperty(key, original);
      });
      overrides.forEach(({ el, prop, original, originalPriority }) => {
        if (original) el.style.setProperty(prop, original, originalPriority);
        else el.style.removeProperty(prop);
      });
    };
  }, [readingMode]);

  const restoredRef = useRef(false);
  useEffect(() => { restoredRef.current = false; }, [fileId]);

  useEffect(() => {
    if (!fileId || numPages === 0 || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const saved = localStorage.getItem(getLastPageKey(fileId));
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= 1 && n <= numPages) {
          setPageNumber(n);
          setInputPage(String(n));
        }
      }
    } catch { /* ignore */ }
  }, [fileId, numPages]);

  useEffect(() => {
    if (!fileId || numPages === 0) return;
    try {
      localStorage.setItem(getLastPageKey(fileId), String(pageNumber));
    } catch { /* ignore */ }
  }, [fileId, pageNumber, numPages]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const updateWidth = () => {
      const w = el.clientWidth;
      setContainerWidth(Math.max(200, w - 16));
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!fileId || !userId) return;
    let mounted = true;
    (async () => {
      try {
        const db = await getDb();
        const col = db.collections.pdf_highlights;
        if (!col) return;
        const docs = await col.find({
          selector: { file_id: fileId, user_id: userId, isDeleted: { $ne: true } },
        }).exec();
        if (mounted) setHighlights(docs.map((d: any) => d.toJSON() as PdfHighlight));
      } catch (e) { console.warn('[Grifos] Erro ao carregar:', e); }
    })();
    return () => { mounted = false; };
  }, [fileId, userId]);

  useEffect(() => {
    if (!fileId || !userId) return;
    let mounted = true;
    (async () => {
      try {
        const db = await getDb();
        const col = db.collections.pdf_notes;
        if (!col) return;
        const docs = await col.find({
          selector: { file_id: fileId, user_id: userId, isDeleted: { $ne: true } },
        }).exec();
        if (mounted) setNotes(docs.map((d: any) => d.toJSON() as PdfNote));
      } catch (e) { console.warn('[Notas] Erro ao carregar:', e); }
    })();
    return () => { mounted = false; };
  }, [fileId, userId]);

  useEffect(() => {
    if (!fileId || !userId) return;
    let mounted = true;
    (async () => {
      try {
        const db = await getDb();
        const col = db.collections.pdf_text_boxes;
        if (!col) return;
        const docs = await col.find({
          selector: { file_id: fileId, user_id: userId, isDeleted: { $ne: true } },
        }).exec();
        if (mounted) setTextBoxes(docs.map((d: any) => d.toJSON() as PdfTextBox));
      } catch (e) { console.warn('[Caixas] Erro ao carregar:', e); }
    })();
    return () => { mounted = false; };
  }, [fileId, userId]);

  useEffect(() => {
    setSelection(null);
    setClickedHighlight(null);
    setHoveredHighlight(null);
    setNotePopover(null);
    setInlineNewNote(null);
    setEditingBoxId(null);
    setColorPickerBoxId(null);
  }, [pageNumber]);

  const extrairRectsDaSelecao = useCallback((
    range: Range,
    pageEl: HTMLElement
  ): HighlightRect[] => {
    const pageRect = pageEl.getBoundingClientRect();
    const rects: HighlightRect[] = [];
    const clientRects = Array.from(range.getClientRects());
    for (const r of clientRects) {
      if (r.width < 1 || r.height < 1) continue;
      const x1 = (r.left - pageRect.left) / pageRect.width;
      const y1 = (r.top - pageRect.top) / pageRect.height;
      const x2 = (r.right - pageRect.left) / pageRect.width;
      const y2 = (r.bottom - pageRect.top) / pageRect.height;
      if (x1 < -0.01 || y1 < -0.01 || x2 > 1.01 || y2 > 1.01) continue;
      rects.push({ x1, y1, x2, y2 });
    }
    return rects;
  }, []);

  const aplicarMarcacao = useCallback(async (
    text: string,
    rects: HighlightRect[],
    pageNum: number,
    cor: string
  ) => {
    if (!fileId || !userId) return;
    try {
      const now = new Date().toISOString();
      const novo: PdfHighlight = {
        id: uid(),
        user_id: userId,
        file_id: fileId,
        page_number: pageNum,
        text_snippet: text.slice(0, 500),
        color: cor,
        rects,
        created_at: now,
        updated_at: now,
        isDeleted: false,
      };
      const db = await getDb();
      await db.collections.pdf_highlights.insert(novo);
      setHighlights(prev => [...prev, novo]);
      await enqueueOperation('create', 'pdf_highlights', novo);
    } catch (e) {
      console.error('[Marcação] Erro ao salvar:', e);
    }
  }, [fileId, userId]);

  useEffect(() => {
    const handler = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setSelection(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const text = sel.toString().trim();
        if (!text || text.length < 2) { setSelection(null); return; }

        let node: Node | null = range.commonAncestorContainer;
        let pageEl: HTMLElement | null = null;
        while (node) {
          if (node instanceof HTMLElement && node.classList?.contains('react-pdf__Page')) {
            pageEl = node;
            break;
          }
          node = node.parentNode;
        }
        if (!pageEl) { setSelection(null); return; }

        const rects = extrairRectsDaSelecao(range, pageEl);
        if (rects.length === 0) { setSelection(null); return; }

        const firstRect = range.getClientRects()[0];
        const lastRect = range.getClientRects()[range.getClientRects().length - 1];
        const preferBelow = firstRect.top < 100;

        let toolbarX = firstRect.left + firstRect.width / 2;
        const margin = 220;
        if (toolbarX < margin) toolbarX = margin;
        if (toolbarX > window.innerWidth - margin) toolbarX = window.innerWidth - margin;

        const toolbarY = preferBelow ? lastRect.bottom + 8 : firstRect.top - 8;

        setSelection({
          text,
          rects,
          pageNumber,
          toolbarX,
          toolbarY,
          preferBelow,
        });
      }, 30);
    };

    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [pageNumber, extrairRectsDaSelecao]);

  const handleCopiar = useCallback(async () => {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.text);
      mostrarToast('✓ Texto copiado');
    } catch (e) { console.warn('[Copiar] Erro:', e); }
  }, [selection, mostrarToast]);

  const handleAplicarGrifo = useCallback(async (cor: string) => {
    if (!selection) return;
    await aplicarMarcacao(selection.text, selection.rects, selection.pageNumber, cor);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, [selection, aplicarMarcacao]);

  const handleRemoverGrifo = useCallback(async (id: string) => {
    try {
      const now = new Date().toISOString();
      const db = await getDb();
      const doc = await db.collections.pdf_highlights.findOne({ selector: { id } }).exec();
      if (doc) await doc.patch({ isDeleted: true, updated_at: now });
      setHighlights(prev => prev.filter(h => h.id !== id));
      setClickedHighlight(null);
      setHoveredHighlight(null);
      await enqueueOperation('update', 'pdf_highlights', { id, isDeleted: true, updated_at: now });
    } catch (e) { console.error('[Grifos] Erro ao remover:', e); }
  }, []);

  const handleTrocarCor = useCallback(async (id: string, cor: string) => {
    try {
      const now = new Date().toISOString();
      const db = await getDb();
      const doc = await db.collections.pdf_highlights.findOne({ selector: { id } }).exec();
      if (doc) await doc.patch({ color: cor, updated_at: now });
      setHighlights(prev => prev.map(h => h.id === id ? { ...h, color: cor, updated_at: now } : h));
      setClickedHighlight(null);
      await enqueueOperation('update', 'pdf_highlights', { id, color: cor, updated_at: now });
    } catch (e) { console.error('[Grifos] Erro ao trocar cor:', e); }
  }, []);

  const handleAdicionarCaixa = useCallback(async () => {
    if (!fileId || !userId) return;
    try {
      const now = new Date().toISOString();
      const nova: PdfTextBox = {
        id: uid(),
        user_id: userId,
        file_id: fileId,
        page_number: pageNumber,
        x: 0.15,
        y: 0.2,
        width: 0.3,
        height: 0.18,
        content: '',
        color: 'yellow',
        created_at: now,
        updated_at: now,
        isDeleted: false,
      };
      const db = await getDb();
      await db.collections.pdf_text_boxes.insert(nova);
      setTextBoxes(prev => [...prev, nova]);
      await enqueueOperation('create', 'pdf_text_boxes', nova);
      setEditingBoxId(nova.id);
    } catch (e) { console.error('[Caixas] Erro ao criar:', e); }
  }, [fileId, userId, pageNumber]);

  const handleAtualizarCaixa = useCallback(async (
    id: string,
    patch: Partial<PdfTextBox>,
    debounce: boolean = false
  ) => {
    try {
      const now = new Date().toISOString();
      const db = await getDb();
      const doc = await db.collections.pdf_text_boxes.findOne({ selector: { id } }).exec();
      if (doc) await doc.patch({ ...patch, updated_at: now });
      setTextBoxes(prev => prev.map(b => b.id === id ? { ...b, ...patch, updated_at: now } : b));

      if (!debounce) {
        await enqueueOperation('update', 'pdf_text_boxes', { id, ...patch, updated_at: now });
      }
    } catch (e) { console.error('[Caixas] Erro ao atualizar:', e); }
  }, []);

  const handleRemoverCaixa = useCallback(async (id: string) => {
    try {
      const now = new Date().toISOString();
      const db = await getDb();
      const doc = await db.collections.pdf_text_boxes.findOne({ selector: { id } }).exec();
      if (doc) await doc.patch({ isDeleted: true, updated_at: now });
      setTextBoxes(prev => prev.filter(b => b.id !== id));
      setEditingBoxId(null);
      setColorPickerBoxId(null);
      await enqueueOperation('update', 'pdf_text_boxes', { id, isDeleted: true, updated_at: now });
      mostrarToast('✓ Caixa removida');
    } catch (e) { console.error('[Caixas] Erro ao remover:', e); }
  }, [mostrarToast]);

  const handleBoxDragStart = useCallback((e: React.MouseEvent, box: PdfTextBox) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('textarea')) return;

    e.preventDefault();
    e.stopPropagation();

    const pageEl = containerRef.current?.querySelector('.react-pdf__Page') as HTMLElement | null;
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();

    setDraggingBox({
      id: box.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: box.x,
      origY: box.y,
    });
    (window as any).__pdfDragRect = { width: rect.width, height: rect.height };
  }, []);

  const handleBoxResizeStart = useCallback((e: React.MouseEvent, box: PdfTextBox) => {
    e.preventDefault();
    e.stopPropagation();

    const pageEl = containerRef.current?.querySelector('.react-pdf__Page') as HTMLElement | null;
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();

    setResizingBox({
      id: box.id,
      startX: e.clientX,
      startY: e.clientY,
      origWidth: box.width,
      origHeight: box.height || 0.18,
    });
    (window as any).__pdfResizeRect = { width: rect.width, height: rect.height };
  }, []);

  useEffect(() => {
    if (!draggingBox && !resizingBox) return;

    const handleMove = (e: MouseEvent) => {
      if (draggingBox) {
        const rect = (window as any).__pdfDragRect;
        if (!rect) return;
        const dx = (e.clientX - draggingBox.startX) / rect.width;
        const dy = (e.clientY - draggingBox.startY) / rect.height;
        const novoX = Math.max(0, Math.min(1 - 0.05, draggingBox.origX + dx));
        const novoY = Math.max(0, Math.min(1 - 0.05, draggingBox.origY + dy));
        setTextBoxes(prev => prev.map(b => b.id === draggingBox.id ? { ...b, x: novoX, y: novoY } : b));
      }
      if (resizingBox) {
        const rect = (window as any).__pdfResizeRect;
        if (!rect) return;
        const dx = (e.clientX - resizingBox.startX) / rect.width;
        const dy = (e.clientY - resizingBox.startY) / rect.height;
        const novoWidth = Math.max(0.1, Math.min(0.9, resizingBox.origWidth + dx));
        const novoHeight = Math.max(0.06, Math.min(0.9, resizingBox.origHeight + dy));
        setTextBoxes(prev => prev.map(b =>
          b.id === resizingBox.id ? { ...b, width: novoWidth, height: novoHeight } : b
        ));
      }
    };

    const handleUp = async () => {
      if (draggingBox) {
        const b = textBoxes.find(x => x.id === draggingBox.id);
        if (b) await handleAtualizarCaixa(b.id, { x: b.x, y: b.y });
        setDraggingBox(null);
      }
      if (resizingBox) {
        const b = textBoxes.find(x => x.id === resizingBox.id);
        if (b) await handleAtualizarCaixa(b.id, { width: b.width, height: b.height });
        setResizingBox(null);
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingBox, resizingBox, textBoxes, handleAtualizarCaixa]);

  const handleAbrirAnotacao = useCallback(() => {
    if (!selection) return;
    setNotePopover({
      mode: 'from-selection',
      x: selection.toolbarX,
      y: selection.toolbarY,
      preferBelow: selection.preferBelow,
      selection: { text: selection.text, rects: selection.rects, pageNumber: selection.pageNumber },
      color: 'yellow',
      content: '',
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [selection]);

  const handleAbrirNotaPagina = useCallback(() => {
    setNotePopover({
      mode: 'page-note',
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      preferBelow: true,
      color: 'yellow',
      content: '',
    });
  }, []);

  const handleSalvarNota = useCallback(async () => {
    if (!notePopover || !fileId || !userId) return;
    const content = notePopover.content.trim();
    if (!content) return;

    try {
      const now = new Date().toISOString();
      let highlightId: string | null = null;
      let pageNum = pageNumber;

      if (notePopover.mode === 'from-selection' && notePopover.selection) {
        const novoHighlight: PdfHighlight = {
          id: uid(),
          user_id: userId,
          file_id: fileId,
          page_number: notePopover.selection.pageNumber,
          text_snippet: notePopover.selection.text.slice(0, 500),
          color: notePopover.color,
          rects: notePopover.selection.rects,
          created_at: now,
          updated_at: now,
          isDeleted: false,
        };
        const db = await getDb();
        await db.collections.pdf_highlights.insert(novoHighlight);
        setHighlights(prev => [...prev, novoHighlight]);
        await enqueueOperation('create', 'pdf_highlights', novoHighlight);
        highlightId = novoHighlight.id;
        pageNum = notePopover.selection.pageNumber;
      }

      const novaNota: PdfNote = {
        id: uid(),
        user_id: userId,
        file_id: fileId,
        page_number: pageNum,
        highlight_id: highlightId,
        content,
        created_at: now,
        updated_at: now,
        isDeleted: false,
      };
      const db = await getDb();
      await db.collections.pdf_notes.insert(novaNota);
      setNotes(prev => [...prev, novaNota]);
      await enqueueOperation('create', 'pdf_notes', novaNota);

      setNotePopover(null);
    } catch (e) { console.error('[Notas] Erro ao salvar:', e); }
  }, [notePopover, fileId, userId, pageNumber]);

  const handleSalvarInlineNote = useCallback(async () => {
    if (!inlineNewNote || !fileId || !userId) return;
    const content = inlineNewNote.content.trim();
    if (!content) return;
    try {
      const now = new Date().toISOString();
      const novaNota: PdfNote = {
        id: uid(),
        user_id: userId,
        file_id: fileId,
        page_number: pageNumber,
        highlight_id: inlineNewNote.highlightId,
        content,
        created_at: now,
        updated_at: now,
        isDeleted: false,
      };
      const db = await getDb();
      await db.collections.pdf_notes.insert(novaNota);
      setNotes(prev => [...prev, novaNota]);
      await enqueueOperation('create', 'pdf_notes', novaNota);
      setInlineNewNote(null);
    } catch (e) { console.error('[Notas] Erro ao salvar inline:', e); }
  }, [inlineNewNote, fileId, userId, pageNumber]);

  const handleRemoverNota = useCallback(async (id: string) => {
    try {
      const now = new Date().toISOString();
      const db = await getDb();
      const doc = await db.collections.pdf_notes.findOne({ selector: { id } }).exec();
      if (doc) await doc.patch({ isDeleted: true, updated_at: now });
      setNotes(prev => prev.filter(n => n.id !== id));
      await enqueueOperation('update', 'pdf_notes', { id, isDeleted: true, updated_at: now });
    } catch (e) { console.error('[Notas] Erro ao remover:', e); }
  }, []);

  const handleSalvarEdicaoNota = useCallback(async () => {
    if (!editingNote) return;
    const content = editingNote.content.trim();
    if (!content) return;
    try {
      const now = new Date().toISOString();
      const db = await getDb();
      const doc = await db.collections.pdf_notes.findOne({ selector: { id: editingNote.id } }).exec();
      if (doc) await doc.patch({ content, updated_at: now });
      setNotes(prev => prev.map(n => n.id === editingNote.id ? { ...n, content, updated_at: now } : n));
      await enqueueOperation('update', 'pdf_notes', { id: editingNote.id, content, updated_at: now });
      setEditingNote(null);
    } catch (e) { console.error('[Notas] Erro ao editar:', e); }
  }, [editingNote]);

  const handlePageMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (clickedHighlight) setClickedHighlight(null);
    if (inlineNewNote) setInlineNewNote(null);
    if (colorPickerBoxId) setColorPickerBoxId(null);

    const target = e.target as HTMLElement;
    if (target.closest('.pdf-text-box')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const highlightsDaPagina = highlights.filter(h => h.page_number === pageNumber && !h.isDeleted);
    const clicked = highlightsDaPagina.find(h =>
      h.rects.some(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2)
    );

    if (clicked) {
      e.preventDefault();
      e.stopPropagation();
      window.getSelection()?.removeAllRanges();
      const preferBelow = e.clientY < 100;
      setClickedHighlight({ id: clicked.id, x: e.clientX, y: e.clientY, preferBelow });
      setHoveredHighlight(null);
    }
  }, [clickedHighlight, highlights, pageNumber, inlineNewNote, colorPickerBoxId]);

  const handlePageMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      if (hoveredHighlight) setHoveredHighlight(null);
      return;
    }
    if (clickedHighlight || notePopover || draggingBox || resizingBox) {
      if (hoveredHighlight) setHoveredHighlight(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const highlightsDaPagina = highlights.filter(h => h.page_number === pageNumber && !h.isDeleted);
    const found = highlightsDaPagina.find(h =>
      h.rects.some(r => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2)
    );

    if (found) {
      const hasNote = notes.some(n => n.highlight_id === found.id && !n.isDeleted);
      if (hasNote) setHoveredHighlight({ id: found.id, x: e.clientX, y: e.clientY });
      else if (hoveredHighlight) setHoveredHighlight(null);
    } else if (hoveredHighlight) {
      setHoveredHighlight(null);
    }
  }, [highlights, notes, pageNumber, hoveredHighlight, clickedHighlight, notePopover, draggingBox, resizingBox]);

  const handlePageMouseLeave = useCallback(() => { setHoveredHighlight(null); }, []);

  useEffect(() => {
    if (!clickedHighlight) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.pdf-highlight-popover')) return;
      setClickedHighlight(null);
      setInlineNewNote(null);
      setEditingNote(null);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [clickedHighlight]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoadError(null);
    setResultadosBusca([]);
    setIndiceBusca(0);
  }
  function onDocumentLoadError(error: Error) {
    console.error('Erro ao carregar PDF:', error);
    setLoadError('Não foi possível carregar este PDF.');
  }
  function irParaPagina(n: number) {
    if (!numPages) return;
    const clamped = Math.max(1, Math.min(numPages, n));
    setPageNumber(clamped);
    setInputPage(String(clamped));
  }
  function paginaAnterior() { irParaPagina(pageNumber - 1); }
  function proximaPagina() { irParaPagina(pageNumber + 1); }
  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const n = parseInt(inputPage, 10);
      if (!isNaN(n)) irParaPagina(n);
      else setInputPage(String(pageNumber));
    }
  }
  function handleInputBlur() { setInputPage(String(pageNumber)); }
  function aumentarZoom() {
    setZoomMode('manual');
    setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  }
  function diminuirZoom() {
    setZoomMode('manual');
    setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  }
  function ajustarLargura() { setZoomMode('fit-width'); }

  async function buscarNoPdf() {
    const termo = buscaTexto.trim();
    if (!termo) { setBuscaErro('Digite algo para buscar.'); return; }
    setBuscando(true);
    setBuscaErro(null);
    setResultadosBusca([]);
    setIndiceBusca(0);
    setTermoAtivo('');

    try {
      const response = await fetch(resolvedUrl || url);
      if (!response.ok) throw new Error(`Falha ao baixar PDF: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const paginasEncontradas: number[] = [];
      const termoLower = termo.toLowerCase();
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const textoPagina = textContent.items
          .map((it: any) => (typeof it.str === 'string' ? it.str : ''))
          .join(' ')
          .toLowerCase();
        if (textoPagina.includes(termoLower)) paginasEncontradas.push(p);
      }
      if (paginasEncontradas.length === 0) {
        setBuscaErro(`Nenhum resultado para "${termo}".`);
      } else {
        setResultadosBusca(paginasEncontradas);
        setIndiceBusca(0);
        setTermoAtivo(termo);
        irParaPagina(paginasEncontradas[0]);
      }
    } catch (err: any) {
      const msg = err?.message || String(err) || 'Erro desconhecido';
      setBuscaErro(`Erro: ${msg.slice(0, 80)}`);
    } finally {
      setBuscando(false);
    }
  }

  function irParaResultadoAnterior() {
    if (resultadosBusca.length === 0) return;
    const novoIdx = (indiceBusca - 1 + resultadosBusca.length) % resultadosBusca.length;
    setIndiceBusca(novoIdx);
    irParaPagina(resultadosBusca[novoIdx]);
  }
  function irParaProximoResultado() {
    if (resultadosBusca.length === 0) return;
    const novoIdx = (indiceBusca + 1) % resultadosBusca.length;
    setIndiceBusca(novoIdx);
    irParaPagina(resultadosBusca[novoIdx]);
  }
  function fecharBusca() {
    setBuscaAberta(false);
    setBuscaTexto('');
    setTermoAtivo('');
    setResultadosBusca([]);
    setBuscaErro(null);
    setIndiceBusca(0);
  }

  useEffect(() => {
    if (numPages === 0) return;

    const handler = (e: KeyboardEvent) => {
      if (isTypingInField()) return;

      const cmdOrCtrl = e.ctrlKey || e.metaKey;

      if (!cmdOrCtrl && e.key === 'ArrowLeft') {
        e.preventDefault();
        irParaPagina(pageNumber - 1);
        return;
      }
      if (!cmdOrCtrl && e.key === 'ArrowRight') {
        e.preventDefault();
        irParaPagina(pageNumber + 1);
        return;
      }
      if (!cmdOrCtrl && e.key === 'Home') {
        e.preventDefault();
        irParaPagina(1);
        return;
      }
      if (!cmdOrCtrl && e.key === 'End') {
        e.preventDefault();
        irParaPagina(numPages);
        return;
      }

      if (cmdOrCtrl && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setBuscaAberta(true);
        setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>(
            'input[placeholder="Buscar palavra ou expressão…"]'
          );
          if (input) input.focus();
        }, 50);
        return;
      }

      if (cmdOrCtrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoomMode('manual');
        setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
        return;
      }
      if (cmdOrCtrl && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        setZoomMode('manual');
        setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
        return;
      }
      if (cmdOrCtrl && e.key === '0') {
        e.preventDefault();
        setZoomMode('fit-width');
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [numPages, pageNumber]);

  const customTextRenderer = useCallback(
    ({ str }: { str: string }) => {
      if (!termoAtivo) return str;
      const termoLower = termoAtivo.toLowerCase();
      if (!str.toLowerCase().includes(termoLower)) return str;
      const termoEscapado = escapeRegex(termoAtivo);
      const regex = new RegExp(`(${termoEscapado})`, 'gi');
      const textoEscapado = escapeHtml(str);
      return textoEscapado.replace(regex, '<mark class="pdf-search-highlight">$1</mark>');
    },
    [termoAtivo]
  );

  const larguraPagina = useMemo(() => {
    if (zoomMode === 'fit-width') return containerWidth > 0 ? containerWidth : undefined;
    return undefined;
  }, [zoomMode, containerWidth]);
  const zoomAplicado = zoomMode === 'fit-width' ? 1 : zoom;

  const highlightsDaPagina = useMemo(
    () => highlights.filter(h => h.page_number === pageNumber && !h.isDeleted),
    [highlights, pageNumber]
  );
  const notesDaPagina = useMemo(
    () => notes.filter(n => n.page_number === pageNumber && !n.isDeleted),
    [notes, pageNumber]
  );
  const textBoxesDaPagina = useMemo(
    () => textBoxes.filter(b => b.page_number === pageNumber && !b.isDeleted),
    [textBoxes, pageNumber]
  );
  const totalNotas = notes.filter(n => !n.isDeleted).length;
  const totalCaixas = textBoxes.filter(b => !b.isDeleted).length;

  const corDaNota = (n: PdfNote): string => {
    if (!n.highlight_id) return 'transparent';
    const h = highlights.find(x => x.id === n.highlight_id);
    if (!h) return 'transparent';
    const type = getMarkType(h.color);
    if (type === 'strike') return COR_RISCADO;
    if (type === 'underline') return COR_SUBLINHADO;
    return CORES_GRIFO[h.color]?.dot || CORES_GRIFO.yellow.dot;
  };

  const hoveredNote = useMemo(() => {
    if (!hoveredHighlight) return null;
    return notes.find(n => n.highlight_id === hoveredHighlight.id && !n.isDeleted) || null;
  }, [hoveredHighlight, notes]);

  const clickedNote = useMemo(() => {
    if (!clickedHighlight) return null;
    return notes.find(n => n.highlight_id === clickedHighlight.id && !n.isDeleted) || null;
  }, [clickedHighlight, notes]);

  return (
    <div
      ref={readingMode ? readingOverlayRef : undefined}
      className={
        readingMode
          ? "fixed inset-0 z-[9999] overflow-y-auto bg-neutral-900 flex flex-col gap-3 sm:gap-4 p-2 sm:p-4"
          : "flex flex-col gap-3 sm:gap-4"
      }
    >
      <style>{`
        .react-pdf__Page { position: relative; }
        .react-pdf__Page__canvas { display: block; user-select: none; }

        .react-pdf__Page__textContent {
          position: absolute !important;
          inset: 0;
          overflow: hidden;
          opacity: 1 !important;
          line-height: 1 !important;
          pointer-events: auto !important;
          user-select: text !important;
          -webkit-user-select: text !important;
          z-index: 2;
        }

        .react-pdf__Page__textContent > span,
        .react-pdf__Page__textContent > br {
          color: transparent !important;
          background: transparent !important;
          position: absolute;
          white-space: pre;
          cursor: text !important;
          transform-origin: 0% 0%;
          user-select: text !important;
          -webkit-user-select: text !important;
          pointer-events: auto !important;
        }

        .react-pdf__Page__textContent span::selection {
          background: rgba(0, 100, 255, 0.4) !important;
          color: transparent !important;
        }

        .pdf-search-highlight {
          background-color: rgba(255, 210, 60, 0.75) !important;
          color: transparent !important;
          border-radius: 2px;
        }
      `}</style>

      {numPages > 0 && (
        <div
          className={[
            "sticky top-0 z-20 flex flex-col gap-2 rounded-xl border px-2 py-2 sm:px-3 shadow-lg backdrop-blur-sm",
            readingMode
              ? "border-white/10 bg-neutral-800/95"
              : "border-border bg-surface/95",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={paginaAnterior}
              disabled={pageNumber <= 1}
              className="grid h-10 w-10 sm:h-8 sm:w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Página anterior (←)"
            >
              <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>

            <div className="flex items-center gap-1.5 text-base sm:text-sm text-white/80">
              <input
                type="text"
                inputMode="numeric"
                value={inputPage}
                onChange={(e) => setInputPage(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                className="w-16 sm:w-14 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 sm:py-1 text-center text-base sm:text-sm text-white outline-none focus:border-primary tabular-nums"
                aria-label="Número da página"
              />
              <span className="text-white/50">de</span>
              <span className="font-medium tabular-nums">{numPages}</span>
              {notesDaPagina.length > 0 && (
                <span
                  className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
                  title={`${notesDaPagina.length} nota(s) nesta página`}
                >
                  <StickyNote className="h-2.5 w-2.5" />
                  {notesDaPagina.length}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={proximaPagina}
              disabled={pageNumber >= numPages}
              className="grid h-10 w-10 sm:h-8 sm:w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Próxima página (→)"
            >
              <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>

            <div className="hidden sm:block mx-1 h-5 w-px bg-white/10" />

            <button
              type="button"
              onClick={diminuirZoom}
              disabled={zoomMode === 'manual' && zoom <= ZOOM_MIN}
              className="grid h-10 w-10 sm:h-8 sm:w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Diminuir zoom (Ctrl -)"
            >
              <ZoomOut className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
            <span className="min-w-[3.5rem] text-center text-xs font-medium text-white/70 tabular-nums">
              {zoomMode === 'fit-width' ? 'Largura' : `${Math.round(zoom * 100)}%`}
            </span>
            <button
              type="button"
              onClick={aumentarZoom}
              disabled={zoomMode === 'manual' && zoom >= ZOOM_MAX}
              className="grid h-10 w-10 sm:h-8 sm:w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Aumentar zoom (Ctrl +)"
            >
              <ZoomIn className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
            <button
              type="button"
              onClick={ajustarLargura}
              className={[
                "grid h-10 w-10 sm:h-8 sm:w-8 place-items-center rounded-full border transition-colors",
                zoomMode === 'fit-width'
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
              ].join(" ")}
              title="Ajustar à largura (Ctrl 0)"
            >
              <Maximize2 className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>

            <div className="hidden sm:block mx-1 h-5 w-px bg-white/10" />

            <button
              type="button"
              onClick={() => setBuscaAberta((v) => !v)}
              className={[
                "grid h-10 w-10 sm:h-8 sm:w-8 place-items-center rounded-full border transition-colors",
                buscaAberta
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
              ].join(" ")}
              title="Buscar no PDF (Ctrl F)"
            >
              <Search className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>

            {fileId && (
              <button
                type="button"
                onClick={handleAdicionarCaixa}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 h-10 sm:h-8 text-xs font-medium text-white/70 hover:bg-white/10 transition-colors"
                title="Adicionar caixa de texto"
              >
                <Square className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span className="hidden xs:inline">Caixa</span>
              </button>
            )}

            {fileId && (
              <button
                type="button"
                onClick={handleAbrirNotaPagina}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 h-10 sm:h-8 text-xs font-medium text-white/70 hover:bg-white/10 transition-colors"
                title="Adicionar nota a esta página"
              >
                <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span className="hidden xs:inline">Nota</span>
              </button>
            )}

            {fileId && (
              <button
                type="button"
                onClick={() => setNotesDrawerOpen((v) => !v)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-3 h-10 sm:h-8 text-xs font-medium transition-colors",
                  notesDrawerOpen
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                ].join(" ")}
                title="Ver todas as notas"
              >
                <StickyNote className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                {totalNotas > 0 ? `Notas (${totalNotas})` : 'Notas'}
              </button>
            )}

            {fileId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 h-10 sm:h-8 text-[11px] font-medium text-primary" title={`${highlights.filter(h => !h.isDeleted).length} grifos e ${totalCaixas} caixas`}>
                <Highlighter className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                {highlights.filter(h => !h.isDeleted).length}
                {totalCaixas > 0 && <> · {totalCaixas}□</>}
              </span>
            )}

            <button
              type="button"
              onClick={() => setReadingMode((v) => !v)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 h-10 sm:h-8 text-xs font-medium transition-colors",
                readingMode
                  ? "border-primary/60 bg-primary/20 text-primary hover:bg-primary/30"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
              ].join(" ")}
              title={readingMode ? "Sair do modo leitura (Esc)" : "Modo leitura"}
            >
              {readingMode ? (
                <>
                  <Minimize2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  <span>Sair</span>
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden xs:inline">Leitura</span>
                </>
              )}
            </button>
          </div>

          {buscaAberta && (
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-2">
              <input
                type="text"
                placeholder="Buscar palavra ou expressão…"
                value={buscaTexto}
                onChange={(e) => setBuscaTexto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarNoPdf()}
                className="flex-1 min-w-[150px] sm:flex-none sm:w-64 rounded-lg border border-white/10 bg-white/5 px-3 py-2 sm:py-1.5 text-base sm:text-sm text-white outline-none focus:border-primary placeholder:text-white/40"
              />
              <button
                type="button"
                onClick={buscarNoPdf}
                disabled={buscando}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 h-9 sm:h-8 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {buscando ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…</>
                ) : (
                  <>Buscar</>
                )}
              </button>

              {resultadosBusca.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-white/70">
                  <button
                    type="button"
                    onClick={irParaResultadoAnterior}
                    className="grid h-8 w-8 sm:h-6 sm:w-6 place-items-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
                    title="Resultado anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="tabular-nums">
                    {indiceBusca + 1} de {resultadosBusca.length}
                  </span>
                  <button
                    type="button"
                    onClick={irParaProximoResultado}
                    className="grid h-8 w-8 sm:h-6 sm:w-6 place-items-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
                    title="Próximo resultado"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {buscaErro && <span className="text-xs text-destructive">{buscaErro}</span>}

              <button
                type="button"
                onClick={fecharBusca}
                className="grid h-8 w-8 sm:h-6 sm:w-6 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                title="Fechar busca"
              >
                <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-0 lg:gap-4">
        <div ref={containerRef} className="flex-1 min-w-0 flex justify-center">
          {resolvedUrl ? (
            <Document
              file={resolvedUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-white/60">Carregando PDF…</p>
                </div>
              }
              error={
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {loadError || 'Erro ao carregar o PDF.'}
                </div>
              }
            >
              <div
                className="relative inline-block shadow-lg"
                onMouseDown={handlePageMouseDown}
                onMouseMove={handlePageMouseMove}
                onMouseLeave={handlePageMouseLeave}
              >
                <Page
                  pageNumber={pageNumber}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  width={larguraPagina}
                  scale={zoomAplicado}
                  customTextRenderer={customTextRenderer}
                />

                {highlightsDaPagina.map(h =>
                  h.rects.map((rect, i) => {
                    const hasNote = notes.some(n => n.highlight_id === h.id && !n.isDeleted);
                    const isHovered = hoveredHighlight?.id === h.id;
                    const isClicked = clickedHighlight?.id === h.id;
                    const type = getMarkType(h.color);

                    const style: React.CSSProperties = {
                      position: 'absolute',
                      left: `${rect.x1 * 100}%`,
                      top: `${rect.y1 * 100}%`,
                      width: `${(rect.x2 - rect.x1) * 100}%`,
                      height: `${(rect.y2 - rect.y1) * 100}%`,
                      pointerEvents: 'none',
                      zIndex: 5,
                      transition: 'box-shadow 0.15s',
                      boxShadow: isClicked
                        ? 'inset 0 0 0 2px rgba(255,255,255,0.9)'
                        : isHovered && hasNote
                        ? 'inset 0 0 0 2px rgba(255,255,255,0.55)'
                        : 'none',
                    };

                    if (type === 'highlight') {
                      style.backgroundColor = CORES_GRIFO[h.color]?.bg || CORES_GRIFO.yellow.bg;
                      style.borderRadius = 2;
                      style.mixBlendMode = 'multiply';
                    } else if (type === 'strike') {
                      style.backgroundImage = `linear-gradient(to bottom, transparent calc(50% - 1.5px), ${COR_RISCADO} calc(50% - 1.5px), ${COR_RISCADO} calc(50% + 1.5px), transparent calc(50% + 1.5px))`;
                      style.backgroundRepeat = 'no-repeat';
                      style.backgroundSize = '100% 100%';
                    } else if (type === 'underline') {
                      style.borderBottom = `2px solid ${COR_SUBLINHADO}`;
                    }

                    return <div key={`${h.id}-${i}`} style={style} />;
                  })
                )}

               {textBoxesDaPagina.map((box) => {
  const cor = CORES_CAIXA[box.color] || CORES_CAIXA.yellow;
  const isDragging = draggingBox?.id === box.id;
  const isResizing = resizingBox?.id === box.id;
  const isColorPickerOpen = colorPickerBoxId === box.id;
  const isHovered = hoveredBoxId === box.id;
  const boxHeight = box.height || 0.18;

  // Botões aparecem no hover, ao arrastar, ao redimensionar ou com o seletor aberto
  const showControls = isHovered || isDragging || isResizing || isColorPickerOpen;

  // Inclinação leve, estável por caixa (baseada no id) — dá o ar de papel
  const seed = box.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rotation = ((seed % 25) - 12) / 10; // entre -1.2° e +1.2°

  // Fundo com linhas ou grade, dependendo do estilo
  const backgroundImage =
    cor.pattern === 'grid'
      ? `linear-gradient(to right, ${cor.lineColor} 1px, transparent 1px),
         linear-gradient(to bottom, ${cor.lineColor} 1px, transparent 1px)`
      : cor.pattern === 'lines'
      ? `repeating-linear-gradient(to bottom, transparent 0, transparent 19px, ${cor.lineColor} 19px, ${cor.lineColor} 20px)`
      : 'none';
  const backgroundSize =
    cor.pattern === 'grid' ? '16px 16px' : cor.pattern === 'lines' ? '100% 20px' : 'auto';

  return (
    <div
      key={box.id}
      className="pdf-text-box"
      onMouseEnter={() => setHoveredBoxId(box.id)}
      onMouseLeave={() => setHoveredBoxId(prev => (prev === box.id ? null : prev))}
      style={{
        position: 'absolute',
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${boxHeight * 100}%`,
        zIndex: isDragging || isResizing ? 20 : 8,
        transform: `rotate(${rotation}deg)`,
        backgroundColor: cor.bg,
        backgroundImage,
        backgroundSize,
        borderRadius: 2,
        boxShadow: isDragging || isResizing
          ? '0 18px 40px rgba(0,0,0,0.4), 0 3px 6px rgba(0,0,0,0.2)'
          : '0 4px 10px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        transition: isDragging || isResizing ? 'none' : 'box-shadow 0.15s',
        overflow: 'visible',
      }}
    >
      {/* Fita adesiva no topo — alça de arrastar */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          handleBoxDragStart(e, box);
        }}
        style={{
          position: 'absolute',
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 56,
          height: 18,
          backgroundColor: cor.border,
          opacity: 0.9,
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          clipPath: 'polygon(3% 0, 97% 0, 100% 50%, 97% 100%, 3% 100%, 0 50%)',
          cursor: 'grab',
          zIndex: 5,
        }}
        title="Arrastar"
      />

      {/* Wrapper interno */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Botões (cor e excluir) — só aparecem no hover */}
        {showControls && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 2,
              display: 'flex',
              gap: 2,
              zIndex: 4,
              opacity: 1,
              transition: 'opacity 0.15s',
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setColorPickerBoxId(isColorPickerOpen ? null : box.id);
              }}
              className="grid h-4 w-4 place-items-center rounded-full bg-white/90 hover:bg-white shadow-sm"
              title="Trocar cor"
            >
              <span
                className="block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: cor.dot }}
              />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleRemoverCaixa(box.id);
              }}
              className="grid h-4 w-4 place-items-center rounded-full bg-white/90 hover:bg-white shadow-sm"
              style={{ color: '#444' }}
              title="Remover"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        )}

        {/* Seletor de cor */}
        {isColorPickerOpen && (
          <div
            style={{
              position: 'absolute',
              top: 30,
              right: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 6px',
              borderRadius: 6,
              backgroundColor: 'rgba(255,255,255,0.97)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              zIndex: 5,
            }}
          >
            {Object.entries(CORES_CAIXA).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAtualizarCaixa(box.id, { color: key });
                  setColorPickerBoxId(null);
                }}
                className={[
                  "h-4 w-4 rounded-full border transition-transform hover:scale-125",
                  box.color === key ? "border-foreground/70" : "border-white/60",
                ].join(" ")}
                style={{
                  backgroundColor: cfg.dot,
                  outline: box.color === key ? '1px solid rgba(0,0,0,0.35)' : 'none',
                }}
                title={cfg.label}
              />
            ))}
          </div>
        )}

        {/* Área de escrita — texto preto, maior e em negrito */}
        <textarea
          value={box.content}
          onChange={(e) => {
            const novoConteudo = e.target.value;
            setTextBoxes(prev =>
              prev.map(b => (b.id === box.id ? { ...b, content: novoConteudo } : b))
            );
          }}
          onFocus={() => setEditingBoxId(box.id)}
          onBlur={(e) => {
            handleAtualizarCaixa(box.id, { content: e.target.value });
            setEditingBoxId(null);
          }}
          placeholder="Escreva…"
          className="flex-1 w-full border-0 outline-none resize-none"
          style={{
            cursor: 'text',
            fontSize: 15,
            fontWeight: 600,
            lineHeight: '20px',
            fontFamily: 'inherit',
            padding: '8px 10px',
            color: '#1a1a1a',
            caretColor: '#1a1a1a',
            backgroundColor: 'transparent',
            WebkitTextFillColor: '#1a1a1a',
          }}
        />
      </div>

      {/* Alça de redimensionar (canto inferior direito) */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          background: `linear-gradient(135deg, transparent 45%, ${cor.border} 45%, ${cor.border} 55%, transparent 55%, transparent 70%, ${cor.border} 70%, ${cor.border} 80%, transparent 80%)`,
          borderBottomRightRadius: 2,
          zIndex: 4,
          opacity: showControls ? 1 : 0.35,
          transition: 'opacity 0.15s',
        }}
        onMouseDown={(e) => handleBoxResizeStart(e, box)}
        title="Redimensionar"
      />
    </div>
  );
})}

                {hoveredHighlight && !clickedHighlight && hoveredNote && (
                  <div style={{ position: 'absolute', right: 8, top: 8, zIndex: 6, pointerEvents: 'none' }}>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md">
                      <StickyNote className="h-3 w-3" /> Nota
                    </span>
                  </div>
                )}
              </div>
            </Document>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-white/60">Preparando PDF…</p>
            </div>
          )}
        </div>

        {notesDrawerOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setNotesDrawerOpen(false)}
            />
            <aside
              className="
                fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto
                rounded-t-2xl border-t border-border bg-surface p-4
                lg:static lg:inset-auto lg:z-auto lg:max-h-[80vh] lg:w-72 lg:shrink-0
                lg:rounded-xl lg:border lg:p-3 lg:sticky lg:top-20 lg:self-start
              "
            >
              <header className="mb-3 flex items-center justify-between">
                <h3 className="text-sm lg:text-xs font-semibold uppercase tracking-widest text-foreground/50">
                  Notas do PDF
                </h3>
                <button
                  type="button"
                  onClick={() => setNotesDrawerOpen(false)}
                  className="grid h-8 w-8 lg:h-6 lg:w-6 place-items-center rounded-full text-foreground/50 hover:bg-surface-2"
                >
                  <X className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                </button>
              </header>

              {totalNotas === 0 ? (
                <p className="text-sm lg:text-xs text-foreground/40 text-center py-6">
                  Nenhuma nota ainda.
                </p>
              ) : (
                <ul className="space-y-2">
                  {[...notes]
                    .filter(n => !n.isDeleted)
                    .sort((a, b) => a.page_number - b.page_number || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                    .map((n) => {
                      const isEditing = editingNote?.id === n.id;
                      const cor = corDaNota(n);
                      return (
                        <li key={n.id} className="rounded-lg border border-border bg-background/40 p-3 lg:p-2.5">
                          <header className="mb-1.5 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                irParaPagina(n.page_number);
                                setNotesDrawerOpen(false);
                              }}
                              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20"
                              title="Ir para página"
                            >
                              pág. {n.page_number}
                            </button>
                            {n.highlight_id && (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: cor }}
                                title="Vinculada a uma marcação"
                              />
                            )}
                            <div className="ml-auto flex items-center gap-0.5">
                              {!isEditing && (
                                <button
                                  type="button"
                                  onClick={() => setEditingNote({ id: n.id, content: n.content })}
                                  className="grid h-8 w-8 lg:h-6 lg:w-6 place-items-center rounded-md text-foreground/40 hover:bg-surface-2 hover:text-foreground"
                                  title="Editar"
                                >
                                  <Pencil className="h-3.5 w-3.5 lg:h-3 lg:w-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoverNota(n.id)}
                                className="grid h-8 w-8 lg:h-6 lg:w-6 place-items-center rounded-md text-foreground/40 hover:bg-destructive/10 hover:text-destructive"
                                title="Excluir"
                              >
                                <Trash2 className="h-3.5 w-3.5 lg:h-3 lg:w-3" />
                              </button>
                            </div>
                          </header>

                          {isEditing ? (
                            <div className="space-y-1.5">
                              <textarea
                                value={editingNote.content}
                                onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                                rows={3}
                                autoFocus
                                className="w-full rounded-md border border-border bg-background px-2.5 py-2 lg:px-2 lg:py-1.5 text-sm lg:text-xs text-foreground outline-none focus:border-primary resize-none"
                              />
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditingNote(null)}
                                  className="flex-1 rounded-full border border-border bg-background py-1.5 lg:py-1 text-xs lg:text-[10px] font-medium text-foreground/60 hover:bg-surface-2"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={handleSalvarEdicaoNota}
                                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-primary py-1.5 lg:py-1 text-xs lg:text-[10px] font-semibold text-primary-foreground hover:opacity-90"
                                >
                                  <Check className="h-3 w-3" /> Salvar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm lg:text-xs text-foreground/80 whitespace-pre-wrap break-words">
                              {n.content}
                            </p>
                          )}
                        </li>
                      );
                    })}
                </ul>
              )}
            </aside>
          </>
        )}
      </div>

      {hoveredHighlight && hoveredNote && !clickedHighlight && (
        <div
          className="hidden sm:block"
          style={{
            position: 'fixed',
            left: hoveredHighlight.x + 14,
            top: hoveredHighlight.y + 14,
            zIndex: 90,
            pointerEvents: 'none',
            maxWidth: 280,
          }}
        >
          <div className="rounded-lg border border-amber-500/40 bg-surface/95 backdrop-blur-md px-3 py-2 shadow-2xl">
            <div className="mb-1 flex items-center gap-1.5">
              <StickyNote className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                Nota
              </span>
            </div>
            <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">
              {hoveredNote.content}
            </p>
            <p className="mt-1 text-[10px] italic text-foreground/40">
              Clique para editar
            </p>
          </div>
        </div>
      )}

      {toastMsg && (
        <div
          className="fixed left-1/2 top-6 -translate-x-1/2 rounded-full bg-neutral-800 px-4 py-2 text-sm font-medium text-white shadow-2xl"
          style={{ zIndex: 10020 }}
        >
          {toastMsg}
        </div>
      )}

      {selection && (
        <div
          style={{
            position: 'fixed',
            left: selection.toolbarX,
            top: selection.toolbarY,
            transform: selection.preferBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            zIndex: 10000,
            maxWidth: 'calc(100vw - 8px)',
          }}
        >
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-full border border-border bg-surface px-2 py-1.5 shadow-2xl">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCopiar}
              className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 h-8 sm:h-7 text-xs sm:text-[11px] font-semibold text-blue-500 hover:bg-blue-500/25 transition-colors"
              title="Copiar texto selecionado"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Copiar</span>
            </button>

            <div className="mx-1 h-5 sm:h-4 w-px bg-border" />

            {Object.entries(CORES_GRIFO).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAplicarGrifo(key)}
                className="grid h-8 w-8 sm:h-7 sm:w-7 place-items-center rounded-full border-2 border-white/30 transition-transform active:scale-95 sm:hover:scale-110"
                style={{ backgroundColor: cfg.dot }}
                title={cfg.label}
              />
            ))}

            <div className="mx-1 h-5 sm:h-4 w-px bg-border" />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAplicarGrifo('strike')}
              className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 h-8 sm:h-7 text-xs sm:text-[11px] font-semibold text-red-500 hover:bg-red-500/25 transition-colors"
              title="Riscar texto"
            >
              <Strikethrough className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Riscar</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAplicarGrifo('underline')}
              className="inline-flex items-center gap-1 rounded-full bg-blue-600/15 px-2.5 h-8 sm:h-7 text-xs sm:text-[11px] font-semibold text-blue-600 hover:bg-blue-600/25 transition-colors"
              title="Sublinhar texto"
            >
              <Underline className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Sublinhar</span>
            </button>

            <div className="mx-1 h-5 sm:h-4 w-px bg-border" />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleAbrirAnotacao}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 h-8 sm:h-7 text-xs sm:text-[11px] font-semibold text-amber-500 hover:bg-amber-500/25 transition-colors"
              title="Anotar"
            >
              <StickyNote className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Anotar</span>
            </button>
          </div>
        </div>
      )}

      {notePopover && (
        <div
          className="pdf-note-popover"
          style={{
            position: 'fixed',
            left: notePopover.x,
            top: notePopover.y,
            transform: notePopover.preferBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            zIndex: 10010,
            maxWidth: 'calc(100vw - 16px)',
          }}
        >
          <div className="w-[calc(100vw-1rem)] max-w-sm sm:w-80 rounded-xl border border-border bg-surface p-3 shadow-2xl">
            <header className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
                {notePopover.mode === 'from-selection' ? 'Anotar trecho' : 'Nota da página'}
              </span>
              <button
                type="button"
                onClick={() => setNotePopover(null)}
                className="grid h-7 w-7 sm:h-5 sm:w-5 place-items-center rounded-full text-foreground/50 hover:bg-surface-2"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>

            {notePopover.mode === 'from-selection' && notePopover.selection && (
              <p className="mb-2 line-clamp-2 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] italic text-foreground/60">
                "{notePopover.selection.text}"
              </p>
            )}

            {notePopover.mode === 'from-selection' && (
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-foreground/50">Cor:</span>
                {Object.entries(CORES_GRIFO).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNotePopover({ ...notePopover, color: key })}
                    className={[
                      "grid h-8 w-8 sm:h-6 sm:w-6 place-items-center rounded-full border-2 transition-transform active:scale-95 sm:hover:scale-110",
                      notePopover.color === key ? "border-foreground/60 ring-2 ring-primary/40" : "border-white/30",
                    ].join(" ")}
                    style={{ backgroundColor: cfg.dot }}
                    title={cfg.label}
                  />
                ))}
              </div>
            )}

            <textarea
              value={notePopover.content}
              onChange={(e) => setNotePopover({ ...notePopover, content: e.target.value })}
              placeholder="Escreva sua anotação…"
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-base sm:text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40 resize-none"
            />

            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => setNotePopover(null)}
                className="flex-1 rounded-full border border-border bg-background py-2 sm:py-1.5 text-sm sm:text-xs font-medium text-foreground/65 hover:bg-surface-2"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarNota}
                disabled={!notePopover.content.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-primary py-2 sm:py-1.5 text-sm sm:text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {clickedHighlight && (
        <div
          className="pdf-highlight-popover"
          style={{
            position: 'fixed',
            left: clickedHighlight.x,
            top: clickedHighlight.y,
            transform: clickedHighlight.preferBelow ? 'translate(-50%, 12px)' : 'translate(-50%, calc(-100% - 12px))',
            zIndex: 10010,
            maxWidth: 'calc(100vw - 16px)',
          }}
        >
          <div className="flex w-[calc(100vw-1rem)] max-w-sm sm:w-80 flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:p-2.5 shadow-2xl">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="pl-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
                Cor
              </span>
              {Object.entries(CORES_GRIFO).map(([key, cfg]) => {
                const clickedH = highlights.find(h => h.id === clickedHighlight.id);
                const isCurrent = clickedH?.color === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTrocarCor(clickedHighlight.id, key)}
                    className={[
                      "h-8 w-8 sm:h-6 sm:w-6 rounded-full border transition-transform active:scale-95 sm:hover:scale-110",
                      isCurrent ? "border-foreground/60 ring-2 ring-primary/40" : "border-white/30",
                    ].join(" ")}
                    style={{ backgroundColor: cfg.dot }}
                    title={cfg.label}
                  />
                );
              })}
              <div className="mx-1 h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => handleTrocarCor(clickedHighlight.id, 'strike')}
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2 h-7 text-[10px] font-semibold transition-colors",
                  highlights.find(h => h.id === clickedHighlight.id)?.color === 'strike'
                    ? "bg-red-500 text-white"
                    : "bg-red-500/15 text-red-500 hover:bg-red-500/25",
                ].join(" ")}
                title="Riscar"
              >
                <Strikethrough className="h-3 w-3" /> Riscar
              </button>
              <button
                type="button"
                onClick={() => handleTrocarCor(clickedHighlight.id, 'underline')}
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2 h-7 text-[10px] font-semibold transition-colors",
                  highlights.find(h => h.id === clickedHighlight.id)?.color === 'underline'
                    ? "bg-blue-600 text-white"
                    : "bg-blue-600/15 text-blue-600 hover:bg-blue-600/25",
                ].join(" ")}
                title="Sublinhar"
              >
                <Underline className="h-3 w-3" /> Sublinhar
              </button>
              <div className="mx-1 h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => handleRemoverGrifo(clickedHighlight.id)}
                className="grid h-7 w-7 place-items-center rounded-full text-destructive hover:bg-destructive/10 transition-colors"
                title="Remover marcação"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {clickedNote ? (
              editingNote?.id === clickedNote.id ? (
                <div className="space-y-1.5">
                  <textarea
                    value={editingNote.content}
                    onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                    rows={3}
                    autoFocus
                    className="w-full rounded-md border border-border bg-background px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs text-foreground outline-none focus:border-primary resize-none"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingNote(null)}
                      className="flex-1 rounded-full border border-border bg-background py-1.5 sm:py-1 text-xs sm:text-[10px] font-medium text-foreground/60 hover:bg-surface-2"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSalvarEdicaoNota}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-primary py-1.5 sm:py-1 text-xs sm:text-[10px] font-semibold text-primary-foreground hover:opacity-90"
                    >
                      <Check className="h-3.5 w-3.5 sm:h-3 sm:w-3" /> Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 sm:p-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <StickyNote className="h-3.5 w-3.5 sm:h-3 sm:w-3 text-amber-500" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                      Nota
                    </span>
                    <div className="ml-auto flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setEditingNote({ id: clickedNote.id, content: clickedNote.content })}
                        className="grid h-7 w-7 sm:h-5 sm:w-5 place-items-center rounded-md text-amber-600 hover:bg-amber-500/20"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5 sm:h-2.5 sm:w-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoverNota(clickedNote.id)}
                        className="grid h-7 w-7 sm:h-5 sm:w-5 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                        title="Excluir nota"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-2.5 sm:w-2.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm sm:text-xs text-foreground/85 whitespace-pre-wrap break-words">
                    {clickedNote.content}
                  </p>
                </div>
              )
            ) : inlineNewNote?.highlightId === clickedHighlight.id ? (
              <div className="space-y-1.5">
                <textarea
                  value={inlineNewNote.content}
                  onChange={(e) => setInlineNewNote({ ...inlineNewNote, content: e.target.value })}
                  placeholder="Escreva sua anotação…"
                  rows={3}
                  autoFocus
                  className="w-full rounded-md border border-border bg-background px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs text-foreground outline-none focus:border-primary placeholder:text-foreground/40 resize-none"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setInlineNewNote(null)}
                    className="flex-1 rounded-full border border-border bg-background py-1.5 sm:py-1 text-xs sm:text-[10px] font-medium text-foreground/60 hover:bg-surface-2"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSalvarInlineNote}
                    disabled={!inlineNewNote.content.trim()}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-primary py-1.5 sm:py-1 text-xs sm:text-[10px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5 sm:h-3 sm:w-3" /> Salvar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setInlineNewNote({ highlightId: clickedHighlight.id, content: '' })}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-2 py-2 sm:py-1.5 text-xs sm:text-[11px] font-medium text-amber-500 hover:bg-amber-500/10 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 sm:h-3 sm:w-3" /> Adicionar nota a esta marcação
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}