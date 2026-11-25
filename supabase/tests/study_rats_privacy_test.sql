-- ============================================================
-- TESTE DE PRIVACIDADE DO STUDY RATS (Fase 1) — SOMENTE PARA REVISÃO
-- ============================================================
-- RODAR SOMENTE DENTRO DO BLOCO DO $$ ... $$. NENHUM DELETE.
-- TODO O TESTE RODA EM UM BLOCO ANÔNIMO (DO $$ ... $$) QUE TERMINA COM
-- RAISE EXCEPTION CONTENDO O RELATÓRIO FINAL (PASS/FAIL POR LINHA).
-- A EXCEÇÃO DESFAZ TUDO AUTOMATICAMENTE E O TEXTO APARECE NA TELA.
-- ============================================================

DO $$
DECLARE
  v_test_name    text;
  v_expected     text;
  v_obtained     text;
  v_status       text;
  v_pass_count   int := 0;
  v_fail_count   int := 0;
  v_report       text := '';
  v_rowcount     int;
  v_result       boolean;
  v_post_b_id    uuid;
BEGIN
  -- ------------------------------------------------------------
  -- PREPARAÇÃO (como superuser/postgres; RLS não se aplica aqui)
  -- ------------------------------------------------------------
  -- Perfis
  INSERT INTO public.profiles (id, name) VALUES ('user_A', 'Autora A');
  INSERT INTO public.profiles (id, name) VALUES ('user_B', 'Amiga B');
  INSERT INTO public.profiles (id, name) VALUES ('user_C', 'Estranha C');
  INSERT INTO public.profiles (id, name) VALUES ('user_D', 'Amiga D de B');

  -- Amizades
  INSERT INTO public.friendships (id, requester_id, addressee_id, status)
  VALUES (gen_random_uuid(), 'user_A', 'user_B', 'accepted');   -- A <-> B aceita
  INSERT INTO public.friendships (id, requester_id, addressee_id, status)
  VALUES (gen_random_uuid(), 'user_A', 'user_C', 'pending');    -- A -> C pendente
  INSERT INTO public.friendships (id, requester_id, addressee_id, status)
  VALUES (gen_random_uuid(), 'user_B', 'user_D', 'accepted');   -- B <-> D aceita

  -- Posts/check-ins de A
  -- Post normal (in_feed = true)
  INSERT INTO public.study_posts (id, user_id, kind, category, caption, in_feed, is_deleted)
  VALUES ('11111111-1111-1111-1111-111111111111', 'user_A', 'post', 'study_tip', 'Post normal', true, false);

  -- Check-in de A no feed (in_feed = true)
  INSERT INTO public.study_posts (id, user_id, kind, subject, duration_min, study_date, in_feed, is_deleted)
  VALUES ('22222222-2222-2222-2222-222222222222', 'user_A', 'checkin', 'Matemática', 60, current_date, true, false);

  -- Check-in de A só story (in_feed = false) com story ATIVO
  INSERT INTO public.study_posts (id, user_id, kind, subject, duration_min, study_date, in_feed, is_deleted)
  VALUES ('33333333-3333-3333-3333-333333333333', 'user_A', 'checkin', 'Português', 30, current_date, false, false);
  INSERT INTO public.study_stories (id, user_id, kind, subject, duration_min, checkin_post_id, photo_path, created_at, expires_at)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_A', 'checkin', 'Português', 30,
          '33333333-3333-3333-3333-333333333333', 'user_A/33333333-3333-3333-3333-333333333333/0.webp',
          now(), now() + interval '24 hours');

  -- Check-in de A só story (in_feed = false) com story EXPIRADO
  INSERT INTO public.study_posts (id, user_id, kind, subject, duration_min, study_date, in_feed, is_deleted)
  VALUES ('44444444-4444-4444-4444-444444444444', 'user_A', 'checkin', 'História', 45, current_date, false, false);
  INSERT INTO public.study_stories (id, user_id, kind, subject, duration_min, checkin_post_id, photo_path, created_at, expires_at)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user_A', 'checkin', 'História', 45,
          '44444444-4444-4444-4444-444444444444', 'user_A/44444444-4444-4444-4444-444444444444/0.webp',
          now() - interval '2 hours', now() - interval '1 hour');

  -- Post apagado de A (in_feed = true, is_deleted = true)
  INSERT INTO public.study_posts (id, user_id, kind, category, caption, in_feed, is_deleted)
  VALUES ('55555555-5555-5555-5555-555555555555', 'user_A', 'post', 'curiosity', 'Apagado', true, true);

  -- Post e story de D (amiga de B, não amiga de A)
  INSERT INTO public.study_posts (id, user_id, kind, category, caption, in_feed, is_deleted)
  VALUES ('66666666-6666-6666-6666-666666666666', 'user_D', 'post', 'motivation', 'Post de D', true, false);
  INSERT INTO public.study_stories (id, user_id, kind, text, photo_path, created_at, expires_at)
  VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_D', 'post', 'Story de D',
          'user_D/cccccccc-cccc-cccc-cccc-cccccccccccc/0.webp',
          now(), now() + interval '24 hours');

  -- Post de B (para teste 40 e controle)
  v_post_b_id := gen_random_uuid();
  INSERT INTO public.study_posts (id, user_id, kind, category, caption, in_feed, is_deleted)
  VALUES (v_post_b_id, 'user_B', 'post', 'motivation', 'Post de B', true, false);

  -- Fotos de post/check-in de A
  INSERT INTO public.study_post_photos (post_id, photo_path, position) VALUES
    ('11111111-1111-1111-1111-111111111111', 'user_A/11111111-1111-1111-1111-111111111111/0.webp', 0),
    ('33333333-3333-3333-3333-333333333333', 'user_A/33333333-3333-3333-3333-333333333333/0.webp', 0);

  -- Comentário de A no post normal
  INSERT INTO public.study_post_comments (id, post_id, user_id, text) VALUES
    (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'user_A', 'Comentário de A');

  -- Views do story ativo de A (por A e por B)
  INSERT INTO public.study_story_views (story_id, user_id) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_A'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_B');

  -- Salvo de A
  INSERT INTO public.study_post_saves (post_id, user_id) VALUES
    ('11111111-1111-1111-1111-111111111111', 'user_A');

  -- Storage objects fictícios para testes de storage (sem coluna owner)
  INSERT INTO storage.objects (id, bucket_id, name, metadata)
  VALUES
    (gen_random_uuid(), 'study-rats', 'user_A/11111111-1111-1111-1111-111111111111/0.webp', '{}'),
    (gen_random_uuid(), 'study-rats', 'user_A/33333333-3333-3333-3333-333333333333/0.webp', '{}'),
    (gen_random_uuid(), 'study-rats', 'user_A/44444444-4444-4444-4444-444444444444/0.webp', '{}'),
    (gen_random_uuid(), 'study-rats', 'user_D/cccccccc-cccc-cccc-cccc-cccccccccccc/0.webp', '{}');

  -- Mudar para role authenticated ANTES dos testes (RLS ativa)
  SET LOCAL ROLE authenticated;

  -- ------------------------------------------------------------
  -- FUNÇÃO AUXILIAR PARA REGISTRAR RESULTADO
  -- ------------------------------------------------------------
  v_report := v_report || 'TESTE | ESPERADO | OBTIDO | STATUS' || chr(10);
  v_report := v_report || '------|----------|--------|-------' || chr(10);

  -- ------------------------------------------------------------
  -- TESTES — como B (amiga aceita de A)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"sub":"user_B"}', true);

  -- 1) B vê post normal de A (in_feed = true)
  SELECT count(*) INTO v_rowcount FROM public.study_posts WHERE id = '11111111-1111-1111-1111-111111111111';
  v_test_name := 'B vê post in_feed de A';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 2) B vê check-in só-story de A enquanto o story está ativo
  SELECT count(*) INTO v_rowcount FROM public.study_posts WHERE id = '33333333-3333-3333-3333-333333333333';
  v_test_name := 'B vê check-in só-story (story ativo)';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 3) B NÃO vê check-in só-story de A com story expirado
  SELECT count(*) INTO v_rowcount FROM public.study_posts WHERE id = '44444444-4444-4444-4444-444444444444';
  v_test_name := 'B não vê check-in só-story (story expirado)';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 4) B NÃO vê post apagado de A
  SELECT count(*) INTO v_rowcount FROM public.study_posts WHERE id = '55555555-5555-5555-5555-555555555555';
  v_test_name := 'B não vê post apagado de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 5) study_feed() como B: vê o post normal e o check-in de feed de A (2)
  SELECT count(*) INTO v_rowcount
  FROM public.study_feed()
  WHERE out_user_id = 'user_A' AND out_id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  v_test_name := 'feed(B) traz post normal + check-in de feed de A';
  v_expected := '2';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 2 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 6) study_feed() como B: NÃO traz o check-in só-story nem o apagado de A
  SELECT count(*) INTO v_rowcount
  FROM public.study_feed()
  WHERE out_id IN ('33333333-3333-3333-3333-333333333333','55555555-5555-5555-5555-555555555555');
  v_test_name := 'feed(B) não traz só-story nem apagado de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 7) study_feed() como B: recebe o post de D (D é amiga de B)
  SELECT count(*) INTO v_rowcount FROM public.study_feed() WHERE out_id = '66666666-6666-6666-6666-666666666666';
  v_test_name := 'feed(B) traz post da amiga D';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 8) study_stories_feed() como B: vê story ativo de A, não o expirado
  SELECT count(*) INTO v_rowcount FROM public.study_stories_feed() WHERE out_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_test_name := 'stories(B) vê story ativo de A';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  SELECT count(*) INTO v_rowcount FROM public.study_stories_feed() WHERE out_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_test_name := 'stories(B) não vê story expirado de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 9) study_perfil_resumo('user_A') como B: 1 linha
  SELECT count(*) INTO v_rowcount FROM public.study_perfil_resumo('user_A');
  v_test_name := 'perfil_resumo(B, A) retorna 1 linha';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 10) sr_posso_ver_arquivo: foto do post normal de A = true para B (TESTE DE REGRESSÃO - deve passar)
  v_result := public.sr_posso_ver_arquivo('user_A/11111111-1111-1111-1111-111111111111/0.webp');
  v_test_name := 'arquivo(B) foto de post normal de A (regressão)';
  v_expected := 'true';
  v_obtained := v_result::text;
  v_status := CASE WHEN v_result THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 11) sr_posso_ver_arquivo: arquivo do story EXPIRADO de A = false para B
  v_result := public.sr_posso_ver_arquivo('user_A/44444444-4444-4444-4444-444444444444/0.webp');
  v_test_name := 'arquivo(B) story expirado de A';
  v_expected := 'false';
  v_obtained := v_result::text;
  v_status := CASE WHEN NOT v_result THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 12) sr_posso_ver_arquivo: arquivo do story ATIVO (check-in só-story) de A = true para B
  v_result := public.sr_posso_ver_arquivo('user_A/33333333-3333-3333-3333-333333333333/0.webp');
  v_test_name := 'arquivo(B) story ativo de A';
  v_expected := 'true';
  v_obtained := v_result::text;
  v_status := CASE WHEN v_result THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 13) study_post_comments_list: B (amiga) lê o comentário de A
  SELECT count(*) INTO v_rowcount FROM public.study_post_comments_list('11111111-1111-1111-1111-111111111111');
  v_test_name := 'comentários(B) lê comentário de A';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 14) study_story_viewers: B NÃO lê quem viu o story de A
  SELECT count(*) INTO v_rowcount FROM public.study_story_viewers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  v_test_name := 'viewers(B) não lê viewers de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 15) study_stories_apagar_expirados: B não apaga story de A (0 linhas) - CHAMAR UMA VEZ SÓ
  v_rowcount := public.study_stories_apagar_expirados(ARRAY['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[]);
  v_test_name := 'apagar_expirados(B) não apaga story de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- ------------------------------------------------------------
  -- TESTES — como C (sem amizade com A; convite pendente)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"sub":"user_C"}', true);

  -- 16) C não vê post de A
  SELECT count(*) INTO v_rowcount FROM public.study_posts WHERE id = '11111111-1111-1111-1111-111111111111';
  v_test_name := 'C não vê post in_feed de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 17) C não vê nenhum post de A no feed
  SELECT count(*) INTO v_rowcount FROM public.study_feed() WHERE out_user_id = 'user_A';
  v_test_name := 'feed(C) não traz nada de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 18) C não vê stories de A
  SELECT count(*) INTO v_rowcount FROM public.study_stories_feed() WHERE out_user_id = 'user_A';
  v_test_name := 'stories(C) não traz nada de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 19) study_perfil_resumo('user_A') como C: 0 linhas
  SELECT count(*) INTO v_rowcount FROM public.study_perfil_resumo('user_A');
  v_test_name := 'perfil_resumo(C, A) retorna 0 linhas';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 20) sr_posso_ver_arquivo: foto do post normal de A = false para C
  v_result := public.sr_posso_ver_arquivo('user_A/11111111-1111-1111-1111-111111111111/0.webp');
  v_test_name := 'arquivo(C) foto de post de A';
  v_expected := 'false';
  v_obtained := v_result::text;
  v_status := CASE WHEN NOT v_result THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 21) C não lê os salvos de A
  SELECT count(*) INTO v_rowcount FROM public.study_post_saves WHERE user_id = 'user_A';
  v_test_name := 'C não lê salvos de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 22) study_post_comments_list: C não lê comentário de A
  SELECT count(*) INTO v_rowcount FROM public.study_post_comments_list('11111111-1111-1111-1111-111111111111');
  v_test_name := 'comentários(C) não lê comentário de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- ------------------------------------------------------------
  -- TESTES — como A (autora)
  -- ------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"sub":"user_A"}', true);

  -- 23) study_feed() como A: traz os posts de A (normal + check-in de feed = 2)
  SELECT count(*) INTO v_rowcount FROM public.study_feed() WHERE out_user_id = 'user_A';
  v_test_name := 'feed(A) traz posts de A';
  v_expected := '2';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 2 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 24) study_feed() como A: NÃO recebe post de D (D não é amiga de A)
  SELECT count(*) INTO v_rowcount FROM public.study_feed() WHERE out_id = '66666666-6666-6666-6666-666666666666';
  v_test_name := 'feed(A) não traz post de D';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 25) study_stories_feed() como A: NÃO recebe story de D
  SELECT count(*) INTO v_rowcount FROM public.study_stories_feed() WHERE out_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_test_name := 'stories(A) não traz story de D';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 26) study_perfil_resumo('user_A') como A: 1 linha
  SELECT count(*) INTO v_rowcount FROM public.study_perfil_resumo('user_A');
  v_test_name := 'perfil_resumo(A, A) retorna 1 linha';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 27) sr_posso_ver_arquivo: A (dona) lê o arquivo do story expirado = true
  v_result := public.sr_posso_ver_arquivo('user_A/44444444-4444-4444-4444-444444444444/0.webp');
  v_test_name := 'arquivo(A) story expirado próprio';
  v_expected := 'true';
  v_obtained := v_result::text;
  v_status := CASE WHEN v_result THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 28) study_story_viewers: A (dona) lê quem viu o story (2 views)
  SELECT count(*) INTO v_rowcount FROM public.study_story_viewers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  v_test_name := 'viewers(A) lê viewers do próprio story';
  v_expected := '2';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 2 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- ------------------------------------------------------------
  -- TESTES NOVOS — friendships
  -- ------------------------------------------------------------

  -- 29) friendships: A (quem convidou, pendente A->C) tenta UPDATE status='accepted' -> 0 linhas
  PERFORM set_config('request.jwt.claims', '{"sub":"user_A"}', true);
  BEGIN
    UPDATE public.friendships SET status = 'accepted'
    WHERE requester_id = 'user_A' AND addressee_id = 'user_C';
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  END;
  v_test_name := 'friendships: A (requester pendente) UPDATE status accepted -> 0 linhas';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 30) friendships: tentar trocar requester_id/addressee_id -> exceção
  PERFORM set_config('request.jwt.claims', '{"sub":"user_C"}', true);
  BEGIN
    UPDATE public.friendships SET requester_id = 'user_X', addressee_id = 'user_Y'
    WHERE requester_id = 'user_A' AND addressee_id = 'user_C';
    v_rowcount := 1; -- não deve chegar aqui
  EXCEPTION WHEN OTHERS THEN
    v_rowcount := 0; -- exceção esperada
  END;
  v_test_name := 'friendships: trocar requester_id/addressee_id -> exceção';
  v_expected := 'exceção';
  v_obtained := 'exceção';
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- ------------------------------------------------------------
  -- TESTES NOVOS — escrita
  -- ------------------------------------------------------------

  -- 31) C tenta curtir post de A -> negado (RLS 42501)
  PERFORM set_config('request.jwt.claims', '{"sub":"user_C"}', true);
  BEGIN
    INSERT INTO public.study_post_likes (post_id, user_id) VALUES ('11111111-1111-1111-1111-111111111111', 'user_C');
    v_rowcount := 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rowcount := 0;
  END;
  v_test_name := 'escrita: C curte post de A -> negado';
  v_expected := 'negado';
  v_obtained := CASE WHEN v_rowcount = 0 THEN 'negado' ELSE 'permitido' END;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 32) C tenta comentar post de A -> negado
  BEGIN
    INSERT INTO public.study_post_comments (post_id, user_id, text) VALUES ('11111111-1111-1111-1111-111111111111', 'user_C', 'teste');
    v_rowcount := 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rowcount := 0;
  END;
  v_test_name := 'escrita: C comenta post de A -> negado';
  v_expected := 'negado';
  v_obtained := CASE WHEN v_rowcount = 0 THEN 'negado' ELSE 'permitido' END;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 33) C tenta salvar post de A -> negado
  BEGIN
    INSERT INTO public.study_post_saves (post_id, user_id) VALUES ('11111111-1111-1111-1111-111111111111', 'user_C');
    v_rowcount := 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rowcount := 0;
  END;
  v_test_name := 'escrita: C salva post de A -> negado';
  v_expected := 'negado';
  v_obtained := CASE WHEN v_rowcount = 0 THEN 'negado' ELSE 'permitido' END;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 34) B tenta inserir post com user_id='user_A' -> negado
  PERFORM set_config('request.jwt.claims', '{"sub":"user_B"}', true);
  BEGIN
    INSERT INTO public.study_posts (id, user_id, kind, category, caption, in_feed, is_deleted)
    VALUES (gen_random_uuid(), 'user_A', 'post', 'study_tip', 'teste', true, false);
    v_rowcount := 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rowcount := 0;
  END;
  v_test_name := 'escrita: B insere post com user_id=A -> negado';
  v_expected := 'negado';
  v_obtained := CASE WHEN v_rowcount = 0 THEN 'negado' ELSE 'permitido' END;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 35) B tenta UPDATE em post de A -> 0 linhas
  BEGIN
    UPDATE public.study_posts SET caption = 'hack' WHERE id = '11111111-1111-1111-1111-111111111111';
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  END;
  v_test_name := 'escrita: B UPDATE post de A -> 0 linhas';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 36) B tenta DELETE em post de A -> 0 linhas
  BEGIN
    DELETE FROM public.study_posts WHERE id = '11111111-1111-1111-1111-111111111111';
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  END;
  v_test_name := 'escrita: B DELETE post de A -> 0 linhas';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 37) B tenta inserir story com photo_path 'user_A/...' -> negado
  BEGIN
    INSERT INTO public.study_stories (user_id, kind, photo_path, expires_at)
    VALUES ('user_B', 'post', 'user_A/xxx/0.webp', now() + interval '24 hours');
    v_rowcount := 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rowcount := 0;
  END;
  v_test_name := 'escrita: B story com photo_path user_A -> negado';
  v_expected := 'negado';
  v_obtained := CASE WHEN v_rowcount = 0 THEN 'negado' ELSE 'permitido' END;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 38) B tenta story com checkin_post_id de post de A -> negado
  BEGIN
    INSERT INTO public.study_stories (user_id, kind, subject, duration_min, checkin_post_id, expires_at)
    VALUES ('user_B', 'checkin', 'Matemática', 60, '11111111-1111-1111-1111-111111111111', now() + interval '24 hours');
    v_rowcount := 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rowcount := 0;
  END;
  v_test_name := 'escrita: B story com checkin_post_id de A -> negado';
  v_expected := 'negado';
  v_obtained := CASE WHEN v_rowcount = 0 THEN 'negado' ELSE 'permitido' END;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 39) B tenta story com expires_at daqui a 30 dias -> negado
  BEGIN
    INSERT INTO public.study_stories (user_id, kind, text, expires_at)
    VALUES ('user_B', 'post', 'teste', now() + interval '30 days');
    v_rowcount := 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rowcount := 0;
  END;
  v_test_name := 'escrita: B story expires_at 30 dias -> negado';
  v_expected := 'negado';
  v_obtained := CASE WHEN v_rowcount = 0 THEN 'negado' ELSE 'permitido' END;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 40) B tenta inserir foto em post próprio com photo_path da pasta de A -> negado
  BEGIN
    INSERT INTO public.study_post_photos (post_id, photo_path, position)
    VALUES (v_post_b_id, 'user_A/xxx/0.webp', 0);
    v_rowcount := 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rowcount := 0;
  END;
  v_test_name := 'escrita: B foto em post próprio com path user_A -> negado';
  v_expected := 'negado';
  v_obtained := CASE WHEN v_rowcount = 0 THEN 'negado' ELSE 'permitido' END;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 40b) CONTROLE: B insere foto com photo_path da própria pasta no próprio post -> permitido
  BEGIN
    INSERT INTO public.study_post_photos (post_id, photo_path, position)
    VALUES (v_post_b_id, 'user_B/' || v_post_b_id || '/0.webp', 1);
    v_rowcount := 1;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rowcount := 0;
  END;
  v_test_name := 'escrita: B foto em post próprio com path próprio -> permitido (controle)';
  v_expected := 'permitido';
  v_obtained := CASE WHEN v_rowcount = 1 THEN 'permitido' ELSE 'negado' END;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- ------------------------------------------------------------
  -- TESTES NOVOS — storage
  -- ------------------------------------------------------------

  -- 41) storage: B vê foto de post normal de A (1)
  PERFORM set_config('request.jwt.claims', '{"sub":"user_B"}', true);
  SELECT count(*) INTO v_rowcount FROM storage.objects
  WHERE bucket_id = 'study-rats' AND name = 'user_A/11111111-1111-1111-1111-111111111111/0.webp';
  v_test_name := 'storage: B vê foto post normal de A';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 42) storage: B vê foto de story ativo de A (1)
  SELECT count(*) INTO v_rowcount FROM storage.objects
  WHERE bucket_id = 'study-rats' AND name = 'user_A/33333333-3333-3333-3333-333333333333/0.webp';
  v_test_name := 'storage: B vê foto story ativo de A';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 43) storage: B NÃO vê story expirado de A (0)
  SELECT count(*) INTO v_rowcount FROM storage.objects
  WHERE bucket_id = 'study-rats' AND name = 'user_A/44444444-4444-4444-4444-444444444444/0.webp';
  v_test_name := 'storage: B não vê story expirado de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 44) storage: B vê story ativo de D (1)
  SELECT count(*) INTO v_rowcount FROM storage.objects
  WHERE bucket_id = 'study-rats' AND name = 'user_D/cccccccc-cccc-cccc-cccc-cccccccccccc/0.webp';
  v_test_name := 'storage: B vê story ativo de D';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 45) storage: C vê 0 de tudo de A
  PERFORM set_config('request.jwt.claims', '{"sub":"user_C"}', true);
  SELECT count(*) INTO v_rowcount FROM storage.objects
  WHERE bucket_id = 'study-rats' AND name LIKE 'user_A/%';
  v_test_name := 'storage: C vê 0 de tudo de A';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 46) storage: A vê os próprios, inclusive o expirado (3 arquivos de A no total)
  PERFORM set_config('request.jwt.claims', '{"sub":"user_A"}', true);
  SELECT count(*) INTO v_rowcount FROM storage.objects
  WHERE bucket_id = 'study-rats' AND name LIKE 'user_A/%';
  v_test_name := 'storage: A vê próprios inclusive expirado';
  v_expected := '3';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 3 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- 47) storage: A NÃO vê story ativo de D (0)
  SELECT count(*) INTO v_rowcount FROM storage.objects
  WHERE bucket_id = 'study-rats' AND name = 'user_D/cccccccc-cccc-cccc-cccc-cccccccccccc/0.webp';
  v_test_name := 'storage: A não vê story ativo de D';
  v_expected := '0';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- ------------------------------------------------------------
  -- TESTE NOVO — role anon
  -- ------------------------------------------------------------

  -- 48) role anon: SELECT em study_posts deve dar erro ou 0 linhas
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_rowcount FROM public.study_posts;
    -- se chegou aqui sem erro, v_rowcount deve ser 0
  EXCEPTION WHEN OTHERS THEN
    v_rowcount := -1; -- erro esperado
  END;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  v_test_name := 'anon: SELECT study_posts -> erro ou 0 linhas';
  v_expected := 'erro ou 0';
  v_obtained := CASE WHEN v_rowcount = -1 THEN 'erro' WHEN v_rowcount = 0 THEN '0 linhas' ELSE v_rowcount::text END;
  v_status := CASE WHEN v_rowcount <= 0 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- ------------------------------------------------------------
  -- TESTE FINAL — friendships: C aceita o convite (sub-bloco com RAISE para desfazer)
  -- ------------------------------------------------------------

  -- 49) friendships: C aceita -> 1 linha (em sub-bloco, revertido via RAISE)
  PERFORM set_config('request.jwt.claims', '{"sub":"user_C"}', true);
  BEGIN
    UPDATE public.friendships SET status = 'accepted'
    WHERE requester_id = 'user_A' AND addressee_id = 'user_C';
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RAISE EXCEPTION 'desfazer_teste_49' USING ERRCODE = 'P0002';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL; -- UPDATE desfeito, v_rowcount mantém o valor lido
  END;
  v_test_name := 'friendships: C (addressee) aceita -> 1 linha (revertido)';
  v_expected := '1';
  v_obtained := v_rowcount::text;
  v_status := CASE WHEN v_rowcount = 1 THEN 'PASS' ELSE 'FAIL' END;
  IF v_status = 'PASS' THEN v_pass_count := v_pass_count + 1; ELSE v_fail_count := v_fail_count + 1; END IF;
  v_report := v_report || v_test_name || ' | ' || v_expected || ' | ' || v_obtained || ' | ' || v_status || chr(10);

  -- ------------------------------------------------------------
  -- RELATÓRIO FINAL
  -- ------------------------------------------------------------
  RESET ROLE;
  v_report := v_report || chr(10) || 'TOTAL: ' || v_pass_count || ' PASS, ' || v_fail_count || ' FAIL';
  RAISE EXCEPTION '%', v_report USING ERRCODE = 'P0001';
END $$;

-- ============================================================
-- FIM — nada foi persistido. O bloco DO $$ ... $$ com RAISE EXCEPTION
-- desfaz tudo automaticamente. NÃO REMOVER O RAISE EXCEPTION.
-- ============================================================
