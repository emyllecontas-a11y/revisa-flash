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

// TAXONOMIA COMPLETA
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
  },
  {
    "disciplina": "Português",
    "materias": [
      {
        "nome": "Ortografia",
        "topicos": [
          { "nome": "Ortografia - Casos Gerais e Emprego das Letras", "subtopicos": [] },
          { "nome": "Fatos da Língua Portuguesa (Porque, Por Que, Po...", "subtopicos": [] },
          { "nome": "Inicial Maiúscula", "subtopicos": [] },
          { "nome": "Acentuação", "subtopicos": [] },
          { "nome": "Uso do Hífen", "subtopicos": [] },
          { "nome": "Convenções de Escrita (Itálico, Siglas, etc)", "subtopicos": [] },
          { "nome": "Questões Mescladas de Ortografia", "subtopicos": [] }
        ]
      },
      { "nome": "Fonética (Fonemas, Dígrafos, Encontros Consonantais...", "topicos": [] },
      {
        "nome": "Morfologia",
        "topicos": [
          { "nome": "Formação e Estrutura das Palavras", "subtopicos": [] },
          {
            "nome": "Classes de Palavras",
            "subtopicos": [
              "Artigo", "Substantivo", "Adjetivo",
              "Verbo - Conjugação. Reconhecimento e Empreg...",
              "Verbo - Correlação Verbal", "Verbo - Locução Verbal",
              "Verbo - Questões Variadas de Verbo",
              "Pronomes - Pronomes Pessoais", "Pronomes - Pronomes de Tratamento",
              "Pronomes - Pronomes Possessivos", "Pronomes - Pronomes Indefinidos",
              "Pronomes - Pronomes Interrogativos", "Pronomes - Pronomes Demonstrativos",
              "Pronomes - Pronomes Relativos", "Pronomes - Questões Mescladas sobre Pronomes",
              "Advérbio", "Numeral", "Preposição", "Conjunção", "Interjeição"
            ]
          }
        ]
      },
      { "nome": "Colocação Pronominal", "topicos": [] },
      {
        "nome": "Semântica",
        "topicos": [
          { "nome": "Sinônimos e Antônimos", "subtopicos": [] },
          { "nome": "Homônimos e Parônimos", "subtopicos": [] },
          { "nome": "Denotação e Conotação", "subtopicos": [] },
          { "nome": "Polissemia", "subtopicos": [] },
          { "nome": "Ordenação de Parágrafos", "subtopicos": [] },
          { "nome": "Significação de Vocábulo e Expressões", "subtopicos": [] }
        ]
      },
      {
        "nome": "Sintaxe",
        "topicos": [
          { "nome": "Frase, Oração e Período", "subtopicos": [] },
          {
            "nome": "Funções Sintáticas",
            "subtopicos": [
              "Termos Essenciais da Oração - Sujeito",
              "Termos Essenciais da Oração - Predicado",
              "Transitividade Verbal e Termos Integrantes (C...",
              "Termos Acessórios (Adjunto Adnominal, Adju...",
              "Adjunto adnominal x Complemento Nomina..."
            ]
          },
          { "nome": "Orações Coordenadas", "subtopicos": [] },
          { "nome": "Orações Subordinadas Substantivas", "subtopicos": [] },
          { "nome": "Orações Subordinadas Adjetivas", "subtopicos": [] },
          { "nome": "Orações Subordinadas Adverbiais", "subtopicos": [] },
          { "nome": "Orações Reduzidas", "subtopicos": [] },
          { "nome": "Funções Sintáticas dos Pronomes Relativos", "subtopicos": [] },
          { "nome": "Função Sintática dos Pronomes Pessoais Átonos...", "subtopicos": [] }
        ]
      },
      { "nome": "Pontuação (Ponto, Vírgula, Travessão, Aspas, Parêntes...", "topicos": [] },
      {
        "nome": "Regência",
        "topicos": [
          { "nome": "Regência Nominal e Verbal (Casos Gerais)", "subtopicos": [] },
          { "nome": "Crase", "subtopicos": [] }
        ]
      },
      { "nome": "Concordância (Verbal e Nominal)", "topicos": [] },
      { "nome": "Vozes (Voz Passiva e Voz Ativa)", "topicos": [] },
      { "nome": "Coerência. Coesão (Anáfora, Catáfora, Uso dos Conect...", "topicos": [] },
      { "nome": "Tipos de Discurso (Direto, Indireto e Indireto Livre)", "topicos": [] },
      {
        "nome": "Linguagem",
        "topicos": [
          { "nome": "Variações da Linguagem: Não Verbal, Regional, H...", "subtopicos": [] },
          { "nome": "Linguagem Formal e Informal", "subtopicos": [] },
          { "nome": "Figuras de Linguagem", "subtopicos": [] },
          { "nome": "Vícios de Linguagem (Pleonasmo, Ambiguidade, ...", "subtopicos": [] },
          { "nome": "Elementos da Comunicação e Funções da Lingua...", "subtopicos": [] }
        ]
      },
      { "nome": "Partícula \"Se\"", "topicos": [] },
      { "nome": "Vocábulo \"Como\"", "topicos": [] },
      { "nome": "Vocábulo \"Que\"", "topicos": [] },
      { "nome": "Interpretação de Textos (Compreensão)", "topicos": [] },
      { "nome": "Tipologia e Gênero Textual", "topicos": [] },
      { "nome": "Paralelismo", "topicos": [] },
      { "nome": "Reescrita de Frases. Substituição de Palavras ou Trech...", "topicos": [] },
      { "nome": "Clareza e Correção", "topicos": [] }
    ]
  },
  {
    "disciplina": "Matemática",
    "materias": [
      {
        "nome": "Conjuntos",
        "topicos": [
          { "nome": "Definição, Subconjuntos, Inclusão e Pertinência, ...", "subtopicos": [] },
          { "nome": "Número de Elementos da União, da Intersecção, ...", "subtopicos": [] },
          {
            "nome": "Números Naturais",
            "subtopicos": [
              "Números Naturais: Introdução, Representaçã...",
              "Adição, Subtração, Multiplicação e Divisão de...",
              "Divisibilidade, Números Primos, Fatores Prim..."
            ]
          },
          { "nome": "Números Inteiros (Propriedades, Operações, Mód...", "subtopicos": [] },
          {
            "nome": "Números Racionais",
            "subtopicos": [
              "Números Racionais: Introdução, Representaçã...",
              "Frações e Dízimas Periódicas",
              "Operações com Números Decimais"
            ]
          },
          { "nome": "Radiciação e Potenciação", "subtopicos": [] },
          { "nome": "Números Irracionais", "subtopicos": [] },
          { "nome": "Números Reais (Propriedades e Operações; Interv...", "subtopicos": [] },
          { "nome": "Expressões Aritméticas", "subtopicos": [] }
        ]
      },
      { "nome": "Expressões Algébricas", "topicos": [] },
      { "nome": "Sistemas de Numeração (Decimal, Binário, Hexadecim...", "topicos": [] },
      {
        "nome": "Proporcionalidade",
        "topicos": [
          { "nome": "Proporções. Grandezas Proporcionais. Divisão em...", "subtopicos": [] },
          {
            "nome": "Regra de Três",
            "subtopicos": [
              "Regra de Três Simples",
              "Regra de Três Composta"
            ]
          },
          { "nome": "Exercícios envolvendo Velocidade, Espaço, Temp...", "subtopicos": [] },
          { "nome": "Porcentagem", "subtopicos": [] }
        ]
      },
      { "nome": "Interpretação de Gráficos e Tabelas", "topicos": [] },
      { "nome": "Unidades de Medida (Distância, Massa, Volume, Temp...", "topicos": [] },
      { "nome": "Sistema Monetário", "topicos": [] },
      { "nome": "Análise Combinatória (Princípio Fundamental da Cont...", "topicos": [] },
      {
        "nome": "Equações",
        "topicos": [
          { "nome": "Equações de Primeiro Grau", "subtopicos": [] },
          { "nome": "Equações de Segundo Grau e Equações Biquadra...", "subtopicos": [] },
          { "nome": "Equações Exponenciais", "subtopicos": [] },
          { "nome": "Equações Logarítmicas", "subtopicos": [] }
        ]
      },
      { "nome": "Produtos Notáveis", "topicos": [] },
      { "nome": "Polinômios e Equações Polinomiais. Expansão de Binô...", "topicos": [] },
      { "nome": "Logaritmo", "topicos": [] },
      {
        "nome": "Sequências numéricas",
        "topicos": [
          { "nome": "Progressão Aritmética", "subtopicos": [] },
          { "nome": "Progressão Geométrica", "subtopicos": [] },
          { "nome": "Outras Sequências Numéricas (Termo Geral, Reco...", "subtopicos": [] }
        ]
      },
      {
        "nome": "Funções e Inequações",
        "topicos": [
          { "nome": "Definição, Interpretação Gráfica, Injetora/Sobreje...", "subtopicos": [] },
          { "nome": "Função de Primeiro Grau", "subtopicos": [] },
          { "nome": "Inequações de Primeiro Grau (Inequações Simult...", "subtopicos": [] },
          { "nome": "Função de Segundo Grau", "subtopicos": [] },
          { "nome": "Inequações de Segundo Grau", "subtopicos": [] },
          { "nome": "Função Exponencial e Inequações Exponenciais", "subtopicos": [] },
          { "nome": "Função Logarítmica e Inequações Logarítmicas", "subtopicos": [] },
          { "nome": "Funções Modulares, Equações Modulares e Inequ...", "subtopicos": [] },
          { "nome": "Função Composta", "subtopicos": [] },
          { "nome": "Função Inversa", "subtopicos": [] }
        ]
      },
      { "nome": "Razões e Funções Trigonométricas. Ciclo Trigonométr...", "topicos": [] },
      {
        "nome": "Álgebra Linear Elementar",
        "topicos": [
          { "nome": "Matrizes", "subtopicos": [] },
          { "nome": "Determinantes", "subtopicos": [] },
          { "nome": "Sistemas Lineares", "subtopicos": [] }
        ]
      },
      { "nome": "Números Complexos", "topicos": [] },
      {
        "nome": "Geometria Plana",
        "topicos": [
          { "nome": "Ponto, Reta, Plano, Segmentos de Reta: Proposiç...", "subtopicos": [] },
          { "nome": "Teorema de Tales", "subtopicos": [] },
          {
            "nome": "Ângulos",
            "subtopicos": [
              "Definição, Medida, Congruência, Classificaçã...",
              "Ângulos Alternos, Colaterais, Correspondente...",
              "Cálculo de Ângulos entre Ponteiros do Relóg...",
              "Outras Questões sobre Ângulos"
            ]
          },
          {
            "nome": "Triângulos",
            "subtopicos": [
              "Triângulos: Conceito, Elementos e Classificaç...",
              "Congruência e Semelhança de Triângulos. Ra...",
              "Desigualdade Triangular",
              "Soma dos Ângulos Internos do Triângulo",
              "Área e Perímetro do Triângulo",
              "Pontos Notáveis (Baricentro, Incentro, Circun...",
              "Teoremas da Bissetriz Interna e Externa",
              "Cálculo de Seno e Cosseno no Triângulo Retâ...",
              "Relações Métricas no Triângulo Retângulo (Ir...",
              "Lei dos Senos e Lei dos Cossenos"
            ]
          },
          { "nome": "Quadriláteros (Propriedades, Área, Perímetro, So...", "subtopicos": [] },
          {
            "nome": "Outros Polígonos",
            "subtopicos": [
              "Definição e Classificação de Polígonos",
              "Número de Diagonais de Um Polígono Qualqu...",
              "Soma dos Ângulos Internos de Um Polígono...",
              "Área e Perímetro de Um Polígono Qualquer",
              "Polígonos Regulares (Medida do Lado, Diago...",
              "Semelhança entre Polígonos. Razão de Seme...",
              "Outros Tópicos e Questões Mescladas sobre ..."
            ]
          },
          {
            "nome": "Circunferência e Círculo",
            "subtopicos": [
              "Definição, Elementos e Propriedades (Circun...",
              "Setor e Segmento Circular. Comprimento de...",
              "Comprimento da Circunferência e do Arco de...",
              "Área do Círculo, do Setor Circular e do Segme...",
              "Reta Tangente e Secante à Circunferência",
              "Posições Relativas de Duas Circunferências",
              "Potência de Ponto",
              "Polígonos Inscritos e Circunscritos à Circunfe...",
              "Ângulos Central, Inscrito e Semi-Inscrito"
            ]
          }
        ]
      },
      {
        "nome": "Geometria Espacial",
        "topicos": [
          { "nome": "Conceitos Iniciais de Geometria Espacial (poliedr...", "subtopicos": [] },
          { "nome": "Prismas", "subtopicos": [] },
          { "nome": "Pirâmides", "subtopicos": [] },
          { "nome": "Cilindros", "subtopicos": [] },
          { "nome": "Cones", "subtopicos": [] },
          { "nome": "Esferas", "subtopicos": [] },
          { "nome": "Sólidos Compostos", "subtopicos": [] }
        ]
      },
      { "nome": "Geometria Analítica", "topicos": [] },
      { "nome": "Notação Científica", "topicos": [] }
    ]
  },
  {
    "disciplina": "Raciocínio Lógico",
    "materias": [
      {
        "nome": "Lógica de Proposições",
        "topicos": [
          { "nome": "Proposições: Definição, Reconhecimento, Princíp...", "subtopicos": [] },
          { "nome": "Operadores Lógicos (Representação Simbólica; D...", "subtopicos": [] },
          { "nome": "Tabela Verdade das Proposições Compostas", "subtopicos": [] },
          { "nome": "Ordem de Precedência entre os Conectivos", "subtopicos": [] },
          { "nome": "Condição Necessária e Suficiente", "subtopicos": [] },
          { "nome": "Tautologia, Contradição e Contingência", "subtopicos": [] },
          { "nome": "Equivalências Lógicas (Inclui Negação de Proposi...", "subtopicos": [] },
          { "nome": "Álgebra de Proposições", "subtopicos": [] },
          {
            "nome": "Lógica de Argumentação",
            "subtopicos": [
              "Argumentos - Métodos Decorrentes da Tabel...",
              "Diagramas Lógicos, Proposições Categóricas...",
              "Raciocínio Crítico",
              "Argumentos Indutivos, Argumentos por Abdu...",
              "Falácias"
            ]
          },
          { "nome": "Lógica de Primeira Ordem", "subtopicos": [] }
        ]
      },
      { "nome": "Associação de Informações", "topicos": [] },
      { "nome": "Exercícios de \"Verdade/Mentira\"", "topicos": [] },
      { "nome": "Sequências de Números, Figuras, Letras e Palavras", "topicos": [] },
      { "nome": "Orientação no Plano, no Espaço e no Tempo", "topicos": [] },
      { "nome": "Princípio da Casa dos Pombos", "topicos": [] },
      { "nome": "Problemas Envolvendo Balança de Pratos", "topicos": [] },
      { "nome": "Exercícios Envolvendo Datas e Calendários", "topicos": [] },
      { "nome": "Sudoku e Jogos Similares", "topicos": [] },
      { "nome": "Planificação de Sólidos. Projeções de Objetos Tridime...", "topicos": [] },
      { "nome": "Problemas Envolvendo Palitos", "topicos": [] },
      { "nome": "Questões Envolvendo Parentesco e Árvores Genealógi...", "topicos": [] }
    ]
  },
  {
    "disciplina": "Informática",
    "materias": [
      { "nome": "Conceitos Gerais de Informática e Introdução...", "topicos": [] },
      {
        "nome": "Hardware",
        "topicos": [
          { "nome": "Processador (CPU) e Arquitetura de Computador", "subtopicos": [] },
          { "nome": "Memórias (RAM, ROM, CACHE, HD, etc.)", "subtopicos": [] },
          { "nome": "Barramentos, Placa-mãe e BIOS", "subtopicos": [] },
          { "nome": "Periféricos (Dispositivos de Entrada e Saída)", "subtopicos": [] },
          { "nome": "Nobreak e Estabilizadores", "subtopicos": [] },
          { "nome": "Tipos de Computadores", "subtopicos": [] },
          { "nome": "Questões Mescladas de Hardware", "subtopicos": [] }
        ]
      },
      {
        "nome": "Sistemas Operacionais",
        "topicos": [
          { "nome": "Conceitos Gerais de Sistemas Operacionais e Sist...", "subtopicos": [] },
          {
            "nome": "Windows",
            "subtopicos": [
              "Windows 11", "Windows 10", "Windows 8", "Windows 7", "Windows Vista", "Windows XP", "Windows 2000 e Versões Anteriores"
            ]
          },
          { "nome": "Linux / Unix", "subtopicos": [] },
          { "nome": "MS-DOS", "subtopicos": [] }
        ]
      },
      {
        "nome": "Suítes de Escritório",
        "topicos": [
          { "nome": "Editores de Texto", "subtopicos": ["Word", "Writer (LibreOffice)"] },
          { "nome": "Planilhas Eletrônicas", "subtopicos": ["Excel", "Calc (LibreOffice)"] },
          { "nome": "Editores de Apresentações", "subtopicos": ["Powerpoint", "Impress (LibreOffice)"] },
          { "nome": "OneNote", "subtopicos": [] },
          { "nome": "Questões Mescladas de Microsoft Office", "subtopicos": [] },
          { "nome": "Questões Mescladas de Libre Office", "subtopicos": [] },
          { "nome": "Questões Mescladas de Suítes de Escritório", "subtopicos": [] }
        ]
      },
      {
        "nome": "Redes de Computadores",
        "topicos": [
          { "nome": "Conceitos, Modelos, Tipos e Topologias de Redes", "subtopicos": [] },
          { "nome": "Equipamentos, Meios de Transmissão e Conexão", "subtopicos": [] },
          { "nome": "Protocolos de Redes", "subtopicos": [] }
        ]
      },
      {
        "nome": "Internet",
        "topicos": [
          { "nome": "Conceitos de Internet", "subtopicos": [] },
          { "nome": "Intranet e Extranet", "subtopicos": [] },
          {
            "nome": "Navegadores (Browsers)",
            "subtopicos": ["Internet Explorer", "Mozilla Firefox", "Google Chrome", "Microsoft Edge", "Safari"]
          },
          {
            "nome": "Correio Eletrônico (E-mail)",
            "subtopicos": ["Recursos, Campos, Endereçamento (Correio...", "Outlook", "Outlook Express", "Mozilla Thunderbird", "Webmails"]
          },
          { "nome": "Sites de Busca (Google, Bing, Yahoo, etc.)", "subtopicos": [] },
          { "nome": "Redes Sociais (Facebook, WhatsApp, etc.)", "subtopicos": [] },
          { "nome": "Grupos Colaborativos e de Discussão", "subtopicos": [] },
          {
            "nome": "Computação em Nuvem (Cloud Computing)",
            "subtopicos": ["Conceitos e Tipos de Computação em Nuvem", "Google Workspace", "Nuvens Microsoft (OneDrive e Azure)", "Dropbox"]
          },
          { "nome": "Serviços de Mapas e Localização (Google Maps, W...", "subtopicos": [] },
          { "nome": "Microsoft Teams", "subtopicos": [] },
          { "nome": "Aplicativos para Videoconferência (Zoom, Google...", "subtopicos": [] }
        ]
      },
      {
        "nome": "Segurança da Informação",
        "topicos": [
          { "nome": "Conceitos e Princípios de Segurança da Informaç...", "subtopicos": [] },
          { "nome": "Ameaças (Vírus, Worms, Trojans, Malware, etc.)", "subtopicos": [] },
          {
            "nome": "Recursos (Segurança da Informação)",
            "subtopicos": [
              "Firewall e Proxy",
              "Antivírus e Antispyware",
              "Procedimentos de Segurança da Informação",
              "Demais Recursos (IDS, VPN, etc.)"
            ]
          },
          { "nome": "Criptografia, Assinatura e Certificado Digital", "subtopicos": [] },
          { "nome": "Backup", "subtopicos": [] }
        ]
      },
      { "nome": "Compactadores e Descompactadores (Winzip, Winrar,...", "topicos": [] },
      { "nome": "Extensão de Arquivos", "topicos": [] },
      { "nome": "Adobe PDF", "topicos": [] }
    ]
  },
  {
    "disciplina": "Legislação Aplicada à EBSERH",
    "materias": [
      {
        "nome": "Legislação Aplicada à EBSERH",
        "topicos": [
          { "nome": "Lei nº 12.550/2011 - Cria a Empresa Brasileira de Serviços Hospitalares", "subtopicos": [] },
          { "nome": "Estatuto Social da EBSERH", "subtopicos": [] },
          { "nome": "Norma Operacional de Controle Disciplinar da EBSERH", "subtopicos": [] },
          { "nome": "Regimento Interno da EBSERH", "subtopicos": [] },
          { "nome": "Regulamento de Pessoal da EBSERH", "subtopicos": [] },
          { "nome": "Demais Normas e Documentos da EBSERH", "subtopicos": [] }
        ]
      }
    ]
  },
  {
    "disciplina": "SUS",
    "materias": [
      {
        "nome": "Lei nº 8.080/1990 (Lei Orgânica da Saúde) e Saúde Pública",
        "topicos": [
          { "nome": "Das Disposições Gerais (arts. 1º a 3º da Lei nº 8.080/1990)", "subtopicos": [] },
          {
            "nome": "Do Sistema Único de Saúde (arts. 4º a 19-U da Lei nº 8.080/1990)",
            "subtopicos": [
              "Dos Objetivos e Atribuições",
              "Dos Princípios e Diretrizes",
              "Da Organização, da Direção e da Gestão",
              "Da Competência e das Atribuições",
              "Do Subsistema de Atenção à Saúde Indígena",
              "Do Subsistema de Atendimento e Internação Domiciliar",
              "Do Subsistema de Acompanhamento durante o Trabalho de Parto, Parto e Pós-Parto",
              "Da Assistência Terapêutica e da Incorporação de Tecnologia em Saúde"
            ]
          },
          { "nome": "Dos Serviços Privados de Assistência à Saúde (arts. 20 a 26 da Lei nº 8.080/1990)", "subtopicos": [] },
          { "nome": "Da Telessaúde (arts. 26-A a 26-H da Lei nº 8.080/1990)", "subtopicos": [] },
          { "nome": "Dos Recursos Humanos (arts. 27 a 30 da Lei nº 8.080/1990)", "subtopicos": [] },
          { "nome": "Do Financiamento (arts. 31 a 38 da Lei nº 8.080/1990)", "subtopicos": [] },
          { "nome": "Das Disposições Finais e Transitórias (arts. 39 a 55 da Lei nº 8.080/1990)", "subtopicos": [] },
          { "nome": "Tópicos Mesclados e Doutrinários da Lei nº 8.080/1990", "subtopicos": [] }
        ]
      },
      {
        "nome": "Decreto nº 7.508/2011 - Regulamenta a Lei nº 8.080/1990",
        "topicos": []
      },
      {
        "nome": "Lei nº 8.142/1990 - Participação na Gestão do SUS e Transferências Intergovernamentais de Recursos Financeiros",
        "topicos": []
      },
      {
        "nome": "Lei Complementar nº 141/2012 - Regulamenta o § 3º do art. 198 da Constituição Federal",
        "topicos": []
      },
      {
        "nome": "Normas e Portarias do Ministério da Saúde",
        "topicos": [
          { "nome": "Assistência Farmacêutica", "subtopicos": [] },
          { "nome": "Direitos e Deveres dos Usuários do SUS (Portaria MS nº 1.820/2009)", "subtopicos": [] },
          { "nome": "Educação em Saúde", "subtopicos": [] },
          { "nome": "Estrutura, Financiamento, Gestão e Planejamento do SUS", "subtopicos": [] },
          { "nome": "Medicamentos", "subtopicos": [] },
          { "nome": "Normas Operacionais do SUS", "subtopicos": [] },
          { "nome": "Pactos do Ministério da Saúde", "subtopicos": [] },
          {
            "nome": "Políticas, Planos e Programas de Saúde Pública",
            "subtopicos": [
              "Política Nacional de Atenção Básica - Saúde da Família",
              "Política Nacional de Saúde Bucal",
              "Política Nacional de Alimentação e Nutrição",
              "Política Nacional de Humanização - HumanizaSUS",
              "Política Nacional de Promoção da Saúde",
              "Lei nº 12.871/2013 - Programa Mais Médicos",
              "Decreto nº 9.761/2019 - Política Nacional sobre Drogas",
              "Portaria MS nº 2.979/2019 - Programa Previne Brasil"
            ]
          },
          { "nome": "Redes de Atenção à Saúde (RAS)", "subtopicos": [] },
          { "nome": "Vigilância em Saúde", "subtopicos": [] }
        ]
      },
      {
        "nome": "Saúde do Servidor Público Federal",
        "topicos": []
      },
      {
        "nome": "Classificação Internacional de Funcionalidade (CIF)",
        "topicos": []
      },
      {
        "nome": "Saúde Pública Internacional - Organização Mundial da Saúde",
        "topicos": []
      },
      {
        "nome": "Resoluções do CNS",
        "topicos": []
      },
      {
        "nome": "Portaria Interministerial nº 1.010/2006 - Alimentação Saudável nas Escolas",
        "topicos": []
      },
      {
        "nome": "Decreto nº 6.286/2007 - Programa Saúde na Escola",
        "topicos": []
      },
      {
        "nome": "Lei nº 13.979/2020 - Medidas para Enfrentamento da Emergência de Saúde Pública",
        "topicos": []
      },
      {
        "nome": "Lei Complementar nº 173/2020 - Programa Federativo de Enfrentamento ao Coronavírus",
        "topicos": []
      },
      {
        "nome": "Manual Brasileiro de Acreditação Hospitalar (MBAH)",
        "topicos": []
      },
      {
        "nome": "Normas Estaduais e Municipais da Saúde",
        "topicos": []
      },
      {
        "nome": "História da Saúde no Brasil",
        "topicos": []
      }
    ]
  }
];

// Força o app a ler sempre o código, ignorando cache antigo do navegador
export function getTaxonomia(): TaxonomiaDisciplina[] {
  return TAXONOMIA_BASE;
}