# Prompt para implementar a parte funcional do novo visual de Aulas

Cole o texto abaixo na IA que edita o código do RevisaFlash:

---

Recebi um novo visual para a aba de Aulas na pasta `src/components/aulas-redesign/` (DisciplinasGrid.tsx, TopicosLista.tsx, AulaDetalhe.tsx, AulasRedesignStyles.tsx e mock-data.ts). Os arquivos são SÓ VISUAIS e usam dados de exemplo de `mock-data.ts`. Integre-os ao app sem mudar o visual:

1. **Rotas**: hoje a aba é uma página só (`src/routes/aulas.tsx` com `AulasPage`). Crie 3 telas dentro do `AppShell`:
   - `/aulas` → `DisciplinasGrid` (lista de disciplinas)
   - `/aulas/:disciplinaId` → `TopicosLista` (tópicos/subtópicos daquela disciplina)
   - `/aulas/:disciplinaId/:aulaId` → `AulaDetalhe` (página da aula)
   Use o mesmo sistema de rotas que o app já usa. Use um slug estável para disciplina (ex.: nome normalizado) e o `id` da aula.

2. **Dados reais**: troque `mock-data.ts` por `getAulasDoUsuario` (aulaService) + as funções de `aulasArvore.ts` (`formatarAula`, `construirArvore`). Disciplina > assunto (vira o título do grupo) > subassunto (vira a etiqueta no card). Mantenha a ordenação por `assunto_ordem` e `ordem`. Mantenha o cache offline que já existe.

3. **"Não estudei / Estudei"**: o checkbox hoje só muda estado local. Ligue ao campo `concluida` já existente da aula do usuário (salvar e ler do banco), atualizando também a % de progresso da disciplina e do card.

4. **Selo "baixado"**: mostrar quando o vídeo estiver offline (use `getOfflineAulaIds` / `videoOfflineService`). Selo "novo": aulas criadas nos últimos 7 dias.

5. **Página da aula**:
   - Os vídeos da lista à direita devem tocar no player real (`AulaPlayer`, com `terabox_url` / `getPlayableObjectUrl` se offline) no lugar do botão de play decorativo. Se a aula tiver um vídeo só, mostrar 1 item.
   - "Baixar PDF versão simplificada/original": ligar aos materiais de `AulaMateriais` / `aulaMateriaisService`; esconder o botão se não existir o PDF.
   - "Criar flashcards": abrir o `CriarFlashcardAulaModal` já existente.
   - Barra fina no topo = progresso do vídeo atual.
   - Manter favoritar e o botão de download offline (`VideoOfflineButton`) no cabeçalho, perto do "Não estudei".

6. Não altere cores, fontes nem classes `rfx-*`. Mantenha o app funcionando como antes nas outras abas e rode os testes de `aulasArvore`.
