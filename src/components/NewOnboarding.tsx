import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, X, Sparkles } from "lucide-react";

const svgToUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const LUMI_COMEMORANDO = svgToUrl("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" role=\"img\" aria-label=\"Lumi Comemorando\"><title>Lumi Comemorando</title><rect width=\"200\" height=\"200\" fill=\"#FFD9B8\"/><circle cx=\"100\" cy=\"104\" r=\"78\" fill=\"#fff\" opacity=\".14\"/><path d=\"M52 108 L54 34 Q56 24 66 30 L92 54 L108 54 L134 30 Q144 24 146 34 L148 108 Q148 168 100 170 Q52 168 52 108Z\" fill=\"#290E1F\"/>\n<path d=\"M62 42 L64 64 L82 52Z M138 42 L136 64 L118 52Z\" fill=\"#FCE9D8\"/>\n<ellipse cx=\"100\" cy=\"132\" rx=\"28\" ry=\"22\" fill=\"#FCE9D8\"/>\n<path d=\"M92 122 Q100 118 108 122 L100 131Z\" fill=\"#290E1F\"/>\n<path d=\"M86 136 Q100 154 114 136 Z\" fill=\"#290E1F\"/><path d=\"M92 143 Q100 150 108 143\" fill=\"#FE7802\"/>\n<path d=\"M68 106 Q80 88 92 106 M108 106 Q120 88 132 106\" stroke=\"#FCE9D8\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M68 82 Q80 74 90 80 M110 80 Q120 74 132 82\" stroke=\"#FCE9D8\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n<ellipse cx=\"70\" cy=\"122\" rx=\"8\" ry=\"5\" fill=\"#FE7802\" opacity=\".6\"/><ellipse cx=\"130\" cy=\"122\" rx=\"8\" ry=\"5\" fill=\"#FE7802\" opacity=\".6\"/>\n<g transform=\"translate(30 70) rotate(-25)\"><ellipse cx=\"0\" cy=\"0\" rx=\"11\" ry=\"14\" fill=\"#290E1F\"/><ellipse cx=\"0\" cy=\"3\" rx=\"6\" ry=\"7\" fill=\"#FCE9D8\"/></g><g transform=\"translate(170 70) rotate(25)\"><ellipse cx=\"0\" cy=\"0\" rx=\"11\" ry=\"14\" fill=\"#290E1F\"/><ellipse cx=\"0\" cy=\"3\" rx=\"6\" ry=\"7\" fill=\"#FCE9D8\"/></g>\n<path d=\"M30 52 l0 0\" stroke=\"#290E1F\"/>\n<rect x=\"20\" y=\"20\" width=\"8\" height=\"4\" rx=\"1\" fill=\"#FE7802\" transform=\"rotate(30 24 22)\"/>\n<rect x=\"168\" y=\"22\" width=\"8\" height=\"4\" rx=\"1\" fill=\"#290E1F\" transform=\"rotate(-20 172 24)\"/>\n<rect x=\"96\" y=\"10\" width=\"8\" height=\"4\" rx=\"1\" fill=\"#FE7802\" transform=\"rotate(50 100 12)\"/>\n<circle cx=\"50\" cy=\"16\" r=\"3\" fill=\"#D7336C\"/><circle cx=\"150\" cy=\"12\" r=\"3\" fill=\"#8E3AB0\"/>\n<circle cx=\"18\" cy=\"120\" r=\"3\" fill=\"#FE7802\"/><circle cx=\"184\" cy=\"118\" r=\"3\" fill=\"#D7336C\"/>\n<rect x=\"14\" y=\"160\" width=\"8\" height=\"4\" rx=\"1\" fill=\"#8E3AB0\" transform=\"rotate(-35 18 162)\"/>\n<rect x=\"178\" y=\"158\" width=\"8\" height=\"4\" rx=\"1\" fill=\"#FE7802\" transform=\"rotate(40 182 160)\"/>\n<path d=\"M120 8 l3 6 6 1 -5 4 1 6 -5 -3 -5 3 1 -6 -5 -4 6 -1Z\" fill=\"#FE7802\"/></svg>");
const LUMI_BOASVINDAS = svgToUrl("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" role=\"img\" aria-label=\"Lumi Boas-vindas\"><title>Lumi Boas-vindas</title><rect width=\"200\" height=\"200\" fill=\"#FFE3C7\"/><circle cx=\"100\" cy=\"104\" r=\"78\" fill=\"#fff\" opacity=\".14\"/><path d=\"M52 108 L54 34 Q56 24 66 30 L92 54 L108 54 L134 30 Q144 24 146 34 L148 108 Q148 168 100 170 Q52 168 52 108Z\" fill=\"#290E1F\"/>\n<path d=\"M62 42 L64 64 L82 52Z M138 42 L136 64 L118 52Z\" fill=\"#FCE9D8\"/>\n<ellipse cx=\"100\" cy=\"132\" rx=\"28\" ry=\"22\" fill=\"#FCE9D8\"/>\n<path d=\"M92 122 Q100 118 108 122 L100 131Z\" fill=\"#290E1F\"/>\n<path d=\"M86 136 Q100 154 114 136 Z\" fill=\"#290E1F\"/><path d=\"M92 143 Q100 150 108 143\" fill=\"#FE7802\"/><circle cx=\"80\" cy=\"102\" r=\"12\" fill=\"#FCE9D8\"/><circle cx=\"80\" cy=\"102\" r=\"6.5\" fill=\"#290E1F\"/><circle cx=\"78\" cy=\"99\" r=\"2.2\" fill=\"#fff\"/><circle cx=\"120\" cy=\"102\" r=\"12\" fill=\"#FCE9D8\"/><circle cx=\"120\" cy=\"102\" r=\"6.5\" fill=\"#290E1F\"/><circle cx=\"118\" cy=\"99\" r=\"2.2\" fill=\"#fff\"/>\n<path d=\"M68 84 Q80 76 90 82 M110 82 Q120 76 132 84\" stroke=\"#FCE9D8\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n<ellipse cx=\"70\" cy=\"122\" rx=\"7\" ry=\"4\" fill=\"#FE7802\" opacity=\".5\"/><ellipse cx=\"130\" cy=\"122\" rx=\"7\" ry=\"4\" fill=\"#FE7802\" opacity=\".5\"/>\n<g transform=\"translate(170 92) rotate(20)\"><ellipse cx=\"0\" cy=\"0\" rx=\"11\" ry=\"14\" fill=\"#290E1F\"/><ellipse cx=\"0\" cy=\"3\" rx=\"6\" ry=\"7\" fill=\"#FCE9D8\"/></g>\n<path d=\"M160 70 q-6 -6 -4 -14 M182 72 q8 -4 8 -12 M150 80 q-8 -2 -10 -8\" stroke=\"#FE7802\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/></svg>");
const LUMI_CARREGANDO = svgToUrl("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" role=\"img\" aria-label=\"Lumi Carregando\"><title>Lumi Carregando</title><rect width=\"200\" height=\"200\" fill=\"#D9E7F7\"/><circle cx=\"100\" cy=\"104\" r=\"78\" fill=\"#fff\" opacity=\".14\"/><path d=\"M52 108 L54 34 Q56 24 66 30 L92 54 L108 54 L134 30 Q144 24 146 34 L148 108 Q148 168 100 170 Q52 168 52 108Z\" fill=\"#290E1F\"/>\n<path d=\"M62 42 L64 64 L82 52Z M138 42 L136 64 L118 52Z\" fill=\"#FCE9D8\"/>\n<ellipse cx=\"100\" cy=\"132\" rx=\"28\" ry=\"22\" fill=\"#FCE9D8\"/>\n<path d=\"M92 122 Q100 118 108 122 L100 131Z\" fill=\"#290E1F\"/>\n<path d=\"M94 142 h12\" stroke=\"#290E1F\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n<circle cx=\"80\" cy=\"102\" r=\"12\" fill=\"#FCE9D8\"/><circle cx=\"83\" cy=\"97\" r=\"6.5\" fill=\"#290E1F\"/><circle cx=\"81\" cy=\"94\" r=\"2.2\" fill=\"#fff\"/><circle cx=\"120\" cy=\"102\" r=\"12\" fill=\"#FCE9D8\"/><circle cx=\"123\" cy=\"97\" r=\"6.5\" fill=\"#290E1F\"/><circle cx=\"121\" cy=\"94\" r=\"2.2\" fill=\"#fff\"/>\n<path d=\"M70 84 Q80 78 90 84 M110 80 Q120 72 132 80\" stroke=\"#FCE9D8\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n<g transform=\"translate(168 40)\"><g><path d=\"M-4 -18 h8 l1 5 4 2 4 -3 6 6 -3 4 2 4 5 1 v8 l-5 1 -2 4 3 4 -6 6 -4 -3 -4 2 -1 5 h-8 l-1 -5 -4 -2 -4 3 -6 -6 3 -4 -2 -4 -5 -1 v-8 l5 -1 2 -4 -3 -4 6 -6 4 3 4 -2Z\" fill=\"#FE7802\"/><circle r=\"6\" fill=\"#D9E7F7\"/>\n<animateTransform attributeName=\"transform\" type=\"rotate\" from=\"0\" to=\"360\" dur=\"3s\" repeatCount=\"indefinite\"/></g></g>\n<circle cx=\"148\" cy=\"66\" r=\"3\" fill=\"#290E1F\"/><circle cx=\"140\" cy=\"76\" r=\"2\" fill=\"#290E1F\"/></svg>");
const LUMI_DICA = svgToUrl("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" role=\"img\" aria-label=\"Lumi Dica\"><title>Lumi Dica</title><rect width=\"200\" height=\"200\" fill=\"#FCE9D8\"/><circle cx=\"100\" cy=\"104\" r=\"78\" fill=\"#fff\" opacity=\".14\"/><path d=\"M52 108 L54 34 Q56 24 66 30 L92 54 L108 54 L134 30 Q144 24 146 34 L148 108 Q148 168 100 170 Q52 168 52 108Z\" fill=\"#290E1F\"/>\n<path d=\"M62 42 L64 64 L82 52Z M138 42 L136 64 L118 52Z\" fill=\"#FCE9D8\"/>\n<ellipse cx=\"100\" cy=\"132\" rx=\"28\" ry=\"22\" fill=\"#FCE9D8\"/>\n<path d=\"M92 122 Q100 118 108 122 L100 131Z\" fill=\"#290E1F\"/>\n<path d=\"M88 138 Q100 150 114 136\" stroke=\"#290E1F\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/>\n<path d=\"M70 104 Q80 96 90 104\" stroke=\"#FCE9D8\" stroke-width=\"4.5\" fill=\"none\" stroke-linecap=\"round\"/>\n<circle cx=\"120\" cy=\"102\" r=\"13\" fill=\"#FCE9D8\"/><circle cx=\"123\" cy=\"97\" r=\"7\" fill=\"#290E1F\"/><circle cx=\"125\" cy=\"94\" r=\"2.4\" fill=\"#fff\"/>\n<path d=\"M70 88 L90 90 M108 80 Q120 70 134 78\" stroke=\"#FCE9D8\" stroke-width=\"3.5\" fill=\"none\" stroke-linecap=\"round\"/>\n<rect x=\"160\" y=\"96\" width=\"8\" height=\"26\" rx=\"4\" fill=\"#290E1F\"/>\n<ellipse cx=\"164\" cy=\"132\" rx=\"14\" ry=\"13\" fill=\"#290E1F\"/><ellipse cx=\"164\" cy=\"134\" rx=\"7\" ry=\"7\" fill=\"#FCE9D8\"/>\n<circle cx=\"164\" cy=\"98\" r=\"4\" fill=\"#FCE9D8\"/>\n<g transform=\"translate(164 52)\"><circle r=\"18\" fill=\"#FE7802\" opacity=\".2\"/><path d=\"M0 -14 a11 11 0 0 1 7 20 v5 h-14 v-5 a11 11 0 0 1 7 -20Z\" fill=\"#FFC94A\" stroke=\"#290E1F\" stroke-width=\"2\"/><rect x=\"-6\" y=\"12\" width=\"12\" height=\"5\" rx=\"2\" fill=\"#290E1F\"/>\n<path d=\"M-24 -6 h-6 M24 -6 h6 M0 -22 v-6 M-17 -20 l-4 -4 M17 -20 l4 -4\" stroke=\"#FE7802\" stroke-width=\"2.5\" stroke-linecap=\"round\"/></g></svg>");
const LUMI_BASE = svgToUrl("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" role=\"img\" aria-label=\"Lumi\"><title>Lumi</title><rect width=\"200\" height=\"200\" fill=\"#C9B6EE\"/><circle cx=\"100\" cy=\"104\" r=\"78\" fill=\"#fff\" opacity=\".14\"/><path d=\"M52 108 L54 34 Q56 24 66 30 L92 54 L108 54 L134 30 Q144 24 146 34 L148 108 Q148 168 100 170 Q52 168 52 108Z\" fill=\"#290E1F\"/>\n<path d=\"M62 42 L64 64 L82 52Z M138 42 L136 64 L118 52Z\" fill=\"#FCE9D8\"/>\n<ellipse cx=\"100\" cy=\"132\" rx=\"28\" ry=\"22\" fill=\"#FCE9D8\"/>\n<path d=\"M92 122 Q100 118 108 122 L100 131Z\" fill=\"#290E1F\"/>\n<path d=\"M88 138 Q94 144 100 138 Q106 144 112 138\" stroke=\"#290E1F\" stroke-width=\"2.5\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"80\" cy=\"102\" r=\"5\" fill=\"#FCE9D8\"/><circle cx=\"120\" cy=\"102\" r=\"5\" fill=\"#FCE9D8\"/><g stroke=\"#FE7802\" stroke-width=\"4\" fill=\"none\"><circle cx=\"80\" cy=\"102\" r=\"13\"/><circle cx=\"120\" cy=\"102\" r=\"13\"/><path d=\"M93 102 H107 M67 100 L58 96 M133 100 L142 96\"/></g></svg>");
const LUMI_NOTIFICACAO = svgToUrl("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" role=\"img\" aria-label=\"Lumi Notifica\u00e7\u00e3o\"><title>Lumi Notifica\u00e7\u00e3o</title><rect width=\"200\" height=\"200\" fill=\"#FFF1C9\"/><circle cx=\"100\" cy=\"104\" r=\"78\" fill=\"#fff\" opacity=\".14\"/><path d=\"M52 108 L54 34 Q56 24 66 30 L92 54 L108 54 L134 30 Q144 24 146 34 L148 108 Q148 168 100 170 Q52 168 52 108Z\" fill=\"#290E1F\"/>\n<path d=\"M62 42 L64 64 L82 52Z M138 42 L136 64 L118 52Z\" fill=\"#FCE9D8\"/>\n<ellipse cx=\"100\" cy=\"132\" rx=\"28\" ry=\"22\" fill=\"#FCE9D8\"/>\n<path d=\"M92 122 Q100 118 108 122 L100 131Z\" fill=\"#290E1F\"/>\n<ellipse cx=\"100\" cy=\"142\" rx=\"7\" ry=\"8\" fill=\"#290E1F\"/>\n<circle cx=\"80\" cy=\"102\" r=\"14\" fill=\"#FCE9D8\"/><circle cx=\"120\" cy=\"102\" r=\"14\" fill=\"#FCE9D8\"/>\n<circle cx=\"80\" cy=\"100\" r=\"6\" fill=\"#290E1F\"/><circle cx=\"120\" cy=\"100\" r=\"6\" fill=\"#290E1F\"/><circle cx=\"78\" cy=\"97\" r=\"2.2\" fill=\"#fff\"/><circle cx=\"118\" cy=\"97\" r=\"2.2\" fill=\"#fff\"/>\n<path d=\"M66 78 Q80 68 92 76 M108 76 Q120 68 134 78\" stroke=\"#FCE9D8\" stroke-width=\"3.5\" fill=\"none\" stroke-linecap=\"round\"/>\n<g transform=\"translate(100 14) rotate(-12)\"><path d=\"M-12 14 q0 -18 12 -18 q12 0 12 18 l4 4 h-32Z\" fill=\"#FFC94A\" stroke=\"#290E1F\" stroke-width=\"2\"/><circle cy=\"21\" r=\"3.5\" fill=\"#FE7802\"/></g>\n<path d=\"M74 8 l-8 -4 M72 18 h-9 M126 8 l8 -4 M128 18 h9\" stroke=\"#FE7802\" stroke-width=\"3\" stroke-linecap=\"round\"/></svg>");

const STEPS = [
  { img: LUMI_BOASVINDAS, tag: "Boas-vindas", title: "Olá, eu sou a Lumi!", text: "Bem-vinda ao RevisaFlash, o seu novo jeito de estudar para o ENARE." },
  { img: LUMI_CARREGANDO, tag: "Organização", title: "Seu Cronograma Inteligente", text: "Organize seus conteúdos, acompanhe seu calendário de revisões e registre suas sessões de estudo." },
  { img: LUMI_DICA, tag: "O Coração do App", title: "Flashcards e Erros", text: "Use a repetição espaçada para fixar o conteúdo e registre seus erros para nunca mais esquecê-los." },
  { img: LUMI_COMEMORANDO, tag: "Prática", title: "Simulados e Questões", text: "Importe questões do TEC, faça simulados e acompanhe seu desempenho em tempo real." },
  { img: LUMI_BASE, tag: "Comunidade", title: "Estude em Companhia", text: "Compartilhe cadernos, envie recados, suba no Ranking e conquiste medalhas junto com suas amigas." },
  { img: LUMI_NOTIFICACAO, tag: "Perfil", title: "Do seu Jeito", text: "Personalize seu perfil com as variações da Lumi, configure seu tema e receba lembretes importantes." },
];

export function NewOnboarding({ userId, onFinish }: { userId: string; onFinish: () => void }) {
  const [open, setOpen] = useState(true); // Começa aberto, pois o AppShell controla quando renderizar
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    }
  }, [open]);

  const finish = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setOpen(false);
      onFinish(); // Avisa o AppShell que terminou para ele abrir o GuidedTour
    }, 300);
  }, [onFinish]);

  const go = useCallback((n: number) => {
    if (n < 0) return;
    if (n >= STEPS.length) return finish();
    setDir(n > step ? 1 : -1);
    setStep(n);
  }, [step, finish]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, go, finish]);

  if (!open) return null;
  const s = STEPS[step] ?? STEPS[0]!;
  const last = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tour do RevisaFlash"
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-6 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <style>{`
        @keyframes rf-in-r{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:none}}
        @keyframes rf-in-l{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:none}}
        @keyframes rf-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
      `}</style>
      <div className="absolute inset-0 bg-[#290E1F]/70 backdrop-blur-sm" onClick={finish} />

      <div
        className={`relative flex h-full w-full flex-col overflow-hidden bg-[#FFF8F1] shadow-2xl transition-all duration-300 sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-[2rem] ${visible ? "scale-100 translate-y-0" : "scale-95 translate-y-4"}`}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <span className="flex items-center gap-1.5 rounded-full bg-[#FE7802]/10 px-3 py-1 text-xs font-semibold text-[#FE7802]">
            <Sparkles className="h-3.5 w-3.5" /> {step + 1} de {STEPS.length}
          </span>
          {!last && (
            <button onClick={finish} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[#290E1F]/60 transition hover:bg-[#290E1F]/5 hover:text-[#290E1F]">
              Pular <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div
          key={step}
          className="flex flex-1 flex-col items-center justify-center px-7 pb-4 pt-2 text-center"
          style={{ animation: `${dir === 1 ? "rf-in-r" : "rf-in-l"} .45s cubic-bezier(.2,.8,.2,1)` }}
        >
          <div className="relative mb-6 mt-2">
            <div className="absolute inset-0 -z-0 scale-110 rounded-full bg-[#FE7802]/20 blur-2xl" />
            <img
              src={s.img}
              alt={`Lumi — ${s.tag}`}
              className="relative h-48 w-48 rounded-[2.5rem] object-cover shadow-xl ring-4 ring-white sm:h-56 sm:w-56"
              style={{ animation: "rf-float 4s ease-in-out infinite" }}
            />
          </div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#FE7802]">{s.tag}</p>
          <h2 className="mb-3 text-2xl font-extrabold leading-tight text-[#290E1F] sm:text-3xl">{s.title}</h2>
          <p className="max-w-sm text-base leading-relaxed text-[#290E1F]/70">{s.text}</p>
        </div>

        <div className="px-5 pb-6 pt-2">
          <div className="mb-5 flex justify-center gap-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
                aria-label={`Ir para etapa ${i + 1}`}
                onClick={() => go(i)}
                className={`h-2.5 rounded-full transition-all duration-300 ${i === step ? "w-8 bg-[#FE7802]" : i < step ? "w-2.5 bg-[#FE7802]/50" : "w-2.5 bg-[#290E1F]/15"}`}
              />
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => go(step - 1)}
              disabled={step === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-[#290E1F]/10 py-3.5 font-semibold text-[#290E1F] transition hover:bg-[#290E1F]/5 disabled:pointer-events-none disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button
              onClick={() => go(step + 1)}
              className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-[#FE7802] py-3.5 font-bold text-white shadow-lg shadow-[#FE7802]/30 transition hover:-translate-y-0.5 hover:bg-[#e86c00] active:translate-y-0"
            >
              {last ? "Começar a estudar" : "Próximo"} {!last && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewOnboarding;