export const CRONOGRAMA_IMPORT_PROMPT = `Converta meu cronograma de estudos abaixo para o formato do template Excel do Una Vox.

O template tem 3 abas:

ABA 1 — "Rotina" (blocos semanais recorrentes):
Colunas: Dia | Início | Fim | Disciplina | Tópico (opcional) | Atividade | Cor (hex, opcional)
Exemplo: Segunda | 07:15 | 08:45 | Português | Sílaba e fonética | theory | #3B82F6
Dropdown Dia: Segunda, Terça, Quarta, Quinta, Sexta, Sábado, Domingo
Dropdown Atividade: theory, questions, review, cards, exam, break, other

ABA 2 — "Temas" (cronograma de temas por período):
Colunas: Período início (YYYY-MM-DD) | Período fim (YYYY-MM-DD) | Tipo | Disciplina | Tópico
Exemplo: 2026-09-21 | 2026-09-27 | semana | Português | Sílaba e fonética
Dropdown Tipo: semana, mês

ABA 3 — "Tarefas" (biblioteca genérica — OPCIONAL):
Colunas: Nome | Tipo | Duração (min) | Cor (hex) | Regra de tema
Exemplo: Teoria | theory | 90 | #3B82F6 | period
Dropdown Tipo: theory, questions, review, cards, exam, break, other
Dropdown Regra de tema: period, all, none

Regras:
- Se meu cronograma tem horários fixos todos os dias, coloque na aba "Rotina".
- Se tem temas por semana/mês, coloque na aba "Temas".
- Se tem atividades genéricas (ex: "Teoria 90min"), coloque na aba "Tarefas".
- Use o formato de data YYYY-MM-DD.
- Use o formato de horário HH:MM (24h).
- Se não souber a cor, use #3B82F6 (azul).

Meu cronograma:
[COLE AQUI SEU CRONOGRAMA — pode ser texto, PDF copiado, Excel, Notion, etc.]

Retorne APENAS o conteúdo das 3 abas em formato de tabela Markdown, pronto para eu copiar e colar no Excel.`;
