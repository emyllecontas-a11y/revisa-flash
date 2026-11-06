import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { X, ArrowRight, ArrowLeft } from "lucide-react";

const svgToUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const LUMI_BOASVINDAS = svgToUrl("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" role=\"img\" aria-label=\"Lumi Boas-vindas\"><title>Lumi Boas-vindas</title><rect width=\"200\" height=\"200\" fill=\"#FFE3C7\"/><circle cx=\"100\" cy=\"104\" r=\"78\" fill=\"#fff\" opacity=\".14\"/><path d=\"M52 108 L54 34 Q56 24 66 30 L92 54 L108 54 L134 30 Q144 24 146 34 L148 108 Q148 168 100 170 Q52 168 52 108Z\" fill=\"#290E1F\"/>\n<path d=\"M62 42 L64 64 L82 52Z M138 42 L136 64 L118 52Z\" fill=\"#FCE9D8\"/>\n<ellipse cx=\"100\" cy=\"132\" rx=\"28\" ry=\"22\" fill=\"#FCE9D8\"/>\n<path d=\"M92 122 Q100 118 108 122 L100 131Z\" fill=\"#290E1F\"/>\n<path d=\"M86 136 Q100 154 114 136 Z\" fill=\"#290E1F\"/><path d=\"M92 143 Q100 150 108 143\" fill=\"#FE7802\"/><circle cx=\"80\" cy=\"102\" r=\"12\" fill=\"#FCE9D8\"/><circle cx=\"80\" cy=\"102\" r=\"6.5\" fill=\"#290E1F\"/><circle cx=\"78\" cy=\"99\" r=\"2.2\" fill=\"#fff\"/><circle cx=\"120\" cy=\"102\" r=\"12\" fill=\"#FCE9D8\"/><circle cx=\"120\" cy=\"102\" r=\"6.5\" fill=\"#290E1F\"/><circle cx=\"118\" cy=\"99\" r=\"2.2\" fill=\"#fff\"/>\n<path d=\"M68 84 Q80 76 90 82 M110 82 Q120 76 132 84\" stroke=\"#FCE9D8\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n<ellipse cx=\"70\" cy=\"122\" rx=\"7\" ry=\"4\" fill=\"#FE7802\" opacity=\".5\"/><ellipse cx=\"130\" cy=\"122\" rx=\"7\" ry=\"4\" fill=\"#FE7802\" opacity=\".5\"/>\n<g transform=\"translate(170 92) rotate(20)\"><ellipse cx=\"0\" cy=\"0\" rx=\"11\" ry=\"14\" fill=\"#290E1F\"/><ellipse cx=\"0\" cy=\"3\" rx=\"6\" ry=\"7\" fill=\"#FCE9D8\"/></g>\n<path d=\"M160 70 q-6 -6 -4 -14 M182 72 q8 -4 8 -12 M150 80 q-8 -2 -10 -8\" stroke=\"#FE7802\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/></svg>");
const LUMI_DICA = svgToUrl("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" role=\"img\" aria-label=\"Lumi Dica\"><title>Lumi Dica</title><rect width=\"200\" height=\"200\" fill=\"#FCE9D8\"/><circle cx=\"100\" cy=\"104\" r=\"78\" fill=\"#fff\" opacity=\".14\"/><path d=\"M52 108 L54 34 Q56 24 66 30 L92 54 L108 54 L134 30 Q144 24 146 34 L148 108 Q148 168 100 170 Q52 168 52 108Z\" fill=\"#290E1F\"/>\n<path d=\"M62 42 L64 64 L82 52Z M138 42 L136 64 L118 52Z\" fill=\"#FCE9D8\"/>\n<ellipse cx=\"100\" cy=\"132\" rx=\"28\" ry=\"22\" fill=\"#FCE9D8\"/>\n<path d=\"M92 122 Q100 118 108 122 L100 131Z\" fill=\"#290E1F\"/>\n<path d=\"M88 138 Q100 150 114 136\" stroke=\"#290E1F\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M70 104 Q80 96 90 104\" stroke=\"#FCE9D8\" stroke-width=\"4.5\" fill=\"none\" stroke-linecap=\"round\"/>\n<circle cx=\"120\" cy=\"102\" r=\"13\" fill=\"#FCE9D8\"/><circle cx=\"123\" cy=\"97\" r=\"7\" fill=\"#290E1F\"/><circle cx=\"125\" cy=\"94\" r=\"2.4\" fill=\"#fff\"/>\n<path d=\"M70 88 L90 90 M108 80 Q120 70 134 78\" stroke=\"#FCE9D8\" stroke-width=\"3.5\" fill=\"none\" stroke-linecap=\"round\"/>\n<rect x=\"160\" y=\"96\" width=\"8\" height=\"26\" rx=\"4\" fill=\"#290E1F\"/>\n<ellipse cx=\"164\" cy=\"132\" rx=\"14\" ry=\"13\" fill=\"#290E1F\"/><ellipse cx=\"164\" cy=\"134\" rx=\"7\" ry=\"7\" fill=\"#FCE9D8\"/>\n<circle cx=\"164\" cy=\"98\" r=\"4\" fill=\"#FCE9D8\"/>\n<g transform=\"translate(164 52)\"><circle r=\"18\" fill=\"#FE7802\" opacity=\".2\"/><path d=\"M0 -14 a11 11 0 0 1 7 20 v5 h-14 v-5 a11 11 0 0 1 7 -20Z\" fill=\"#FFC94A\" stroke=\"#290E1F\" stroke-width=\"2\"/><rect x=\"-6\" y=\"12\" width=\"12\" height=\"5\" rx=\"2\" fill=\"#290E1F\"/>\n<path d=\"M-24 -6 h-6 M24 -6 h6 M0 -22 v-6 M-17 -20 l-4 -4 M17 -20 l4 -4\" stroke=\"#FE7802\" stroke-width=\"2.5\" stroke-linecap=\"round\"/></g></svg>");
const LUMI_COMEMORANDO = svgToUrl("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" role=\"img\" aria-label=\"Lumi Comemorando\"><title>Lumi Comemorando</title><rect width=\"200\" height=\"200\" fill=\"#FFD9B8\"/><circle cx=\"100\" cy=\"104\" r=\"78\" fill=\"#fff\" opacity=\".14\"/><path d=\"M52 108 L54 34 Q56 24 66 30 L92 54 L108 54 L134 30 Q144 24 146 34 L148 108 Q148 168 100 170 Q52 168 52 108Z\" fill=\"#290E1F\"/>\n<path d=\"M62 42 L64 64 L82 52Z M138 42 L136 64 L118 52Z\" fill=\"#FCE9D8\"/>\n<ellipse cx=\"100\" cy=\"132\" rx=\"28\" ry=\"22\" fill=\"#FCE9D8\"/>\n<path d=\"M92 122 Q100 118 108 122 L100 131Z\" fill=\"#290E1F\"/>\n<path d=\"M86 136 Q100 154 114 136 Z\" fill=\"#290E1F\"/><path d=\"M92 143 Q100 150 108 143\" fill=\"#FE7802\"/>\n<path d=\"M68 106 Q80 88 92 106 M108 106 Q120 88 132 106\" stroke=\"#FCE9D8\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M68 82 Q80 74 90 80 M110 80 Q120 74 132 82\" stroke=\"#FCE9D8\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n<ellipse cx=\"70\" cy=\"122\" rx=\"8\" ry=\"5\" fill=\"#FE7802\" opacity=\".6\"/><ellipse cx=\"130\" cy=\"122\" rx=\"8\" ry=\"5\" fill=\"#FE7802\" opacity=\".6\"/>\n<g transform=\"translate(30 70) rotate(-25)\"><ellipse cx=\"0\" cy=\"0\" rx=\"11\" ry=\"14\" fill=\"#290E1F\"/><ellipse cx=\"0\" cy=\"3\" rx=\"6\" ry=\"7\" fill=\"#FCE9D8\"/></g><g transform=\"translate(170 70) rotate(25)\"><ellipse cx=\"0\" cy=\"0\" rx=\"11\" ry=\"14\" fill=\"#290E1F\"/><ellipse cx=\"0\" cy=\"3\" rx=\"6\" ry=\"7\" fill=\"#FCE9D8\"/></g>\n<path d=\"M30 52 l0 0\" stroke=\"#290E1F\"/>\n<rect x=\"20\" y=\"20\" width=\"8\" height=\"4\" rx=\"1\" fill=\"#FE7802\" transform=\"rotate(30 24 22)\"/>\n<rect x=\"168\" y=\"22\" width=\"8\" height=\"4\" rx=\"1\" fill=\"#290E1F\" transform=\"rotate(-20 172 24)\"/>\n<rect x=\"96\" y=\"10\" width=\"8\" height=\"4\" rx=\"1\" fill=\"#FE7802\" transform=\"rotate(50 100 12)\"/>\n<circle cx=\"50\" cy=\"16\" r=\"3\" fill=\"#D7336C\"/><circle cx=\"150\" cy=\"12\" r=\"3\" fill=\"#8E3AB0\"/>\n<circle cx=\"18\" cy=\"120\" r=\"3\" fill=\"#FE7802\"/><circle cx=\"184\" cy=\"118\" r=\"3\" fill=\"#D7336C\"/>\n<rect x=\"14\" y=\"160\" width=\"8\" height=\"4\" rx=\"1\" fill=\"#8E3AB0\" transform=\"rotate(-35 18 162)\"/>\n<rect x=\"178\" y=\"158\" width=\"8\" height=\"4\" rx=\"1\" fill=\"#FE7802\" transform=\"rotate(40 182 160)\"/>\n<path d=\"M120 8 l3 6 6 1 -5 4 1 6 -5 -3 -5 3 1 -6 -5 -4 6 -1Z\" fill=\"#FE7802\"/></svg>");

type Step = {
  path: string;
  target?: string;
  title: string;
  text: string;
  img?: string;
};

type Tab = { path: string; name: string };

const TABS: Tab[] = [
  { path: "/", name: "Início" },
  { path: "/conteudo", name: "Conteúdo" },
  { path: "/calendario", name: "Calendário" },
  { path: "/sessoes", name: "Sessões" },
  { path: "/flashcards", name: "Flashcards" },
  { path: "/simulados", name: "Questões" },
  { path: "/erros", name: "Erros" },
  { path: "/comunidade", name: "Comunidade" },
  { path: "/configuracoes", name: "Ajustes" },
];

const tabName = (path: string) => TABS.find((t) => t.path === path)?.name ?? "";

const nav = (key: string, path: string) =>
  `[data-tour="nav-${key}"], aside a[href="${path}"], nav a[href="${path}"]`;
const t = (key: string) => `[data-tour="${key}"]`;

export const STEPS: Step[] = [
  { path: "/", title: "Olá, eu sou a Lumi!", text: "Bem-vinda ao RevisaFlash! Vou passar por cada aba e te mostrar onde fica cada coisa. Use as setas do teclado ou os botões.", img: LUMI_BOASVINDAS },
  { path: "/", target: nav("inicio", "/"), title: "Aba Início", text: "Seu painel diário: tudo o que importa hoje em uma tela só." },
  { path: "/", target: t("inicio-prova"), title: "Contagem para a prova", text: "Quantos dias faltam para a prova, dias estudados, horas e questões resolvidas." },
  { path: "/", target: t("inicio-flash"), title: "Flashcards de hoje", text: "Quantos cards novos e revisões te esperam hoje." },
  { path: "/", target: t("inicio-revisoes"), title: "Próximas revisões", text: "Os tópicos que voltam nos próximos dias. Toque em “Ver agenda” para o calendário completo." },
  { path: "/", target: t("inicio-progresso"), title: "Progresso por disciplina", text: "Veja em qual matéria você está mais avançada e onde precisa de reforço." },
  { path: "/conteudo", target: nav("conteudo", "/conteudo"), title: "Aba Conteúdo", text: "Aqui você organiza suas disciplinas e tópicos." },
  { path: "/conteudo", target: t("conteudo-criar"), title: "Criar disciplina", text: "Comece criando uma disciplina, depois adicione os tópicos dentro dela." },
  { path: "/conteudo", target: t("conteudo-status"), title: "Status dos tópicos", text: "Não iniciado, Estudando, Revisado e Dominado. Atualize conforme avança." },
  { path: "/conteudo", target: t("conteudo-materiais"), title: "Envio de materiais", text: "Anexe PDFs e resumos a cada tópico para ter tudo à mão." },
  { path: "/calendario", target: nav("calendario", "/calendario"), title: "Aba Calendário", text: "Sua agenda de revisões, montada automaticamente." },
  { path: "/calendario", target: t("cal-registrar"), title: "Registrar estudo", text: "Estudou algo? Registre aqui e a Lumi agenda as revisões." },
  { path: "/calendario", target: t("cal-dias"), title: "Hoje, amanhã e atrasados", text: "Veja o que vence hoje, o que vem amanhã e o que ficou para trás." },
  { path: "/calendario", target: t("cal-mes"), title: "Trocar de mês", text: "Use as setas para navegar entre os meses." },
  { path: "/sessoes", target: nav("sessoes", "/sessoes"), title: "Aba Sessões", text: "Controle o seu tempo de estudo focado." },
  { path: "/sessoes", target: t("sessoes-registrar"), title: "Registrar sessão", text: "Lance uma sessão manual quando estudar fora do cronômetro." },
  { path: "/sessoes", target: t("sessoes-grafico"), title: "Últimos 7 dias", text: "O gráfico mostra quanto você estudou em cada dia da semana." },
  { path: "/sessoes", target: t("sessoes-disciplina"), title: "Tempo por disciplina", text: "Descubra para onde suas horas estão indo." },
  { path: "/flashcards", target: nav("flashcards", "/flashcards"), title: "Aba Flashcards", text: "O coração do app: repetição espaçada para memorizar de verdade." },
  { path: "/flashcards", target: t("flash-novo"), title: "Novo card", text: "Crie cards com frente e verso em segundos." },
  { path: "/flashcards", target: t("flash-botoes"), title: "Errei, Difícil, Bom, Fácil", text: "Avalie cada resposta com sinceridade — é isso que define quando o card volta." },
  { path: "/flashcards", target: t("flash-sanguessuga"), title: "Sanguessuga", text: "Cards que você erra muitas vezes ganham esta etiqueta para receber atenção especial." },
  { path: "/flashcards", target: t("flash-compartilhar"), title: "Compartilhar baralho", text: "Envie seus baralhos para as amigas estudarem junto." },
  { path: "/simulados", target: nav("questoes", "/simulados"), title: "Aba Questões", text: "Seus simulados e o desempenho em cada um." },
  { path: "/simulados", target: t("questoes-importar"), title: "Importar simulado", text: "Traga simulados do TEC e de outras plataformas." },
  { path: "/simulados", target: t("questoes-comparar"), title: "Comparar", text: "Compare simulados lado a lado e veja sua evolução." },
  { path: "/simulados", target: t("questoes-analise"), title: "Análise de desempenho", text: "Acertos por disciplina para saber exatamente onde focar." },
  { path: "/erros", target: nav("erros", "/erros"), title: "Aba Erros", text: "Seu caderno de erros: errar e revisar é como se aprende." },
  { path: "/erros", target: t("erros-registrar"), title: "Registrar erro", text: "Anote a questão, o porquê do erro e a resposta certa." },
  { path: "/erros", target: t("erros-tipos"), title: "Tipos de erro", text: "Conceito, Interpretação, Memória e Atenção — classifique para atacar a causa." },
  { path: "/comunidade", target: nav("comunidade", "/comunidade"), title: "Aba Comunidade", text: "Estudar em companhia rende mais." },
  { path: "/comunidade", target: t("com-ranking"), title: "Ranking", text: "Veja sua posição na semana entre as amigas." },
  { path: "/comunidade", target: t("com-amizades"), title: "Amizades", text: "Adicione amigas e acompanhe a sequência delas." },
  { path: "/comunidade", target: t("com-compartilhado"), title: "Compartilhado comigo", text: "Baralhos e cadernos que te enviaram aparecem aqui." },
  { path: "/configuracoes", target: nav("ajustes", "/configuracoes"), title: "Aba Ajustes", text: "Deixe o RevisaFlash do seu jeito." },
  { path: "/configuracoes", target: t("aj-prova"), title: "Prova-alvo", text: "Defina a prova e a data — a contagem do Início vem daqui." },
  { path: "/configuracoes", target: t("aj-limites"), title: "Limites diários", text: "Controle quantas revisões e cards novos aparecem por dia." },
  { path: "/configuracoes", target: t("aj-anki"), title: "Importar do Anki", text: "Já tem baralhos no Anki? Traga o arquivo .apkg." },
  { path: "/configuracoes", target: t("aj-backup"), title: "Backup", text: "Baixe uma cópia completa dos seus dados quando quiser." },
  { path: "/", title: "Tudo pronto!", text: "Agora você conhece cada cantinho do RevisaFlash. Bons estudos — eu fico por aqui torcendo por você!", img: LUMI_COMEMORANDO },
];

const PAD = 8;
const GAP = 16;
const TIP_W = 340;
const WAIT_MS = 2500;
const MOBILE_BP = 640;

function isVisible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const st = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
}

function findVisible(selector?: string): HTMLElement | null {
  if (!selector) return null;
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible) ?? null;
}

function waitForElement(selector: string | undefined, signal: { cancelled: boolean }): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    if (!selector) return resolve(null);
    const start = performance.now();
    const tick = () => {
      if (signal.cancelled) return resolve(null);
      const el = findVisible(selector);
      if (el) return resolve(el);
      if (performance.now() - start > WAIT_MS) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

type Rect = { top: number; left: number; width: number; height: number };
type Pos = { top: number; left: number; side: "right" | "left" | "top" | "bottom" | "center" | "sheet" };

export type GuidedTourProps = {
  userId: string;
  forceOpen?: boolean;
  currentPath?: string;
  onNavigate?: (path: string) => void;
  onFinish?: () => void;
};

export function GuidedTour({ userId, forceOpen = false, currentPath, onNavigate, onFinish }: GuidedTourProps) {
  const storageKey = `tour_completed_${userId}`;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0, side: "center" });
  const [ready, setReady] = useState(false);
  const [vw, setVw] = useState(1024);
  const tipRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (forceOpen || !localStorage.getItem(storageKey)) {
      setStep(0);
      setOpen(true);
    }
  }, [storageKey, userId, forceOpen]);

  const finish = useCallback(() => {
    localStorage.setItem(storageKey, "true");
    setOpen(false);
    onFinish?.();
  }, [storageKey, onFinish]);

  const s = STEPS[step] ?? STEPS[0]!;
  const last = step === STEPS.length - 1;
  const next = useCallback(() => (step >= STEPS.length - 1 ? finish() : setStep((v) => v + 1)), [step, finish]);
  const prev = useCallback(() => setStep((v) => Math.max(0, v - 1)), []);

  const tabSteps = STEPS.map((x, i) => ({ x, i })).filter(({ x }) => x.target && x.path === s.path);
  const tabIndex = tabSteps.findIndex(({ i }) => i === step);
  const hasTab = !!s.target && tabIndex >= 0;

  const measure = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    setVw(w);
    const tipW = Math.min(TIP_W, w - 24);
    const tipH = tipRef.current?.offsetHeight ?? 220;
    const el = elRef.current && document.contains(elRef.current) && isVisible(elRef.current) ? elRef.current : null;

    if (!el) {
      setRect(null);
      setPos({ top: h / 2 - tipH / 2, left: w / 2 - tipW / 2, side: "center" });
      return;
    }
    const r = el.getBoundingClientRect();
    const box = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
    setRect(box);

    if (w < MOBILE_BP) {
      const centerY = box.top + box.height / 2;
      setPos(centerY > h / 2 ? { side: "sheet", top: 12, left: 12 } : { side: "sheet", top: h - tipH - 12, left: 12 });
      return;
    }

    const clampY = (y: number) => Math.max(12, Math.min(y, h - tipH - 12));
    const clampX = (x: number) => Math.max(12, Math.min(x, w - tipW - 12));
    let p: Pos;
    if (box.left + box.width + GAP + tipW < w - 12) {
      p = { side: "right", left: box.left + box.width + GAP, top: clampY(box.top + box.height / 2 - tipH / 2) };
    } else if (box.top + box.height + GAP + tipH < h - 12) {
      p = { side: "bottom", top: box.top + box.height + GAP, left: clampX(box.left + box.width / 2 - tipW / 2) };
    } else if (box.top - GAP - tipH > 12) {
      p = { side: "top", top: box.top - GAP - tipH, left: clampX(box.left + box.width / 2 - tipW / 2) };
    } else if (box.left - GAP - tipW > 12) {
      p = { side: "left", left: box.left - GAP - tipW, top: clampY(box.top + box.height / 2 - tipH / 2) };
    } else {
      p = { side: "center", top: h - tipH - 12, left: clampX(w / 2 - tipW / 2) };
    }
    setPos(p);
  }, []);

  useEffect(() => {
    if (!open) return;
    const signal = { cancelled: false };
    setReady(false);
    const here = currentPath ?? window.location.pathname;
    if (s.path !== here) onNavigate?.(s.path);

    waitForElement(s.target, signal).then((el) => {
      if (signal.cancelled) return;
      elRef.current = el;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight - 80) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      measure();
      requestAnimationFrame(() => {
        measure();
        setReady(true);
      });
    });
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  useLayoutEffect(() => {
    if (!open) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, finish]);

  if (!open) return null;

  const ease = "all .45s cubic-bezier(.2,.8,.2,1)";
  const tipW = pos.side === "sheet" ? vw - 24 : Math.min(TIP_W, vw - 24);
  const pct = ((step + 1) / STEPS.length) * 100;
  const img = s.img ?? LUMI_DICA;

  const arrow = (): CSSProperties | null => {
    if (!rect) return null;
    const clampH = (v: number) => Math.max(18, Math.min(v, tipW - 34));
    if (pos.side === "right") return { left: -7, top: Math.max(18, Math.min(rect.top + rect.height / 2 - pos.top - 8, 180)) };
    if (pos.side === "left") return { right: -7, top: Math.max(18, Math.min(rect.top + rect.height / 2 - pos.top - 8, 180)) };
    if (pos.side === "top") return { bottom: -7, left: clampH(rect.left + rect.width / 2 - pos.left - 8) };
    if (pos.side === "bottom") return { top: -7, left: clampH(rect.left + rect.width / 2 - pos.left - 8) };
    return null;
  };
  const arrowStyle = arrow();

  return (
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true" aria-label="Tour guiado do RevisaFlash">
      <style>{`
        @keyframes gt-peek{from{opacity:0;transform:translateY(14px) rotate(-10deg) scale(.9)}to{opacity:1;transform:none}}
        @keyframes gt-pulse{0%,100%{box-shadow:0 0 0 3px rgba(254,120,2,.95),0 0 0 9999px rgba(20,6,15,.74),0 0 26px 8px rgba(254,120,2,.45)}50%{box-shadow:0 0 0 3px rgba(254,120,2,.95),0 0 0 9999px rgba(20,6,15,.74),0 0 40px 14px rgba(254,120,2,.25)}}
        @keyframes gt-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      `}</style>

      <div className="absolute inset-0" />

      <div
        className="pointer-events-none absolute rounded-2xl"
        style={{
          transition: ease,
          ...(rect
            ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height, animation: "gt-pulse 2.2s ease-in-out infinite" }
            : { top: "50%", left: "50%", width: 0, height: 0, boxShadow: "0 0 0 9999px rgba(20,6,15,.74)" }),
        }}
      />

      <div
        ref={tipRef}
        className="absolute rounded-3xl p-5 pt-5 text-white shadow-2xl"
        style={{
          transition: ease,
          top: pos.top,
          left: pos.left,
          width: tipW,
          opacity: ready ? 1 : 0.6,
          background: "linear-gradient(160deg,#3a1530 0%,#290E1F 60%)",
          boxShadow: "0 24px 60px -12px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08)",
        }}
      >
        {arrowStyle && <span className="absolute h-4 w-4 rotate-45" style={{ ...arrowStyle, background: "#30112a" }} />}

        <img
          key={img + step}
          src={img}
          alt="Lumi"
          className="absolute -top-11 right-3 h-[72px] w-[72px] rounded-2xl object-cover shadow-xl sm:-top-12 sm:h-20 sm:w-20"
          style={{ animation: "gt-peek .5s cubic-bezier(.2,.8,.2,1)", outline: "4px solid #290E1F" }}
        />

        <div key={step} style={{ animation: "gt-in .35s ease-out" }}>
          <div className="flex flex-wrap items-center gap-2 pr-20">
            {hasTab ? (
              <>
                <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ background: "rgba(254,120,2,.16)", color: "#FE7802" }}>
                  {tabName(s.path)}
                </span>
                <span className="text-[11px] font-semibold text-white/60">
                  {tabIndex + 1}/{tabSteps.length}
                </span>
              </>
            ) : (
              <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ background: "rgba(254,120,2,.16)", color: "#FE7802" }}>
                Lumi
              </span>
            )}
          </div>
          <h3 className="mt-2 pr-16 text-lg font-extrabold leading-tight sm:text-xl">{s.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-white/75">{s.text}</p>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#FE7802,#FFB15C)", transition: "width .4s ease" }} />
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-white/50">
            {step + 1}/{STEPS.length}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {!last && (
            <button onClick={finish} className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/5" style={{ color: "#FE7802" }}>
              Pular <X className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="ml-auto flex gap-2">
            {step > 0 && (
              <button onClick={prev} aria-label="Voltar" className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 hover:bg-white/15">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={next}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white hover:brightness-110"
              style={{ background: "#FE7802", boxShadow: "0 8px 20px -6px rgba(254,120,2,.6)" }}
            >
              {last ? "Bora estudar!" : step === 0 ? "Começar" : "Próximo"} {!last && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GuidedTour;