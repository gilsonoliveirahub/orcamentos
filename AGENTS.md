<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# Método de trabalho — Gilson Oliveira

Orientação registada em 14 de setembro de 2026. Aplicar ao trabalho neste repositório, respeitando as instruções atuais do utilizador e as permissões do ambiente.

## Antes de alterar
- Comunicar em português de Portugal, com explicações claras e concisas.
- Ler as instruções aplicáveis e confirmar o estado real do código. Distinguir decisões do utilizador, funcionalidades implementadas e ideias futuras.
- Inspecionar branch, git status e diferenças locais. Preservar trabalho anterior e alterações de outras tarefas; nunca usar git reset --hard ou git clean para limpar uma experiência.
- Em tarefas complexas, apresentar um plano curto, âmbito e critérios de aceitação. Prosseguir com trabalho autorizado; perguntar apenas quando faltar uma decisão material.
- Evoluir o projeto existente por fases. Relacionar a alteração com conversão, receita, qualidade do serviço ou tempo poupado.

## Execução e continuidade
- Executar autonomamente leituras, alterações reversíveis e verificações necessárias ao pedido, dentro das permissões existentes.
- Autorizações anteriores continuam válidas dentro do respetivo âmbito. Este manual não autoriza publicações, despesas, mensagens a terceiros nem alterações destrutivas.
- Quando houver trabalho paralelo autorizado e útil, atribuir tarefas delimitadas e usar branches/worktrees independentes para edições concorrentes. Rever a integração.
- Usar fontes e integrações disponíveis para confirmar o contexto. Não colocar credenciais ou dados pessoais de clientes no repositório.
- Ao interromper ou mudar de dispositivo, entregar um ponto de situação: branch/commit, alterações pendentes, verificações realizadas, bloqueios e próxima ação. Não presumir que um processo local continua com o computador desligado.
- Registar correções recorrentes como orientações breves, com data e âmbito; não converter uma preferência temporária numa regra permanente.

## Entrega e verificação
- Definir o resultado observável antes de implementar. Verificar o comportamento alterado e os percursos relacionados com risco concreto.
- Para interfaces, abrir a página e testar as interações relevantes em ecrã móvel e desktop quando o ambiente permitir. Um build bem-sucedido não comprova o funcionamento no navegador.
- Para cálculos, conferir unidades, pressupostos, exemplos e casos limite. Para dados, distinguir resultados reais de estimativas e testes.
- Executar os comandos existentes adequados à alteração. Corrigir erros introduzidos; identificar separadamente falhas anteriores.
- Usar dados de teste e serviços em modo de teste quando a verificação cria registos, envia mensagens ou envolve pagamentos.
- Não afirmar que foi testado, integrado ou publicado sem evidência. Se faltar navegador, dependências ou acesso, indicar exatamente o que não foi verificado.
- No final, informar o que mudou, como foi verificado, limitações e estado de commit/publicação.
- Mudanças apenas em documentação requerem revisão do conteúdo e do diff; não exigem executar toda a aplicação.

## Automatização gradual
- Transformar processos repetidos em procedimentos reutilizáveis; criar skills apenas quando houver um processo estável e seguindo as instruções de criação de skills do ambiente.
- Introduzir hooks/CI depois de validar manualmente os comandos. Preferir verificações rápidas e determinísticas; não executar uma bateria completa após cada edição.
- Manuais orientam o agente: não substituem permissões técnicas, testes executados ou verificações automáticas.

## FaçoPorTi
- Objetivo: pedidos qualificados que se convertam em trabalhos concluídos; acompanhar o percurso pedido → contacto → aceitação → fecho e o valor efetivamente fechado.
- Preservar as perguntas e o aspeto atual do questionário. A experiência visual e a mudança de texto de “Estuque e Pladur” foram suspensas pelo utilizador; não as retomar sem nova instrução.
- Respeitar os âmbitos separados de lib/analytics.ts, scripts/backup/ e da landing /exclusivo; não incluir essas alterações incidentalmente noutra tarefa.
- Não alterar preços, estimativas, criação de leads, APIs ou base de dados como efeito secundário de tarefas de documentação ou apresentação.
- Comandos disponíveis: npm run lint, npm test (Vitest), npm run build. Selecionar os testes relevantes e executar a bateria mais ampla quando a alteração o justificar.
- Na próxima melhoria do funil, verificar estimativa, submissão, acesso do profissional e fecho usando dados de teste; não contactar profissionais reais para testar.
