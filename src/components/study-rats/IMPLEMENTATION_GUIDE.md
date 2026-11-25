# Prompt para a IA (Qwen Code) — implementar a parte funcional do Study Rats v7

Você vai tornar funcional o protótipo visual em `src/components/study-rats/` (copiado da pasta `study-rats/`).

## Antes de tudo
1. **Analise o código antes de alterar qualquer coisa**: `src/routes/comunidade.tsx`, `src/routes/calendario.tsx`, `src/contexts/UserContext`, `src/services/friendService`, `src/lib/db` (RxDB) e como o app já faz upload de imagens (relatórios `RELATORIO_1A*_FLASHCARD_IMAGENS.txt` e policies de storage).
2. Siga os padrões existentes (serviços, sincronização, storage). Não refatore outras áreas.
3. **Não duplique** grupos, ranking, estatísticas, desempenho ou conquistas — use os que já existem (ex.: "dias seguidos" vem da sequência atual do app, se houver).
4. **Mantenha 100% do visual** dos componentes v4 (classes `srx-*`, animações, layout). Troque apenas os dados falsos por reais.
5. **Mobile e desktop**: mantenha os dois layouts do protótipo (barra inferior no celular abaixo de 768px; coluna lateral no feed a partir de 1024px). Se o app já tiver barra inferior própria, integre o botão "+" nela em vez de duplicar.
6. Confira se o Una Vox tem os tokens `--surface`, `--surface-2` e `--accent` (laranja). Se o nome for outro, mapeie em `StudyRatsStyles.tsx` sem mudar o resto.

## Integração
- Comunidade: nova aba `studyrats` no `BotaoTab` (mesma lógica de `?tab=`), renderizando `<StudyRatsFeed />`.
- Dentro de Study Rats há o seletor **Feed / Meu perfil** (já embutido em `StudyRatsFeed`).
- Calendários: `<StudyRatsCalendario onIrParaComunidade={...} />` — o botão leva para `/comunidade?tab=studyrats`.
- **Regra central: só se publica pela Comunidade** (feed ou perfil). O calendário NÃO cria registros; ele apenas lê as publicações da própria usuária.

## Dados necessários
- `study_posts`: id, user_id, **tipo** (`checkin` | `post`), **categoria** (`Dica de estudo` | `Curiosidade` | `Dúvida` | `Motivação`, só para `post`), titulo, legenda, materia (opcional em `post`), duracao_min (só `checkin`), data_estudo (date), hora (time), created_at.
  - Validação: `checkin` exige ao menos 1 foto, matéria e duração > 0; `post` exige texto e categoria.
- `study_post_photos`: id, post_id, foto_path, ordem (carrossel, até 10 fotos).
- `study_post_likes`: post_id, user_id (único por par).
- `study_post_comments`: id, post_id, user_id, texto, created_at.
- `study_post_saves`: post_id, user_id (único por par) — só a própria usuária vê.
- `study_stories`: id, user_id, tipo (`checkin` | `post`), categoria, texto, foto_path (opcional para story de texto), materia, duracao_min, post_checkin_id (opcional, liga ao check-in salvo), created_at, expira_em (created_at + 24h).
  - Consultas de stories filtram `expira_em > agora`. Apagar/arquivar expirados com a rotina agendada que o app já usar (ou limpar na leitura).
- `study_story_views`: story_id, user_id — para o anel "visto".
- Fotos no storage existente (bucket próprio, ex. `study-rats`), leitura liberada para amizades da autora.
- Um registro do calendário = um **check-in** da própria usuária (filtrar `study_posts` por `user_id`, `tipo = checkin` e mês). Publicações normais nunca entram no calendário nem nas horas estudadas.

## Funcionalidades
1. **Feed**: check-ins e publicações da usuária e das amizades (`friendService`), mais recentes primeiro, paginação infinita. Filtros por tipo/categoria. Publicações de texto usam o cartão de texto (chip da categoria + título + texto); check-ins usam o cartão de foto com selo "Check-in · tempo". "Curtido por" mostra uma amizade que curtiu + total.
2. **Stories**: da usuária (primeiro, em "Seu story") e das amizades, só os não expirados (24h); ordem: não vistos primeiro. Abrir marca como visto. Avança sozinho a cada 5s, toque esquerdo/direito volta/avança. "Seu story" cria um story.
3. **Carrossel**: várias fotos por publicação, em ordem; contador 1/N e pontinhos.
4. **Curtir**: botão alterna; duplo toque na foto só curte (nunca descurte) e mostra o coração animado. Atualização otimista com contador.
5. **Comentários**: painel inferior, lista em ordem cronológica, enviar com Enter ou "Publicar", atalhos de emoji.
6. **Salvar**: alterna `study_post_saves`.
7. **Compartilhar**: usar o compartilhamento já existente do app ("Compartilhado comigo") se houver; senão, deixar o botão sem ação.
8. **Perfil do estudante** — abas Check-ins (grade), Publicações (lista de cartões) e Salvos. (`StudyRatsPerfil`): dados do `UserContext` (nome, foto, bio editável), nº de publicações, nº de amizades (`friendService`), horas (soma de `duracao_min`); grade 3 colunas com todas as publicações da usuária (mais recentes primeiro); aba Salvos lista `study_post_saves`. Ao abrir o perfil de uma amizade, esconder "Editar perfil", "Nova publicação" e Salvos.
9. **Criar** (`NovaPublicacaoModal`): primeiro passo escolhe o tipo; depois o **destino** (`feed` = permanente em `study_posts`; `story` = `study_stories` com 24h). Regra: check-in com destino `story` também grava o registro do check-in (para o calendário e as horas), mas não aparece no feed nem na grade do perfil; publicação normal em story não grava nada permanente. (ou vem de `tipoInicial`). Trocar `studyRatsStore.publicar` pelo serviço real: `publicar({ destino, tipo, categoria, arquivos, materia, duracaoMin, legenda, data })`. Matérias vêm das matérias da usuária no app. Data = hoje. Aparece no feed, no perfil e no calendário (mesma tabela, sem duplicar dados).
10. **Calendário** (somente leitura): foto do 1º registro do dia no círculo, contador quando houver mais de um, painel do dia selecionado (sem botão de criar), setas trocam o mês, resumo com total de registros, horas (soma de `duracao_min`) e dias seguidos.
11. Só a autora pode excluir/editar a própria publicação (menu "…").

## Componentes
- `StudyRatsFeed` (trocar `PUBLICACOES` e `STORIES` por consultas reais)
- `NovaPublicacaoModal` (adicionar `onSubmit`, upload múltiplo)
- `StudyRatsPerfil` (trocar `REGISTROS` pelas publicações da usuária)
- `StudyRatsCalendario` (trocar `REGISTROS` por consulta real)
- Manter o teste `study-rats-store.test.ts` adaptado ao serviço real (check-in vai ao calendário; publicação não).
- `StudyRatsStyles` (manter), `mock-data.ts` e `fotos-exemplo/` (remover ao final; manter `fmtDuracao` e `tempoRelativo` em um utilitário)
