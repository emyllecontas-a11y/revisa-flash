// src/services/taxonomiaService.ts

export interface TaxonomiaTopico {
  nome: string;
  subtopicos: string[];
}

export interface TaxonomiaMateria {
  nome: string;
  topicos: TaxonomiaTopico[];
}

export interface TaxonomiaDisciplina {
  disciplina: string;
  materias: TaxonomiaMateria[];
}

// AQUI ESTÁ O JSON DO CLAUDE EMBUTIDO NO CÓDIGO
const TAXONOMIA_BASE: TaxonomiaDisciplina[] = [
  {
    "disciplina": "Odontologia",
    "materias": [
      { "nome": "Histologia e Embriologia Oral", "topicos": [] },
      {
        "nome": "Anatomia de Cabeça e Pescoço",
        "topicos": [
          { "nome": "Osteologia (Crânio, Face, Maxila e Mandíbula)", "subtopicos": [] },
          { "nome": "Miologia", "subtopicos": [] },
          { "nome": "Vascularização", "subtopicos": [] },
          { "nome": "Inervação", "subtopicos": [] },
          { "nome": "Outros Tópicos de Anatomia da Cabeça e Pescoço...", "subtopicos": [] }
        ]
      },
      {
        "nome": "Anatomia Dentária e Oclusão",
        "topicos": [
          { "nome": "Anatomia e Funções Dentárias", "subtopicos": [] },
          { "nome": "Propriedades e Características dos Tecidos Dentá...", "subtopicos": [] },
          { "nome": "Periodonto de Proteção, Sustentação e Processo...", "subtopicos": [] },
          { "nome": "Erupção Dentária Cronologia e Características", "subtopicos": [] },
          { "nome": "Notação Dentária", "subtopicos": [] },
          { "nome": "Classificação e Características da Maloclusão", "subtopicos": [] },
          { "nome": "Relações, Posições e Movimentos Mandibulares", "subtopicos": [] },
          { "nome": "Diagnóstico e Tratamento das Maloclusões", "subtopicos": [] },
          { "nome": "Outros Assuntos de Anatomia e Oclusão", "subtopicos": [] }
        ]
      },
      {
        "nome": "Odontologia Preventiva, Saúde Bucal Coletiva, Clínica...",
        "topicos": [
          { "nome": "Processo Saúde-Doença", "subtopicos": [] },
          { "nome": "Relação Paciente-Profissional", "subtopicos": [] },
          { "nome": "História Natural das Doenças e Medidas Preventiv...", "subtopicos": [] },
          {
            "nome": "Epidemiologia das Doenças Bucais",
            "subtopicos": [
              "Conceitos de Epidemiologia",
              "Principais Índices de Cárie Dental",
              "Principais Índices Periodontais"
            ]
          },
          { "nome": "Níveis de Prevenção e Aplicação em Odontologia...", "subtopicos": [] },
          { "nome": "Educação e Promoção da Saúde Bucal (Saúde Co...", "subtopicos": [] },
          { "nome": "Políticas de Saúde Bucal no Brasil", "subtopicos": [] },
          { "nome": "Atendimento Odontológico Domiciliar", "subtopicos": [] },
          { "nome": "Outros Assuntos de Odontologia Preventiva, Saú...", "subtopicos": [] }
        ]
      },
      {
        "nome": "Farmacologia (Odontologia)",
        "topicos": [
          { "nome": "Farmacocinética e Farmacodinâmica", "subtopicos": [] },
          { "nome": "Analgésicos e Anti-inflamatórios - Classificação e...", "subtopicos": [] },
          { "nome": "Antimicrobianos (Antibióticos e Antifúngicos) - Cl...", "subtopicos": [] },
          { "nome": "Profilaxia Antibiótica", "subtopicos": [] },
          { "nome": "Controle do Medo e da Ansiedade em Odontologi...", "subtopicos": [] },
          { "nome": "Prescrição Médica (Receita) e Regulamentação do...", "subtopicos": [] },
          { "nome": "Interações Medicamentosas", "subtopicos": [] },
          { "nome": "Outros Assuntos de Farmacologia", "subtopicos": [] }
        ]
      },
      {
        "nome": "Anestesiologia",
        "topicos": [
          { "nome": "Farmacologia dos Anestésicos Locais", "subtopicos": [] },
          { "nome": "Farmacologia dos Vasos Constritores", "subtopicos": [] },
          { "nome": "Avaliação Física e Psicológica do Paciente", "subtopicos": [] },
          { "nome": "Anatomia aplicada à Anestesiologia", "subtopicos": [] },
          { "nome": "Classificação, Composição e Dosimetria dos Anes...", "subtopicos": [] },
          { "nome": "Técnicas de Anestesia", "subtopicos": [] },
          { "nome": "Acidentes e Complicações em Anestesia Odontolo...", "subtopicos": [] },
          { "nome": "Outros Assuntos de Anestesiologia", "subtopicos": [] }
        ]
      },
      {
        "nome": "Radiologia e Imaginologia Odontológica",
        "topicos": [
          { "nome": "Constituição e Funcionamento dos Aparelhos de...", "subtopicos": [] },
          { "nome": "Filmes e Processamento Radiográfico", "subtopicos": [] },
          { "nome": "Interpretação Radiográfica", "subtopicos": [] },
          { "nome": "Técnicas Radiográficas", "subtopicos": [] },
          { "nome": "Efeitos Biológicos da Radiação", "subtopicos": [] },
          { "nome": "Proteção Radiológica", "subtopicos": [] },
          { "nome": "Métodos Avançados de Diagnóstico por Imagem", "subtopicos": [] },
          { "nome": "Outros Assuntos de Radiologia e Imaginologia", "subtopicos": [] }
        ]
      },
      {
        "nome": "Cariologia",
        "topicos": [
          { "nome": "Conceitos e Considerações Gerais de Cariologia", "subtopicos": [] },
          { "nome": "Tipos, Localização e Sintomas da Cárie.", "subtopicos": [] },
          { "nome": "Etiologia e Fatores de Risco da Cárie Dental", "subtopicos": [] },
          { "nome": "Saliva (Cariologia)", "subtopicos": [] },
          { "nome": "Microbiologia da Cárie", "subtopicos": [] },
          { "nome": "Dieta e Metabolismo dos Carboidratos", "subtopicos": [] },
          {
            "nome": "Prevenção da Cárie Dental",
            "subtopicos": [
              "Higiene Oral e Técnicas de Escovação",
              "Materiais e Técnicas de Aplicação (Cariologia...",
              "Controle do Biofilme Dental",
              "Fluorterapia - Indicação/Contraindicação e Generalidad...",
              "Fluorterapia - Mecanismo de Ação",
              "Fluorterapia - Técnicas de Aplicação",
              "Fluorterapia - Toxicologia do Flúor e Concentrações Ind...",
              "Fluorterapia - Fluorose Dentária - Aspectos Clínicos e E..."
            ]
          },
          { "nome": "Diagnóstico e Tratamento da Cárie", "subtopicos": [] },
          { "nome": "Processo de Desmineralização e Remineralização", "subtopicos": [] },
          { "nome": "Outros Assuntos de Cariologia", "subtopicos": [] }
        ]
      },
      { "nome": "Laserterapia", "topicos": [] },
      {
        "nome": "Periodontia",
        "topicos": [
          { "nome": "Anatomia do Periodonto", "subtopicos": [] },
          { "nome": "Diagnóstico", "subtopicos": [] },
          { "nome": "Placa Bacteriana e Cálculo Dental", "subtopicos": [] },
          { "nome": "Classificação, Condições e Características da Doe...", "subtopicos": [] },
          { "nome": "Relações entre Doenças Periodontais e Saúde Sis...", "subtopicos": [] },
          { "nome": "Abcessos Periodontais e Lesões Endopério...", "subtopicos": [] },
          { "nome": "Etiopatogenia e Fatores de Risco em Periodontia", "subtopicos": [] },
          { "nome": "Tratamento da Doença Periodontal", "subtopicos": [] },
          { "nome": "Cirurgia Periodontal", "subtopicos": [] },
          { "nome": "Classificação, Características e Tratamento das Le...", "subtopicos": [] },
          { "nome": "Prevenção da Doença Periodontal", "subtopicos": [] },
          { "nome": "Instrumentais de Periodontia", "subtopicos": [] },
          { "nome": "Outros Assuntos de Periodontia", "subtopicos": [] }
        ]
      },
      {
        "nome": "Materiais Dentários",
        "topicos": [
          { "nome": "Selantes Odontológicos", "subtopicos": [] },
          {
            "nome": "Cimentos Odontológicos",
            "subtopicos": [
              "Cimentos de Ionômero de Vidro",
              "Demais Cimentos Odontológicos (Fosfato de..."
            ]
          },
          { "nome": "Resina Composta", "subtopicos": [] },
          { "nome": "Materiais de Moldagem, Gesso, Revestimento e Co...", "subtopicos": [] },
          { "nome": "Amálgama", "subtopicos": [] },
          { "nome": "Sistemas Adesivos", "subtopicos": [] },
          { "nome": "Sistemas Cerâmicos", "subtopicos": [] },
          { "nome": "Resina Acrílica", "subtopicos": [] },
          { "nome": "Outros Materiais Odontológicos", "subtopicos": [] }
        ]
      },
      {
        "nome": "Dentística",
        "topicos": [
          { "nome": "Diagnóstico e Plano de Tratamento em Dentística...", "subtopicos": [] },
          { "nome": "Isolamento do Campo Operatório", "subtopicos": [] },
          { "nome": "Odontologia Minimamente Invasiva e Tratamento...", "subtopicos": [] },
          { "nome": "Proteção do Complexo Dentinopulpar", "subtopicos": [] },
          { "nome": "Preparos Cavitários e Técnicas de Restauração", "subtopicos": [] },
          { "nome": "Abordagem Restauradora de Dentes Tratados End...", "subtopicos": [] },
          { "nome": "Instrumentais de Dentística", "subtopicos": [] },
          { "nome": "Outros Assuntos de Dentística", "subtopicos": [] }
        ]
      },
      {
        "nome": "Endodontia",
        "topicos": [
          { "nome": "Anatomia da Cavidade Pulpar e Topografia do Pe...", "subtopicos": [] },
          { "nome": "Microbiologia Endodôntica", "subtopicos": [] },
          { "nome": "Alterações Pulpares e Periapicais", "subtopicos": [] },
          { "nome": "Diagnóstico em Endodontia e Generalidades", "subtopicos": [] },
          { "nome": "Tratamento Conservador da Polpa Dental", "subtopicos": [] },
          { "nome": "Substâncias Químicas Auxiliares e Medicação Intr...", "subtopicos": [] },
          { "nome": "Abertura, Condutometria, Limpeza e Modelagem...", "subtopicos": [] },
          { "nome": "Técnicas de Obturação de Canais e Materiais Utili...", "subtopicos": [] },
          { "nome": "Retratamento Endodôntico", "subtopicos": [] },
          { "nome": "Emergência e Urgências em Endodontia", "subtopicos": [] },
          { "nome": "Cirurgias Paraendodônticas", "subtopicos": [] },
          { "nome": "Endodontia em Dentes com Rizogênese Incomple...", "subtopicos": [] },
          { "nome": "Complicações Endodônticas", "subtopicos": [] },
          { "nome": "Instrumentais Endodônticos", "subtopicos": [] },
          { "nome": "Outros Assuntos de Endodontia", "subtopicos": [] }
        ]
      },
      {
        "nome": "Prótese",
        "topicos": [
          { "nome": "Preparos Protéticos, Términos Cervicais", "subtopicos": [] },
          { "nome": "Técnicas de Moldagem, Moldes, Modelos e Troque...", "subtopicos": [] },
          { "nome": "Prótese Total", "subtopicos": [] },
          { "nome": "Prótese Parcial Removível (PPR)", "subtopicos": [] },
          { "nome": "Prótese Fixa", "subtopicos": [] },
          { "nome": "Núcleos Protéticos", "subtopicos": [] },
          { "nome": "Articuladores", "subtopicos": [] },
          { "nome": "Provisórios em Prótese", "subtopicos": [] },
          { "nome": "Fase Laboratorial de Prótese Dentária e Ligas Met...", "subtopicos": [] },
          { "nome": "Cimentação, Classificação dos Arcos Edentados e...", "subtopicos": [] },
          { "nome": "Técnico de Prótese Dental e Atribuições", "subtopicos": [] },
          { "nome": "Instrumentais de Prótese", "subtopicos": [] },
          { "nome": "Outros Assuntos de Prótese", "subtopicos": [] }
        ]
      },
      {
        "nome": "Cirurgia",
        "topicos": [
          { "nome": "Princípios Cirúrgicos", "subtopicos": [] },
          { "nome": "Processos de Cicatrização, Cura e Reparação", "subtopicos": [] },
          { "nome": "Indicações e Contraindicações da Cirurgia", "subtopicos": [] },
          { "nome": "Avaliação Pré e Pós-operatória e Orientações", "subtopicos": [] },
          { "nome": "Planejamento e Técnicas Cirúrgicas", "subtopicos": [] },
          { "nome": "Acidentes Operatórios e Complicações Cirúrgicas...", "subtopicos": [] },
          { "nome": "Traumatologia Buco-Maxilo-facial", "subtopicos": [] },
          { "nome": "Classificação de Dentes Impactados", "subtopicos": [] },
          { "nome": "Instrumentais de Cirurgia", "subtopicos": [] },
          { "nome": "Outros Assuntos de Cirurgia", "subtopicos": [] }
        ]
      },
      { "nome": "Implantodontia", "topicos": [] },
      {
        "nome": "Ortodontia",
        "topicos": [
          { "nome": "Princípios e Conceitos de Ortodontia", "subtopicos": [] },
          { "nome": "Diagnóstico, Planejamento e Tratamento", "subtopicos": [] },
          { "nome": "Técnica Ortodônticas", "subtopicos": [] },
          { "nome": "Crescimento Craniofacial", "subtopicos": [] },
          { "nome": "Análise Cefalométrica", "subtopicos": [] },
          { "nome": "Aparelhos Ortodônticos (Fixos e Móveis)", "subtopicos": [] },
          { "nome": "Mini-implantes em Ortodontia", "subtopicos": [] },
          { "nome": "Materiais Ortodônticos (Fios, Braquetes, Elásticos...", "subtopicos": [] },
          { "nome": "Instrumentais de Ortodontia", "subtopicos": [] },
          { "nome": "Outros Assuntos de Ortodontia", "subtopicos": [] }
        ]
      },
      {
        "nome": "Estomatologia e Patologia Bucal",
        "topicos": [
          { "nome": "Conceitos, Fundamentos e Generalidades", "subtopicos": [] },
          { "nome": "Exames Complementares", "subtopicos": [] },
          { "nome": "Alterações do Desenvolvimento Oral e Maxilofacia...", "subtopicos": [] },
          { "nome": "Anomalias Dentárias", "subtopicos": [] },
          { "nome": "Infecções Bacterianas", "subtopicos": [] },
          { "nome": "Infecções Fúngicas e Protozoárias", "subtopicos": [] },
          { "nome": "Infecções Virais", "subtopicos": [] },
          { "nome": "Neoplasias Benignas", "subtopicos": [] },
          { "nome": "Neoplasias Malignas", "subtopicos": [] },
          { "nome": "Neoplasia dos Tecidos Moles", "subtopicos": [] },
          { "nome": "Cistos e Tumores Odontogênicos", "subtopicos": [] },
          { "nome": "Patologia Óssea", "subtopicos": [] },
          { "nome": "Patologia das Glândulas Salivares", "subtopicos": [] },
          { "nome": "Doenças Dermatológicas e Patologia Epitelial", "subtopicos": [] },
          { "nome": "Manifestações Orais de Doenças Sistêmicas e Tera...", "subtopicos": [] },
          { "nome": "Lesões com Potencial de Malignização", "subtopicos": [] },
          { "nome": "Doenças Alérgicas e Imunológicas", "subtopicos": [] },
          { "nome": "Dor Facial e Doenças Neuromusculares", "subtopicos": [] },
          { "nome": "Doenças Hematológicas", "subtopicos": [] },
          { "nome": "Alterações Herdadas e Congênitas", "subtopicos": [] },
          { "nome": "Distúrbios Hormonais e Metabólicos", "subtopicos": [] },
          { "nome": "Síndromes", "subtopicos": [] },
          { "nome": "Outros Assuntos de Estomatologia", "subtopicos": [] }
        ]
      },
      { "nome": "Emergências Médicas em Odontologia", "topicos": [] },
      {
        "nome": "Odontopediatria",
        "topicos": [
          { "nome": "Cariologia e Controle da Placa em Odontopediat...", "subtopicos": [] },
          { "nome": "Anestesiologia em Odontopediatria", "subtopicos": [] },
          { "nome": "Terapêutica Medicamentosa em Crianças", "subtopicos": [] },
          { "nome": "Dentística em Odontopediatria", "subtopicos": [] },
          { "nome": "Endodontia em Odontopediatria", "subtopicos": [] },
          { "nome": "Prótese em Odontopediatria", "subtopicos": [] },
          { "nome": "Cirurgia em Odontopediatria", "subtopicos": [] },
          { "nome": "Periodontia e Afecções Estomatológicas em Odon...", "subtopicos": [] },
          { "nome": "Radiologia Infantil", "subtopicos": [] },
          { "nome": "Odontologia Materno-Infantil: Abordagem para G...", "subtopicos": [] },
          { "nome": "Hábitos Bucais, Dieta e Manejo Comportamental", "subtopicos": [] },
          { "nome": "Outros Assuntos de Odontopediatria", "subtopicos": [] }
        ]
      },
      { "nome": "Odontogeriatria", "topicos": [] },
      {
        "nome": "Manejo de Pacientes com Condições Especiais",
        "topicos": [
          { "nome": "Manejo de Pacientes com Comprometimento Sist...", "subtopicos": [] },
          { "nome": "Manejo de Pacientes Gestantes", "subtopicos": [] },
          { "nome": "Manejo de Pacientes Portadores de Necessidades...", "subtopicos": [] }
        ]
      },
      {
        "nome": "Biossegurança",
        "topicos": [
          { "nome": "Conceitos e Princípios de Biossegurança", "subtopicos": [] },
          { "nome": "Classificação, Fluxo, Processamento e Armazenar...", "subtopicos": [] },
          { "nome": "Processamento de Superfícies e Preparo de Ambi...", "subtopicos": [] },
          { "nome": "Antissépticos, Desinfetantes, Esterilizantes e Desi...", "subtopicos": [] },
          { "nome": "Métodos de Esterilização e Monitoramento", "subtopicos": [] },
          { "nome": "Equipamentos de Proteção Individual (EPI)", "subtopicos": [] },
          { "nome": "Imunização dos Profissionais de Saúde", "subtopicos": [] },
          { "nome": "Doenças Transmissíveis no Consultório Odontoló...", "subtopicos": [] },
          { "nome": "Acidentes de Trabalho e Conduta Após Exposição...", "subtopicos": [] },
          { "nome": "Gerenciamento dos Resíduos em Consultório Odo...", "subtopicos": [] },
          { "nome": "Higienização das Mãos", "subtopicos": [] },
          { "nome": "Controle e Prevenção de Infecções", "subtopicos": [] },
          { "nome": "Outros Assuntos de Biossegurança", "subtopicos": [] }
        ]
      },
      { "nome": "Bioética odontológica", "topicos": [] },
      {
        "nome": "Odontologia Legal",
        "topicos": [
          { "nome": "Auditorias e Perícias Odontológicas", "subtopicos": [] },
          { "nome": "Documentos Odontolegais", "subtopicos": [] },
          { "nome": "Traumatologia Forense", "subtopicos": [] },
          { "nome": "Tanatologia Forense", "subtopicos": [] },
          { "nome": "Antropologia Forense", "subtopicos": [] },
          { "nome": "Estimativa de Idade por meio do Estudo dos Dent...", "subtopicos": [] },
          { "nome": "Marcas e Mordidas: Coleta e Estudos Comparativo...", "subtopicos": [] },
          { "nome": "Exames de Imagem na Identificação Odontológic...", "subtopicos": [] },
          { "nome": "Outros Assuntos de Odontologia Legal", "subtopicos": [] }
        ]
      },
      {
        "nome": "Articulação temporomandibular (ATM)",
        "topicos": [
          { "nome": "Disfunções, Diagnóstico e Tratamento", "subtopicos": [] },
          { "nome": "Anatomia da ATM", "subtopicos": [] },
          { "nome": "Movimentos e Músculos da ATM", "subtopicos": [] },
          { "nome": "Outros Assuntos de Articulação Temporomandibu...", "subtopicos": [] }
        ]
      },
      { "nome": "Odontologia hospitalar", "topicos": [] },
      { "nome": "Odontologia do Trabalho", "topicos": [] },
      { "nome": "Ergonomia em Odontologia", "topicos": [] },
      { "nome": "Equipamentos Odontológicos", "topicos": [] },
      { "nome": "Pessoal Auxiliar e suas Funções no Consultório Odonto...", "topicos": [] },
      { "nome": "Estética Dental", "topicos": [] },
      { "nome": "Demais Instrumentais Odontológicos", "topicos": [] },
      { "nome": "Traumatismo Dentoalveolar", "topicos": [] },
      { "nome": "Procedimentos Clínicos Integrados", "topicos": [] },
      { "nome": "Anatomia Geral, Fisiologia, Funções e Outros", "topicos": [] }
    ]
  }
];

// Agora o app sempre lê o código. (Mantive o localStorage apenas por segurança, caso queira editar no futuro).
export function getTaxonomia(): TaxonomiaDisciplina[] {
  try {
    const raw = localStorage.getItem('revisaflash_taxonomia_tec');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return TAXONOMIA_BASE;
}