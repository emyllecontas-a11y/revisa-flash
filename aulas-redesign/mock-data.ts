// DADOS DE EXEMPLO (apenas visual). No app real, substituir pelos dados do aulaService.
export type Tone = "laranja" | "rosa" | "menta" | "lavanda";

export interface VideoMock { id: string; titulo: string; duracao: string }
export interface AulaMock {
  id: string;
  numero: number;
  assunto: string;
  subassunto?: string;
  titulo: string;
  descricao: string;
  estudada: boolean;
  baixada: boolean;
  novo?: boolean;
  videos: VideoMock[];
}
export interface DisciplinaMock {
  id: string;
  nome: string;
  professor: string;
  tone: Tone;
  aulas: AulaMock[];
}

const v = (prefix: string, titulos: string[]): VideoMock[] =>
  titulos.map((t, i) => ({ id: `${prefix}-v${i + 1}`, titulo: t, duracao: `${18 + ((i * 7) % 20)}:${(10 + i * 13) % 60}`.replace(/:(\d)$/, ":0$1") }));

export const DISCIPLINAS: DisciplinaMock[] = [
  {
    id: "direito-previdenciario",
    nome: "Direito Previdenciário",
    professor: "Profª Adriana Menezes",
    tone: "laranja",
    aulas: [
      { id: "dp-00", numero: 0, assunto: "Seguridade Social", titulo: "Aula 00", descricao: "Seguridade Social. Origem e evolução legislativa no Brasil. Conceituação. Organização e princípios constitucionais.", estudada: false, baixada: true, novo: true,
        videos: v("dp-00", ["Seguridade Social - Origem e Evolução", "Seguridade Social - Conceito e Organização - Parte I", "Seguridade Social - Conceito e Organização - Parte II", "Princípios da Seguridade Social - Parte 01", "Princípios da Seguridade Social - Parte 02"]) },
      { id: "dp-01", numero: 1, assunto: "Seguridade Social", subassunto: "Custeio", titulo: "Aula 01", descricao: "Financiamento da Seguridade Social. Contribuições sociais. Salário de contribuição.", estudada: true, baixada: true,
        videos: v("dp-01", ["Financiamento - Visão geral", "Contribuições sociais", "Salário de contribuição"]) },
      { id: "dp-02", numero: 2, assunto: "Regime Geral", subassunto: "Segurados", titulo: "Aula 02", descricao: "Segurados obrigatórios e facultativos. Filiação e inscrição. Manutenção e perda da qualidade de segurado.", estudada: false, baixada: false,
        videos: v("dp-02", ["Segurados obrigatórios", "Segurado facultativo", "Qualidade de segurado"]) },
      { id: "dp-03", numero: 3, assunto: "Regime Geral", subassunto: "Benefícios", titulo: "Aula 03", descricao: "Aposentadorias. Auxílios. Pensão por morte. Salário-maternidade e salário-família.", estudada: false, baixada: false,
        videos: v("dp-03", ["Aposentadorias - Parte I", "Aposentadorias - Parte II", "Auxílios", "Pensão por morte"]) },
    ],
  },
  {
    id: "lingua-portuguesa", nome: "Língua Portuguesa", professor: "Prof. Carlos Moura", tone: "rosa",
    aulas: [
      { id: "lp-00", numero: 0, assunto: "Interpretação", titulo: "Aula 00", descricao: "Compreensão e interpretação de textos. Tipologia e gêneros textuais.", estudada: true, baixada: true, videos: v("lp-00", ["Compreensão x Interpretação", "Tipologia textual", "Gêneros textuais"]) },
      { id: "lp-01", numero: 1, assunto: "Gramática", subassunto: "Morfologia", titulo: "Aula 01", descricao: "Classes de palavras. Emprego de pronomes. Tempos e modos verbais.", estudada: false, baixada: true, novo: true, videos: v("lp-01", ["Classes de palavras", "Pronomes", "Verbos"]) },
      { id: "lp-02", numero: 2, assunto: "Gramática", subassunto: "Sintaxe", titulo: "Aula 02", descricao: "Concordância nominal e verbal. Regência. Crase.", estudada: false, baixada: false, videos: v("lp-02", ["Concordância", "Regência", "Crase"]) },
    ],
  },
  {
    id: "raciocinio-logico", nome: "Raciocínio Lógico", professor: "Prof. Renato Lima", tone: "menta",
    aulas: [
      { id: "rl-00", numero: 0, assunto: "Lógica Proposicional", titulo: "Aula 00", descricao: "Proposições. Conectivos lógicos. Tabelas-verdade.", estudada: false, baixada: false, videos: v("rl-00", ["Proposições", "Conectivos", "Tabelas-verdade"]) },
      { id: "rl-01", numero: 1, assunto: "Lógica Proposicional", subassunto: "Equivalências", titulo: "Aula 01", descricao: "Equivalências lógicas. Negação de proposições compostas.", estudada: false, baixada: false, videos: v("rl-01", ["Equivalências", "Negações"]) },
    ],
  },
  {
    id: "direito-constitucional", nome: "Direito Constitucional", professor: "Profª Júlia Santos", tone: "lavanda",
    aulas: [
      { id: "dc-00", numero: 0, assunto: "Teoria da Constituição", titulo: "Aula 00", descricao: "Conceito, classificação e elementos das constituições. Poder constituinte.", estudada: true, baixada: true, videos: v("dc-00", ["Conceito de Constituição", "Classificações", "Poder constituinte"]) },
      { id: "dc-01", numero: 1, assunto: "Direitos Fundamentais", titulo: "Aula 01", descricao: "Direitos e deveres individuais e coletivos. Remédios constitucionais.", estudada: false, baixada: true, videos: v("dc-01", ["Art. 5º - Parte I", "Art. 5º - Parte II", "Remédios constitucionais"]) },
    ],
  },
];

export const getDisciplina = (id: string) => DISCIPLINAS.find((d) => d.id === id);
export const progresso = (d: DisciplinaMock) =>
  Math.round((d.aulas.filter((a) => a.estudada).length / Math.max(d.aulas.length, 1)) * 100);
