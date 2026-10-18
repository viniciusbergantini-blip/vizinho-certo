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

## Fluxo de anuncios

1. O cadastro geocodifica o endereco antes de criar o perfil.
2. O checkout autentica o usuario, valida categoria/plano no servidor e carrega a localizacao do perfil.
3. O webhook confirma o pagamento e publica o anuncio de forma idempotente.
4. `/api/anuncios-visiveis` autentica o visitante e filtra anuncios no servidor.
5. Quando coordenadas estiverem indisponiveis, o fallback exige rua e CEP normalizados iguais.
6. O anunciante recebe `meus_anuncios`, uma lista autenticada dos proprios anuncios ativos, inclusive expirados, para editar ou excluir sem depender do filtro de distancia.

Coordenadas e endereco dos anunciantes nao sao devolvidos ao navegador. Usuarios com localizacao incompleta recebem uma indicacao para atualizar o perfil.

## Publicacao

A producao principal esta na Vercel. Validar a URL de preview, os fluxos autenticados e as APIs antes de promover ou enviar mudancas para `main`. O GitHub Pages serve somente os arquivos estaticos e nao substitui as APIs da Vercel.
