// Dados fake usados no protótipo visual. Nenhuma persistência.

export const USER = {
  name: "Dra. Mariana Silva",
  initials: "MS",
  plan: "Plano Residente",
  email: "mariana@revisaflash.app",
};

export const PROVA = {
  nome: "ENARE 2026",
  data: new Date(2026, 8, 13), // 13/09/2026
};

export const diasAteProva = () => {
  const today = new Date(2026, 5, 26); // congelado no protótipo
  return Math.ceil((PROVA.data.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export const STREAK = 12;
export const META_SEMANAL = { feito: 4, total: 6 };

export const GRANDES_AREAS = [
  { nome: "Patologia", icon: "🔬", erros: 12, total: 84 },
  { nome: "Cirurgia", icon: "💉", erros: 8, total: 62 },
  { nome: "Periodontia", icon: "🩸", erros: 14, total: 71 },
  { nome: "Endodontia", icon: "🦷", erros: 3, total: 48 },
  { nome: "Odontopediatria", icon: "👶", erros: 5, total: 39 },
  { nome: "Imaginologia", icon: "📷", erros: 7, total: 44 },
  { nome: "SUS", icon: "🏛️", erros: 9, total: 36 },
  { nome: "Farmacologia", icon: "💊", erros: 4, total: 52 },
  { nome: "Biossegurança", icon: "🧫", erros: 2, total: 28 },
  { nome: "Ética", icon: "⚖️", erros: 1, total: 22 },
  { nome: "Emergências", icon: "🚨", erros: 6, total: 31 },
  { nome: "Anatomia", icon: "🧬", erros: 5, total: 47 },
  { nome: "Odontologia Hospitalar", icon: "🏥", erros: 3, total: 25 },
];

export const DISCIPLINAS = [
  { nome: "Patologia Oral e Maxilofacial", topicos: 14, cards: 420, progresso: 72, status: "em-andamento" },
  { nome: "Cirurgia e Traumatologia BMF", topicos: 9, cards: 310, progresso: 42, status: "em-andamento" },
  { nome: "Periodontia", topicos: 6, cards: 185, progresso: 100, status: "concluido" },
  { nome: "Endodontia", topicos: 8, cards: 240, progresso: 28, status: "em-andamento" },
  { nome: "Odontopediatria", topicos: 5, cards: 145, progresso: 65, status: "em-andamento" },
  { nome: "Farmacologia", topicos: 4, cards: 96, progresso: 88, status: "em-andamento" },
  { nome: "Imaginologia", topicos: 6, cards: 132, progresso: 15, status: "iniciar" },
  { nome: "SUS e Saúde Coletiva", topicos: 5, cards: 88, progresso: 0, status: "iniciar" },
];

export const CHECKLIST_HOJE = [
  { id: 1, titulo: "Revisar Patologia Oral — lesões brancas", feito: true },
  { id: 2, titulo: "Resolver 20 questões ENARE 2024", feito: true },
  { id: 3, titulo: "Leitura: Cirurgia Bucomaxilofacial cap. 4", feito: false },
  { id: 4, titulo: "Flashcards — Periodontia (45 due)", feito: false },
  { id: 5, titulo: "Refazer erros da semana", feito: false },
];

export const REVISOES_HOJE = [
  { area: "Cariologia", topico: "Fisiopatologia da cárie e diagnóstico", cards: 12, hora: "08:30" },
  { area: "Periodontia", topico: "Classificação de doenças periodontais", cards: 45, hora: "13:00" },
  { area: "Farmacologia", topico: "Antibióticos em odontologia", cards: 18, hora: "20:00" },
];

export const PROXIMAS_REVISOES = [
  { area: "Endodontia", topico: "Preparo químico-mecânico", quando: "Amanhã", cards: 22 },
  { area: "Imaginologia", topico: "Radiologia periapical", quando: "Sex 28/06", cards: 9 },
  { area: "Patologia", topico: "Lesões fundamentais", quando: "Sáb 29/06", cards: 31 },
  { area: "Odontopediatria", topico: "Traumatismo dentário infantil", quando: "Seg 01/07", cards: 14 },
];

export const DECKS = [
  { id: "d1", nome: "Patologia Oral — Essencial", desc: "Lesões fundamentais, brancas, vermelhas e pigmentadas", total: 142, due: 14, novos: 8 },
  { id: "d2", nome: "Periodontia — Diagnóstico", desc: "Classificação 2017, índices e exame clínico", total: 96, due: 45, novos: 3 },
  { id: "d3", nome: "Cirurgia BMF", desc: "Exodontias, complicações e planejamento", total: 118, due: 6, novos: 12 },
  { id: "d4", nome: "Farmacologia em Odonto", desc: "Antibióticos, AINEs, anestésicos", total: 74, due: 0, novos: 5 },
];

export const FLASHCARD_DEMO = {
  area: "Patologia Oral",
  pergunta: "Qual o aspecto radiográfico característico do ameloblastoma multicístico?",
  resposta: "Imagem multilocular em \"favo de mel\" ou \"bolhas de sabão\", com reabsorção radicular frequente e expansão das corticais.",
  posicao: 14,
  total: 42,
};

// Heatmap 12 semanas x 7 dias (0-4)
export const HEATMAP: number[][] = Array.from({ length: 12 }, (_, w) =>
  Array.from({ length: 7 }, (_, d) => {
    const seed = (w * 7 + d) * 9301 + 49297;
    const r = (seed % 233280) / 233280;
    if (w > 9 && d > 3) return 0;
    return Math.min(4, Math.floor(r * 5));
  })
);

// Calendário: dias com estudo em junho/26 (atual)
export const ESTUDO_MES: Record<number, { teorico: boolean; pratico: boolean }> = {
  2: { teorico: true, pratico: false },
  3: { teorico: true, pratico: true },
  4: { teorico: true, pratico: false },
  6: { teorico: false, pratico: true },
  9: { teorico: true, pratico: true },
  10: { teorico: true, pratico: false },
  11: { teorico: true, pratico: true },
  12: { teorico: true, pratico: false },
  13: { teorico: true, pratico: true },
  16: { teorico: true, pratico: true },
  17: { teorico: true, pratico: false },
  18: { teorico: true, pratico: true },
  19: { teorico: true, pratico: false },
  20: { teorico: true, pratico: true },
  23: { teorico: true, pratico: true },
  24: { teorico: true, pratico: false },
  25: { teorico: true, pratico: true },
  26: { teorico: true, pratico: true },
};

export const DESEMPENHO_METRICAS = {
  acertosGerais: 78,
  cardsRevisados: 2412,
  horasEstudo: 184,
  questoesResolvidas: 1820,
};

export const ROTAS = [
  { to: "/", label: "Início", icon: "home" },
  { to: "/conteudo", label: "Conteúdo", icon: "book" },
  { to: "/calendario", label: "Calendário", icon: "calendar" },
  { to: "/erros", label: "Erros", icon: "alert" },
  { to: "/flashcards", label: "Flashcards", icon: "layers" },
  { to: "/desempenho", label: "Desempenho", icon: "chart" },
  { to: "/configuracoes", label: "Ajustes", icon: "settings" },
] as const;
