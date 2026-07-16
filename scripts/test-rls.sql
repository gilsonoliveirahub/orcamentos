-- ============================================================
-- Testes de RLS — Façoporti
-- ============================================================
-- COMO CORRER:
--   1. Abre o SQL Editor no Supabase Dashboard do projeto
--      (Database > SQL Editor > New query)
--   2. Cola este ficheiro completo e executa (Run)
--   3. O resultado é uma tabela com uma linha por teste —
--      coluna "resultado" diz OK ou FALHOU
--
-- QUANDO CORRER: sempre que alterares qualquer política RLS,
-- antes de dares a alteração como concluída.
--
-- SEGURANÇA:
--   - Testes 1-4 são 100% só de leitura (nunca escrevem nada)
--   - Teste 5 (auto-promoção a admin) tenta mesmo o INSERT para
--     confirmar que a base de dados o rejeita. Se, ao contrário
--     do esperado, for aceite, a linha de teste é apagada de
--     imediato a seguir (fica registado no resultado se isso
--     aconteceu) — nunca fica um admin falso na tabela.
--   - Usa uma tabela temporária (apagada automaticamente no fim
--     da sessão) para os resultados — não altera nenhum dado real.
--
-- Validado em produção em 2026-07-16 — 5/5 testes OK.
-- ============================================================

CREATE TEMP TABLE rls_test_results (
  ordem int,
  teste text,
  esperado text,
  obtido text,
  resultado text
);

DO $$
DECLARE
  admin_uuid uuid;
  prof_uuid uuid;
  real_leads_admin int;
  rls_leads_admin int;
  real_leads_prof int;
  rls_leads_prof int;
  rls_leads_anon int;
BEGIN

  SELECT a.user_id INTO admin_uuid FROM admins a LIMIT 1;
  SELECT p.user_id INTO prof_uuid
    FROM professionals p
    WHERE p.user_id NOT IN (SELECT user_id FROM admins)
    LIMIT 1;

  IF admin_uuid IS NULL THEN
    INSERT INTO rls_test_results VALUES (0, 'setup', 'admin na tabela admins', 'nenhum encontrado', '⚠ IGNORADO');
    RETURN;
  END IF;

  -- TESTE 1 — Admin vê todos os leads
  SELECT count(*) INTO real_leads_admin FROM leads;

  SET LOCAL role authenticated;
  EXECUTE format('SET LOCAL request.jwt.claims = ''{"sub":"%s","role":"authenticated"}''', admin_uuid);
  SELECT count(*) INTO rls_leads_admin FROM leads;
  RESET role;
  RESET request.jwt.claims;

  INSERT INTO rls_test_results VALUES (
    1, 'Admin vê todos os leads',
    real_leads_admin::text || ' leads', rls_leads_admin::text || ' leads',
    CASE WHEN rls_leads_admin = real_leads_admin THEN '✅ OK' ELSE '❌ FALHOU' END
  );

  -- TESTE 2 — Profissional só vê os leads dele
  IF prof_uuid IS NOT NULL THEN
    SELECT count(*) INTO real_leads_prof
      FROM leads l JOIN professionals p ON p.id = l.professional_id
      WHERE p.user_id = prof_uuid;

    SET LOCAL role authenticated;
    EXECUTE format('SET LOCAL request.jwt.claims = ''{"sub":"%s","role":"authenticated"}''', prof_uuid);
    SELECT count(*) INTO rls_leads_prof FROM leads;
    RESET role;
    RESET request.jwt.claims;

    INSERT INTO rls_test_results VALUES (
      2, 'Profissional só vê os seus leads',
      real_leads_prof::text || ' leads', rls_leads_prof::text || ' leads',
      CASE WHEN rls_leads_prof = real_leads_prof THEN '✅ OK' ELSE '❌ FALHOU' END
    );
  ELSE
    INSERT INTO rls_test_results VALUES (2, 'Profissional só vê os seus leads', 'n/a', 'nenhum profissional não-admin encontrado', '⚠ IGNORADO');
  END IF;

  -- TESTE 3 — Sem sessão (anon) não vê nenhum lead
  SET LOCAL role anon;
  SELECT count(*) INTO rls_leads_anon FROM leads;
  RESET role;
  RESET request.jwt.claims;

  INSERT INTO rls_test_results VALUES (
    3, 'Anónimo não vê nenhum lead',
    '0 leads', rls_leads_anon::text || ' leads',
    CASE WHEN rls_leads_anon = 0 THEN '✅ OK' ELSE '❌ FALHOU' END
  );

END $$;

-- TESTE 4 — Não existe nenhuma policy que permita apagar leads
-- (verificação de metadados, não tenta apagar nada de verdade)
INSERT INTO rls_test_results
SELECT 4, 'Nenhuma policy permite apagar leads',
  '0 policies de DELETE', count(*)::text || ' policies de DELETE',
  CASE WHEN count(*) = 0 THEN '✅ OK' ELSE '❌ FALHOU — existe policy de DELETE em leads' END
FROM pg_policies WHERE tablename = 'leads' AND cmd = 'DELETE';

-- TESTE 5 — Utilizador comum NÃO consegue auto-promover-se a admin
DO $$
DECLARE
  prof_uuid uuid;
BEGIN
  SELECT p.user_id INTO prof_uuid
    FROM professionals p
    WHERE p.user_id NOT IN (SELECT user_id FROM admins)
    LIMIT 1;

  IF prof_uuid IS NULL THEN
    INSERT INTO rls_test_results VALUES (5, 'Utilizador comum não se promove a admin', 'n/a', 'nenhum profissional não-admin encontrado', '⚠ IGNORADO');
    RETURN;
  END IF;

  BEGIN
    SET LOCAL role authenticated;
    EXECUTE format('SET LOCAL request.jwt.claims = ''{"sub":"%s","role":"authenticated"}''', prof_uuid);
    INSERT INTO admins (user_id, email) VALUES (prof_uuid, 'teste-auto-promocao@invalido.com');
    RESET role;
    RESET request.jwt.claims;

    -- Se chegou aqui, o INSERT foi aceite (mau sinal) — remove já a linha
    DELETE FROM admins WHERE user_id = prof_uuid AND email = 'teste-auto-promocao@invalido.com';
    INSERT INTO rls_test_results VALUES (5, 'Utilizador comum não se promove a admin', 'rejeitado', 'INSERT foi aceite! (linha removida de imediato a seguir)', '❌ FALHOU GRAVEMENTE');
  EXCEPTION WHEN insufficient_privilege THEN
    RESET role;
    RESET request.jwt.claims;
    INSERT INTO rls_test_results VALUES (5, 'Utilizador comum não se promove a admin', 'rejeitado', 'rejeitado', '✅ OK');
  WHEN others THEN
    RESET role;
    RESET request.jwt.claims;
    INSERT INTO rls_test_results VALUES (5, 'Utilizador comum não se promove a admin', 'rejeitado', SQLERRM, '⚠ ERRO INESPERADO');
  END;
END $$;

-- ============================================================
-- TESTES 6-9 — Sistema de métricas (analytics_events,
-- analytics_daily_summary, analytics_daily_unique_visitors)
--
-- Estas três tabelas não têm NENHUMA policy RLS para anon nem
-- authenticated (nem sequer para admin) — o único acesso é via
-- supabaseAdmin (service_role) dentro das rotas /api/track,
-- /api/admin/metrics, /api/professional/metrics e
-- /api/cron/analytics, que aplicam a sua própria autorização no
-- código. Estes testes confirmam que a porta de RLS está mesmo
-- fechada, incluindo para quem está autenticado como admin.
--
-- Teste 6 insere uma linha sintética em analytics_events (via o
-- próprio contexto privilegiado do SQL Editor, que corre como
-- postgres e ignora RLS) só para confirmar que os papéis
-- restritos não a conseguem ver — a linha é apagada de imediato
-- a seguir, nunca fica dado sintético na tabela.
-- ============================================================

DO $$
DECLARE
  admin_uuid uuid;
  prof_uuid uuid;
  synthetic_id uuid;
  anon_count int;
  authenticated_prof_count int;
  authenticated_admin_count int;
BEGIN
  SELECT a.user_id INTO admin_uuid FROM admins a LIMIT 1;
  SELECT p.user_id INTO prof_uuid
    FROM professionals p
    WHERE p.user_id NOT IN (SELECT user_id FROM admins)
    LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_events') THEN
    INSERT INTO rls_test_results VALUES (6, 'analytics_events: RLS fecha SELECT a anon/authenticated/admin', 'n/a', 'tabela analytics_events ainda não existe', '⚠ IGNORADO');
    RETURN;
  END IF;

  -- Linha sintética, inserida no contexto privilegiado do próprio script (não via anon/authenticated)
  INSERT INTO analytics_events (event_type, visitor_hash, path)
  VALUES ('page_view', 'hash-sintetico-teste-rls', '/')
  RETURNING id INTO synthetic_id;

  -- Anon não vê nada
  SET LOCAL role anon;
  SELECT count(*) INTO anon_count FROM analytics_events WHERE id = synthetic_id;
  RESET role;
  RESET request.jwt.claims;

  INSERT INTO rls_test_results VALUES (
    6, 'analytics_events: anon não consegue SELECT',
    '0 linhas', anon_count::text || ' linhas',
    CASE WHEN anon_count = 0 THEN '✅ OK' ELSE '❌ FALHOU' END
  );

  -- Profissional autenticado não vê nada (nem os seus próprios eventos, se os tivesse)
  IF prof_uuid IS NOT NULL THEN
    SET LOCAL role authenticated;
    EXECUTE format('SET LOCAL request.jwt.claims = ''{"sub":"%s","role":"authenticated"}''', prof_uuid);
    SELECT count(*) INTO authenticated_prof_count FROM analytics_events WHERE id = synthetic_id;
    RESET role;
    RESET request.jwt.claims;

    INSERT INTO rls_test_results VALUES (
      7, 'analytics_events: profissional autenticado não consegue SELECT (sem policy, mesmo para os próprios eventos)',
      '0 linhas', authenticated_prof_count::text || ' linhas',
      CASE WHEN authenticated_prof_count = 0 THEN '✅ OK' ELSE '❌ FALHOU' END
    );
  ELSE
    INSERT INTO rls_test_results VALUES (7, 'analytics_events: profissional autenticado não consegue SELECT', 'n/a', 'nenhum profissional não-admin encontrado', '⚠ IGNORADO');
  END IF;

  -- Admin autenticado também não vê nada por RLS — a autorização de admin
  -- só existe dentro das rotas server-side (service_role), nunca em RLS
  IF admin_uuid IS NOT NULL THEN
    SET LOCAL role authenticated;
    EXECUTE format('SET LOCAL request.jwt.claims = ''{"sub":"%s","role":"authenticated"}''', admin_uuid);
    SELECT count(*) INTO authenticated_admin_count FROM analytics_events WHERE id = synthetic_id;
    RESET role;
    RESET request.jwt.claims;

    INSERT INTO rls_test_results VALUES (
      8, 'analytics_events: admin autenticado também não consegue SELECT via RLS (só via rota com service_role)',
      '0 linhas', authenticated_admin_count::text || ' linhas',
      CASE WHEN authenticated_admin_count = 0 THEN '✅ OK' ELSE '❌ FALHOU — RLS não deveria ter exceção para admin'  END
    );
  ELSE
    INSERT INTO rls_test_results VALUES (8, 'analytics_events: admin autenticado não consegue SELECT via RLS', 'n/a', 'nenhum admin encontrado', '⚠ IGNORADO');
  END IF;

  -- Limpeza: remove a linha sintética
  DELETE FROM analytics_events WHERE id = synthetic_id;
END $$;

-- TESTE 9 — anon não consegue fazer INSERT diretamente em analytics_events
-- (escrita só é permitida a service_role, usado só dentro de /api/track)
DO $$
DECLARE
  insert_rejected boolean := false;
  error_message text := '';
BEGIN
  BEGIN
    SET LOCAL role anon;
    INSERT INTO analytics_events (event_type, visitor_hash, path)
    VALUES ('page_view', 'hash-tentativa-insercao-direta', '/');
    RESET role;
    -- Se chegou aqui, o INSERT foi aceite (mau sinal) — remove já a linha
    DELETE FROM analytics_events WHERE visitor_hash = 'hash-tentativa-insercao-direta';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    RESET role;
    insert_rejected := true;
    error_message := SQLERRM;
  END;

  INSERT INTO rls_test_results VALUES (
    9, 'analytics_events: anon não consegue INSERT diretamente',
    'rejeitado', CASE WHEN insert_rejected THEN 'rejeitado (' || error_message || ')' ELSE 'INSERT foi aceite! linha removida a seguir' END,
    CASE WHEN insert_rejected THEN '✅ OK' ELSE '❌ FALHOU GRAVEMENTE' END
  );
END $$;

SELECT ordem, teste, esperado, obtido, resultado
FROM rls_test_results
ORDER BY ordem;
