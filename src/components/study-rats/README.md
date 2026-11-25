# Study Rats v7 — protótipo visual (Una Vox) · estilo Instagram

Telas **somente visuais** (dados falsos, sem banco). Mesmo padrão da pasta `aulas-redesign/`.

## O que mudou da v3
- Feed estilo Instagram: stories com anel degradê (visto/não visto) + visualizador com barra de progresso, carrossel de fotos com pontinhos e contador 1/N, curtir com duplo toque (coração animado), compartilhar, salvar, "Curtido por X e outras N pessoas", chip da matéria, selo de tempo estudado sobre a foto.
- Comentários em painel inferior (bottom sheet) com atalhos de emoji.
- Nova publicação: foto quadrada, escolha da matéria, controle de tempo de estudo e legenda.
- Calendários: resumo (registros, horas, dias seguidos), dias com foto redonda, contador de registros, painel do dia e botão "Novo registro".
- **Meu perfil** (Comunidade › Study Rats): perfil do estudante igual ao Instagram — foto, publicações, amizades, horas estudadas, bio, "Editar perfil", "Nova publicação" e grade de publicações / Salvos.
- A Galeria saiu de Calendários: **tudo é postado pela Comunidade** e as fotos aparecem automaticamente no calendário.

## Novidades v7
- **Onde publicar**: ao criar (check-in ou publicação) escolha **Feed · para sempre** ou **Stories · 24h**, igual ao Instagram.
  - Story some depois de 24h; ao abrir, cada story passa sozinho em 5 segundos (tocar nas laterais volta/avança).
  - Story de texto vira cartão colorido com a categoria; story com foto mostra a foto + legenda.
  - Check-in postado como story **continua salvo no calendário** mesmo depois que o story some.
  - "Seu story" ganha anel quando há story ativo; o "+" pequeno cria outro. No seu story aparece "Visto por N pessoas · some em 24h".

## Novidades v6
- **Dois tipos de publicação** (escolhidos no botão "+" / "Criar"):
  - **Check-in de estudo**: foto obrigatória + matéria + tempo → aparece no feed, no perfil (aba Check-ins) **e no calendário**.
  - **Publicação**: dica de estudo, curiosidade, dúvida ou motivação, texto + disciplina e imagem opcionais → feed e perfil (aba Publicações), **não** vai para o calendário.
- Filtros no feed: Tudo · Check-ins · Dica de estudo · Curiosidade · Dúvida · Motivação.
- **Mobile**: barra inferior (Comunidade · + · Calendários), criar abre como painel de baixo.
- **Desktop**: coluna lateral com "Seu dia" (horas de hoje + Fazer check-in), "Em alta na comunidade" e "Sugestões para você"; botão "+" flutuante.

## Arquivos
- `StudyRatsFeed.tsx` — feed + stories + comentários + `NovaPublicacaoModal`.
- `StudyRatsPerfil.tsx` — perfil do estudante (grade estilo Instagram).
- `StudyRatsCalendario.tsx` — calendário (somente leitura) + visualizador; prop `onIrParaComunidade`.
- `StudyRatsStyles.tsx` — estilos locais com tokens do Una Vox (`--surface`, `--surface-2`, `--border`, `--primary`, `--accent`…).
- `mock-data.ts` — dados de exemplo + store local (`studyRatsStore`, `useStudyRats`) que simula o backend.
- `study-rats-store.test.ts` — teste da regra: só check-in vai para o calendário. `fotos-exemplo/` — fotos usadas no protótipo (copiar para `public/study-rats/` só para testar).

## Como usar
1. Copie a pasta para `src/components/study-rats/`.
2. Comunidade (`src/routes/comunidade.tsx`): aba `studyrats` no `BotaoTab`, renderizando `<StudyRatsFeed />`.
3. Calendários (`src/routes/calendario.tsx`): renderize `<StudyRatsCalendario />`.
