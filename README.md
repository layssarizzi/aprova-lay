# Aprova Lay — Etapa 1: Fundação

Aplicativo pessoal e responsivo para organizar a preparação para concursos. Esta etapa entrega a estrutura visual, autenticação preparada para validação no backend, base de dados versionada e dashboard com estados vazios reais.

## Concursos iniciais
- Transpetro — Analista de Sistemas/TI
- SEPLAG-RJ — Analista de Planejamento e Orçamento, Tecnologia da Informação
- CREMERJ — Analista de Ciência e Análise de Dados

## Stack
- React + TypeScript + Vite
- Supabase Auth, Postgres e Row Level Security (RLS)
- PWA com manifesto, ícones e service worker próprio

## Desenvolvimento
1. Instale Node.js LTS.
2. Copie `.env.example` para `.env.local` e preencha as variáveis públicas do Supabase.
3. Execute `npm install` e `npm run dev`.

Não coloque senhas, service-role keys ou outros segredos em variáveis `VITE_*`. O valor de acesso compartilhado deve existir somente como segredo de servidor, nunca neste repositório ou no bundle público.

## Configuração do Supabase pendente
O código de migração está em `supabase/migrations` e a Edge Function de autenticação em `supabase/functions/password-login`. Para ativar o acesso:
- aplicar a migração no projeto Supabase correto;
- configurar os segredos da Edge Function conforme `supabase/SETUP.md`;
- provisionar o usuário interno de autenticação;
- publicar a função e testar login/logout, sessão e RLS.

Essas operações dependem de acesso ao projeto Supabase e não são consideradas concluídas apenas pela presença dos arquivos no GitHub.

## Etapa 1 — limites
Ainda não há importação de PDFs, motor de questões, simulados, correção automática ou histórico fictício. Os indicadores mostram zero/estado vazio até existirem registros reais.
