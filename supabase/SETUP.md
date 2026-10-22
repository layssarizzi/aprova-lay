# Configuração necessária para ativar o acesso

O repositório não contém senha compartilhada, service-role key ou credenciais internas. Configure tudo diretamente no projeto Supabase correto, sem colocar segredos em variáveis `VITE_*`.

## 1. Projeto
Confirme que o projeto Supabase vinculado é o projeto esperado antes de aplicar qualquer migração. Esta integração não tem acesso direto ao banco nem à configuração do projeto, então nenhuma migração é declarada como aplicada.

## 2. Banco
Aplique `migrations/202610210001_foundation.sql` pelo fluxo de migrações do Supabase CLI ou pelo SQL Editor. A migração cria o catálogo dos três concursos, tabelas de sessões e tentativas, políticas RLS e rate limiting de login. Não cria provas, questões nem histórico fictício.

## 3. Usuário interno
Crie um usuário interno confirmado no Supabase Auth. Ele não precisa aparecer na interface. Configure o e-mail desse usuário como segredo `APP_AUTH_EMAIL`. A Edge Function gera um link de uso único no servidor e o troca por uma sessão Supabase; o usuário final informa somente a senha compartilhada.

## 4. Segredos da Edge Function
Defina os seguintes secrets no projeto:
- `APP_ACCESS_PASSWORD`: senha de acesso compartilhada definida pela proprietária, informada somente como segredo no painel/CLI.
- `APP_AUTH_EMAIL`: e-mail do usuário interno provisionado.
- `RATE_LIMIT_PEPPER`: valor aleatório longo, exclusivo para hash dos IPs.
- `APP_ALLOWED_ORIGIN`: origem exata do app publicado, por exemplo `https://seu-dominio.example` (recomendado; não deixe `*` em produção).
- Os secrets padrão do Supabase `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` devem estar disponíveis para a função.

## 5. Publicação e teste
Publique `password-login` e confirme:
- senha errada retorna 401;
- após 10 tentativas em 15 minutos, novas tentativas do mesmo IP recebem 429;
- senha correta cria sessão real;
- recarregar a página mantém a sessão;
- sair encerra a sessão;
- usuário não autenticado não lê tabelas protegidas;
- um usuário não consegue ler ou alterar registros com outro `user_id`.

A função usa rate limiting persistido no banco por hash de IP. Configure `APP_ALLOWED_ORIGIN` com a origem real do app antes de produção.
