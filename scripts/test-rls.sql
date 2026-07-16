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

SELECT ordem, teste, esperado, obtido, resultado
FROM rls_test_results
ORDER BY ordem;
