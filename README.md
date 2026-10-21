# Vizinho Certo

Aplicacao hiperlocal estatica, com APIs serverless na Vercel, autenticacao e dados no Supabase, checkout no Stripe e notificacoes Web Push.

## Desenvolvimento local

1. Instale Node.js 22 ou superior.
2. Execute `npm ci`.
3. Copie `.env.example` para `.env.local` e preencha apenas credenciais de desenvolvimento.
4. Execute `npm run dev`.
5. Abra `http://127.0.0.1:3000`.

Nunca versionar `.env.local`, chaves `service_role`, segredos Stripe, Groq ou VAPID.

## Validacao

- `npm test`: regras de distancia e fallback de mesma rua.
- `npm run check`: sintaxe dos principais arquivos server-side.
- `npm audit --omit=dev`: dependencias de producao.
- `npm run backfill:locations`: somente diagnostica perfis sem coordenadas.
- `npm run backfill:locations:apply`: valida CEP, municipio e UF na BrasilAPI, geocodifica sequencialmente os perfis validos e atualiza anuncios sem coordenadas. Nominatim e usado somente como fallback.

## Preparacao para Android e iOS

O webapp continua sendo a unica aplicacao publicada. Ainda nao existe projeto nativo, pacote de loja ou dependencia do Capacitor.

- `app-runtime.js` centraliza a origem das APIs sem alterar as URLs usadas no navegador.
- `install-app.js` registra o service worker, aciona a instalacao nativa no Android quando disponivel e mostra o passo a passo correto do Safari no iPhone.
- Em um futuro container Capacitor, as chamadas passam automaticamente a usar `https://www.vizinhocerto.com.br`.
- Ambientes de homologacao podem definir `window.__VIZINHO_CERTO_CONFIG__.apiOrigin` antes de carregar `app-runtime.js`.
- O manifesto inclui os PNGs de 192 px, 512 px e o icone Apple exigidos pelas etapas de empacotamento.

Quando o projeto nativo for iniciado, ainda sera necessario configurar CORS/origens permitidas, deep links, permissoes e notificacoes para cada plataforma, gerar os projetos Android/iOS e cumprir os formularios das lojas.

As landings oferecem instalacao no bloco "Adicione na tela inicial". Dentro do webapp, a mesma acao fica em destaque no topo da aba Perfil; quando aberto pelo icone instalado, o cartao confirma que o Vizinho Certo ja esta na tela inicial.

## Fluxo de anuncios

1. O cadastro geocodifica o endereco antes de criar o perfil.
2. O checkout autentica o usuario, valida categoria/plano no servidor e carrega a localizacao do perfil.
3. O webhook confirma o pagamento e publica o anuncio de forma idempotente.
4. `/api/anuncios-visiveis` autentica o visitante e filtra anuncios no servidor.
5. Quando coordenadas estiverem indisponiveis, o fallback exige rua e CEP normalizados iguais.
6. O anunciante recebe `meus_anuncios`, uma lista autenticada dos proprios anuncios ativos, inclusive expirados, para editar ou excluir sem depender do filtro de distancia.

Coordenadas e endereco dos anunciantes nao sao devolvidos ao navegador. Usuarios com localizacao incompleta recebem uma indicacao para atualizar o perfil.

## Monitoramento de links

1. As paginas publicas com `landing-analytics.js` registram o caminho acessado e apenas parametros de campanha permitidos.
2. A localizacao aproximada usa os cabecalhos de cidade, regiao e pais fornecidos pela Vercel. IP, CEP e coordenadas nao sao armazenados.
3. Uma conversao acontece quando a mesma sessao anonima registra `landing_view` e depois `signup_completed` dentro do periodo selecionado.
4. `/dashboard` exige uma conta presente em `DASHBOARD_ADMIN_EMAILS` e mostra desempenho por link e os acessos recentes com identificadores anonimos.
5. Dados anteriores a essa instrumentacao continuam no historico, mas podem aparecer como `Localizacao indisponivel`.

## Eventos locais

1. A aba `Eventos` mostra somente eventos aprovados da cidade e UF do perfil autenticado.
2. Os filtros `Hoje`, `7 dias` e `30 dias` incluem eventos em andamento dentro da janela escolhida.
3. Moradores podem sugerir ate cinco eventos por 24 horas. Toda sugestao entra como `pendente` e nao e publicada diretamente.
4. O dashboard administrativo permite revisar a data, o local e a fonte antes de aprovar ou rejeitar a sugestao.
5. A tabela usa RLS e nao concede acesso direto a `anon` ou `authenticated`; leitura e escrita passam pelas APIs autenticadas do servidor.
6. Sao Joao da Boa Vista recebe uma coleta automatica diaria das paginas e do feed oficiais da Prefeitura. Apenas registros com data futura, horario e local inequivocos sao aceitos.
7. Eventos dessa fonte oficial entram como `aprovado`; conteudo ambiguo e ignorado. Um UUID derivado da URL e a deduplicacao por horario/local tornam a coleta idempotente, inclusive se a Vercel entregar o cron mais de uma vez.
8. O GitHub Actions le as fontes publicas e envia os campos normalizados para `/api/eventos-coletar` diariamente as 09:00 UTC (06:00 em Sao Paulo). A API revalida cada campo e valida o token OIDC de curta duracao, o repositorio, a branch e o workflow; nenhuma chave do Supabase fica armazenada no GitHub.

Antes de disponibilizar o recurso, aplique `supabase/eventos.sql` no projeto Supabase correspondente e valide os advisors de seguranca e desempenho. Novas fontes automaticas devem comecar em moderacao; aprovacao direta fica restrita a fontes oficiais com estrutura validada.

## Publicacao

A producao principal esta na Vercel. Validar a URL de preview, os fluxos autenticados e as APIs antes de promover ou enviar mudancas para `main`. O GitHub Pages serve somente os arquivos estaticos e nao substitui as APIs da Vercel.
