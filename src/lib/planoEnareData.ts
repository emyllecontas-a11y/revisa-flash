// src/lib/planoEnareData.ts
// Plano "Revisa Emylle" — 26 semanas, transcrito do PDF.
// Formato de cada dia: [detalhe do Português, "BLOCOS extras"]
// Blocos extras: "SIGLA:tema|detalhe" separados por ";"
//   M = Matemática · RL = Raciocínio Lógico · I = Informática
// Odontologia e SUS/EBSERH são os mesmos todos os dias da semana.

export interface PlanoBloco {
  k: string;
  t: string;
  d?: string;
}
export interface PlanoSemana {
  n: number;
  dias: PlanoBloco[][];
}

type DiaRaw = [string, string];
type SemanaRaw = [number, string, string, string, DiaRaw[]];

const RV = 'Revisão geral (todas as pastas)|Questões + revisão de erros';
const RLI = `RL:${RV};I:${RV}`;
const Q = 'Questões + revisão de erros';
const MQ = `M:Revisão geral|${Q}`;

const SEMANAS: SemanaRaw[] = [
  [1, 'Sílaba, acentuação e fonética', 'Patologia', 'SUS: História do SUS', [
    ['Fonética e estudo da sílaba (1–8)', 'M:Teoria dos conjuntos|Aula 1–6'],
    ['Acentuação gráfica (9–14)', 'RL:Estruturas lógicas|Proposições (1–4);I:Redes de computadores|Vídeos 1–6'],
    ['Hífen (15–19)', 'M:Teoria dos conjuntos|Aula 7-12'],
    ['Expressões problemáticas (20–23)', 'RL:Estruturas lógicas|Proposição composta, simbologia, negação (5–9);I:Redes de computadores|Vídeos 7–11'],
    ['Questões (24–26)', 'M:Teoria dos conjuntos|Aula 13-18'],
  ]],
  [2, 'Classes de Palavras', 'Periodontia', 'EBSERH: Lei 12.550', [
    ['Substantivo (1-5)', 'M:Conjuntos - naturais, inteiros e racionais|Aula 1-2'],
    ['Adjetivo (6-13)', 'RL:Estruturas lógicas|Negação (10–11);I:Redes de computadores|Vídeos 12–16'],
    ['Plural (14-18)', 'M:Conjuntos - irracionais, reais|Aula 3-4'],
    ['Pronomes pessoais (19-24)', 'RL:Estruturas lógicas|Tabela-verdade (12–16);I:Redes de computadores|Vídeos 17–21'],
    ['Pronomes (25-28)', 'M:Conjuntos - princípio da inclusão-exclusão|Aula 5-7'],
  ]],
  [3, 'Classes de Palavras', 'Endodontia', 'SUS: CF 88 e determinantes sociais', [
    ['Pronomes demonstrativos (29-32)', 'M:Operações com números naturais, inteiros e racionais|Aula 1-17'],
    ['Pronomes relativos (33-36)', 'RL:Estruturas lógicas|Ordem de precedência (18–22);I:Redes de computadores|Vídeos 22–26'],
    ['Pronomes relativos (37-41)', 'M:Operações com decimais, dízimas e potências|Aula 18-32'],
    ['Advérbios (42-46)', 'RL:Estruturas lógicas|Construção de tabelas-verdade (23-25);I:Redes de computadores|Vídeos 27–31'],
    ['Artigo, numeral e interjeição (47-52)', 'M:Operações com radicais e questões|Aula 33-51'],
  ]],
  [4, 'Conectivos', 'Cariologia', 'EBSERH: Lei 12.550', [
    ['Preposição (1-2)', 'M:Potências de dez, notação científica e ordem de grandeza|Aula 1-3'],
    ['Conjunções coordenativas (3)', 'RL:Estruturas lógicas|Construção de tabelas-verdade (26-30);I:Intranet e extranet|Vídeos 1–4'],
    ['Conjunções subordinativas (4)', 'M:Sistemas de medidas|Aula 4-5'],
    ['Questões', 'RL:Estruturas lógicas|Tautologia (31-34);I:Intranet e extranet|Vídeos 5–8'],
    ['Revisão', 'M:Questões e revisão'],
  ]],
  [5, 'Verbos', 'Cirurgia', 'SUS: Lei 8080', [
    ['Tempos verbais', 'M:Múltiplos e MMC|Aula 1-3'],
    ['Tempos verbais', 'RL:Estruturas lógicas|Contradição, sentenças e paradoxos (35–39);I:Ferramentas web|Vídeos 1–3'],
    ['Desinências verbais', 'M:Divisores e MDC|Aula 4-5'],
    ['Particípio, infinitivo e gerúndio', 'RL:Estruturas lógicas|Leitura da condicional e bicondicional (40–45);I:Ferramentas web|Vídeos 4–7'],
    ['Verbos irregulares', 'M:Questões e revisão|Aula 6-9'],
  ]],
  [6, 'Verbos', 'Farmacologia', 'SUS: Lei 8142', [
    ['Verbos irregulares', 'M:Frações|Aula 1-6'],
    ['Verbos ear/iar e defectivos', 'RL:Equivalências lógicas|Equivalências "se..então" (1-3);I:Segurança da informação|Vídeos 1–4'],
    ['Correlação de tempos verbais', 'M:Frações|Aula 7-10'],
    ['Transitividade verbal', 'RL:Equivalências lógicas|Negações "e..ou" "se...então" (4-6);I:Segurança da informação|Vídeos 5–8'],
    ['Transitividade verbal', 'M:Razão e proporção|Aula 11-17'],
  ]],
  [7, 'Verbos', 'Prótese', 'EBSERH: Regimento interno', [
    ['Complementos verbais', 'M:Regra de três simples|Aula 1-2'],
    ['Vozes verbais', 'RL:Equivalências lógicas|Exercício de fixação (7-10);I:Segurança da informação|Vídeos 9–12'],
    ['Vozes verbais', 'M:Regra de três composta|Aula 3-4'],
    ['Reescritura de vozes verbais', 'RL:Equivalências lógicas|Negações "ou...ou" "se e somente se" (11-14);I:Segurança da informação|Vídeos 13–15'],
    ['Reescritura de vozes verbais', 'M:Questões e revisão|Aula 5'],
  ]],
  [8, 'Verbos', 'Materiais Dentários', 'SUS: Decreto 7508 e PNAB', [
    ['Reescritura de vozes verbais', 'M:Porcentagem|Aula 1-3'],
    ['Reescritura de vozes verbais', 'RL:Equivalências lógicas|Negações "ou...ou" "se e somente se" (15-19);I:Planilhas eletrônicas — MS-Excel|Vídeos 1–8'],
    ['Verbos impessoais e auxiliares', 'M:Porcentagem|Aula 4-6'],
    ['Verbos pronominais', 'RL:Equivalências lógicas|Distributividade e questões (20-25);I:Planilhas eletrônicas — MS-Excel|Vídeos 9–16'],
    ['Revisão de verbos', 'M:Questões e revisão|Aula 7-8'],
  ]],
  [9, 'Formação de palavras', 'Dentística', 'EBSERH: Código de ética', [
    ['Aulas 1–2', 'M:Equações do 1º grau|Aula 1-4'],
    ['Aulas 3–6', 'RL:Diagramas lógicos|Proposições categóricas (1–3);I:Planilhas eletrônicas — MS-Excel|Vídeos 17–23'],
    ['Aulas 7–8', 'M:Equações do 1º grau|Aula 5-9'],
    ['Aulas 9–12', 'RL:Diagramas lógicos|Negações de proposições categóricas (4–9);I:Planilhas eletrônicas — MS-Excel|Vídeos 24–30'],
    ['Aulas 13–14', 'M:Equações do 1º grau|Aula 10-14'],
  ]],
  [10, 'Análise sintática', 'Odontopediatria', 'SUS: Planejamento e financiamento', [
    ['Conceitos iniciais', 'M:Equações do 1º grau|Aula 15-19'],
    ['Tipos de sujeito', 'RL:Lógica de argumentação|Implicações lógicas (1–4);I:Planilhas eletrônicas — LibreOffice Calc|Vídeos 1–9'],
    ['Predicação verbal', 'M:Equações do 1º grau|Aula 20-26'],
    ['Predicação verbal', 'RL:Lógica de argumentação|Implicações lógicas (5–9);I:Planilhas eletrônicas — LibreOffice Calc|Vídeos 10–18'],
    ['Tipos de predicado', 'M:Equações do 1º grau|Aula 27-29'],
  ]],
  [11, 'Análise sintática', 'Anestesiologia', 'SUS: RAS', [
    ['Termos essenciais', 'M:Geometria plana|Aula 1'],
    ['Termos integrantes', 'RL:Lógica de argumentação|Argumento válido (10-14);I:Processadores de texto — MS-Word|Vídeos 1–8'],
    ['Termos integrantes', 'M:Geometria plana|Aula 2'],
    ['Termos acessórios', 'RL:Lógica de argumentação|Questões (15-18);I:Processadores de texto — MS-Word|Vídeos 9–16'],
    ['Termos acessórios', 'M:Geometria plana|Aula 3'],
  ]],
  [12, 'Análise sintática', 'Biossegurança', 'EBSERH: Estatuto social', [
    ['Predicativo do sujeito', 'M:Geometria plana|Aula 4'],
    ['Adjunto adnominal e predicativo', 'RL:Lógica de argumentação|Representação por diagramas (19-23);I:Processadores de texto — LibreOffice Writer|Vídeos 1–2'],
    ['Período composto', 'M:Questões'],
    ['Orações coordenadas sindéticas', 'RL:Lógica de argumentação|Supondo que a conclusão é falsa (24-26);I:Processadores de texto — LibreOffice Writer|Vídeo 3'],
    ['Orações subordinadas substantivas', 'M:Questões'],
  ]],
  [13, 'Análise sintática', 'Trauma Dentoalveolar', 'SUS: PNH', [
    ['Orações adjetivas, restritivas e explicativas', 'M:Geometria espacial - prismas|Aula 1-2'],
    ['Orações subordinadas adverbiais', 'RL:Lógica de argumentação|Regras de inferência (27-31);I:Ferramentas de apresentação|Vídeos 1–3'],
    ['Orações reduzidas', 'M:Geometria espacial - prismas|Aula 3-5'],
    ['Orações reduzidas', 'RL:Lógica de argumentação|Questões e revisão (32-40);I:Ferramentas de apresentação|Vídeos 4–5'],
    ['Orações reduzidas', 'M:Geometria espacial - pirâmides|Aula 6-8'],
  ]],
  [14, 'Análise sintática', 'Radiologia', 'EBSERH: Estatuto social', [
    ['Palavra QUE', 'M:Geometria espacial - pirâmides|Aula 9-11'],
    ['Palavra SE', 'RL:Formação de conceito, verdades e mentiras|Formação de conceito (1–2);I:Sistemas operacionais|Vídeos 1–4'],
    ['Palavra SE', 'M:Geometria espacial - cilindros|Aula 12-14'],
    ['Colocação pronominal', 'RL:Formação de conceito, verdades e mentiras|Verdades e mentiras (3–6);I:Sistemas operacionais|Vídeos 5–7'],
    ['Colocação pronominal', 'M:Geometria espacial - cones|Aula 15-17'],
  ]],
  [15, 'Pontuação', 'Saúde coletiva', 'SUS: NOBS, RDC 63', [
    ['Vírgula', 'M:Geometria espacial - esfera|Aula 18-19'],
    ['Vírgula', 'RL:Raciocínio sequencial|Vídeos 1–2;I:(semana livre no seu cronograma)|Livre ou revisão geral'],
    ['Vírgula', 'M:Geometria espacial - questões'],
    ['Ponto e vírgula, dois pontos e aspas', 'RL:Raciocínio sequencial|Vídeos 3–4;I:(semana livre no seu cronograma)|Livre ou revisão geral'],
    ['Travessão, parênteses e hífen', 'M:Geometria espacial - questões'],
  ]],
  [16, 'Concordância', 'Pacientes sistem. Comprometidos', 'SUS: Bioética e NR 32', [
    ['Aulas 1–3', 'M:Matrizes e determinantes|Aula 1-6'],
    ['Aulas 1–2', `RL:Orientação temporal|Vídeos 1–3;I:${RV}`],
    ['Aulas 3–6', 'M:Matrizes e determinantes|Aula 7-12'],
    ['Aulas 7–8', `RL:Orientação temporal|Vídeos 4–5;I:${RV}`],
    ['Aulas 9–12', 'M:Matrizes e determinantes|Aula 13-19'],
  ]],
  [17, 'Regência', 'ATM', 'EBSERH: Regulamento de pessoal', [
    ['Aulas 1–3', 'M:Matrizes e determinantes|Aula 20-25'],
    ['Aulas 4–6', `RL:Orientação espacial|Vídeos 1–3;I:${RV}`],
    ['Aulas 7–8', 'M:Matrizes e determinantes|Aula 26-32'],
    ['Aulas 9–13', `RL:Orientação espacial|Vídeos 4–5;I:${RV}`],
    ['Regência nominal', 'M:Matrizes e determinantes|Aula 33-39'],
  ]],
  [18, 'Crase e Coesão/Coerência', 'Emergências Médicas*', 'SUS: Segurança do paciente', [
    ['Aulas 1–2', 'M:Sistemas lineares|Aula 1-4'],
    ['Aulas 3–6', `RL:Associações lógicas|Vídeos 1–2;I:${RV}`],
    ['Aulas 7–11', 'M:Sistemas lineares|Aula 5-6'],
    ['Coesão sequencial', `RL:Associações lógicas|Vídeo 3;I:${RV}`],
    ['Coesão referencial', 'M:Sistemas lineares|Aula 7-9'],
  ]],
  [19, 'Semântica', 'Anatomia Dentária/Oclusão*', 'EBSERH: Norma operacional', [
    ['Sentido próprio e figurado', 'M:Análise combinatória|Aula 1-6'],
    ['Sinônimo e antônimo', `RL:${RV};I:${RV}`],
    ['Hiperonímia e hiponímia', 'M:Análise combinatória|Aula 7-12'],
    ['Homônimos e parônimos', `RL:${RV};I:${RV}`],
    ['Polissemia', 'M:Análise combinatória|Aula 13-17'],
  ]],
  [20, 'Figuras de linguagem', 'Código de Ética', 'SUS: Políticas de equidade', [
    ['Aula 1', 'M:Análise combinatória|Aula 18-22'],
    ['Aula 2', RLI],
    ['Aula 3', 'M:Análise combinatória|Aula 23-27'],
    ['Aula 4', RLI],
    ['Aula 5-7', 'M:Análise combinatória|Aula 28-32'],
  ]],
  [21, 'Tipologia textual', 'Revisão geral (1/6)', 'SUS: PNEPS', [
    ['Tipologia textual', 'M:Probabilidade|Aula 1-2'],
    ['Tipos de descrição', RLI],
    ['Dissertação expositiva e argumentativa', 'M:Probabilidade|Aula 3-4'],
    ['Modalizador', RLI],
    ['Texto injuntivo e linguagem verbal/não-verbal', 'M:Probabilidade|Aula 5-7'],
  ]],
  [22, 'Interpretação de texto', 'Revisão geral (2/6)', 'SUS: PNHOSP', [
    ['Recorrência', 'M:Probabilidade|Aula 8-10'],
    ['Inferência', RLI],
    ['Questões', 'M:Probabilidade|Aula 11-12'],
    ['Questões', RLI],
    ['Questões', 'M:Probabilidade|Aula 13-15'],
  ]],
  [23, 'Revisão geral', 'Revisão geral (3/6)', 'SUS: PNVS', [
    [Q, MQ],
    [Q, `RL:Simulado de RL|Simulado + correção;I:${RV}`],
    [Q, MQ],
    [Q, `RL:Simulado de RL|Simulado + correção;I:${RV}`],
    [Q, MQ],
  ]],
  [24, 'Revisão geral', 'Simulado geral', 'SUS: Sistemas de informação', [
    [Q, MQ],
    [Q, 'RL:Revisão de erros do simulado|Revisão;I:Simulado de Informática|Simulado + correção'],
    [Q, MQ],
    [Q, 'RL:Revisão de erros do simulado|Revisão;I:Simulado de Informática|Simulado + correção'],
    [Q, MQ],
  ]],
  [25, 'Revisão geral', 'Revisão de erros', 'SUS: Direitos e deveres do usuário', [
    [Q, MQ],
    [Q, 'RL:Revisão de erros do simulado|Revisão;I:Revisão de erros do simulado|Revisão'],
    [Q, MQ],
    [Q, 'RL:Revisão de erros do simulado|Revisão;I:Revisão de erros do simulado|Revisão'],
    [Q, MQ],
  ]],
  [26, 'Simulado final', 'Simulado final de Odontologia', 'Simulado final SUS/EBSERH', [
    ['Simulado + correção', 'M:Simulado final|Simulado + correção'],
    ['Simulado + correção', 'RL:Simulado final|Simulado + correção;I:Simulado final|Simulado + correção'],
    ['Simulado + correção', 'M:Simulado final|Simulado + correção'],
    ['Simulado + correção', 'RL:Simulado final|Simulado + correção;I:Simulado final|Simulado + correção'],
    ['Simulado + correção', 'M:Simulado final|Simulado + correção'],
  ]],
];

function parseBloco(raw: string): PlanoBloco {
  const i = raw.indexOf(':');
  const k = raw.slice(0, i);
  const [t, d] = raw.slice(i + 1).split('|');
  return d ? { k, t, d } : { k, t };
}

export function gerarSemanasEnare(): PlanoSemana[] {
  return SEMANAS.map(([n, pt, od, sus, dias]) => ({
    n,
    dias: dias.map(([pDet, extras]) => [
      { k: 'P', t: pt, d: pDet },
      ...extras.split(';').filter(Boolean).map(parseBloco),
      { k: 'OD', t: od },
      { k: 'SUS', t: sus },
    ]),
  }));
}

export const NOME_PLANO_ENARE = 'ENARE 2026 — Revisa Emylle (26 semanas)';