# Vizinho Certo Android — handoff para o Codex do Luís

## Estado do trabalho

- O app Android é uma Trusted Web Activity (TWA) gerada com Bubblewrap e abre `https://www.vizinhocerto.com.br/app`.
- Identificador fixo: `br.com.vizinhocerto.app`. Nome: `Vizinho Certo`. `versionCode` atual: `4`; aumente-o para cada nova versão enviada à Play Console.
- A pasta `android/` contém o projeto-fonte necessário para gerar de novo o app. APKs, AABs e pastas de build ficam fora do Git.
- `.well-known/assetlinks.json` liga o domínio ao app e atualmente usa a impressão SHA-256 da chave de upload local. Quando a Play Console configurar o Play App Signing, confira e inclua também a impressão do certificado de assinatura do app fornecida pela Play Console.
- As alterações desta branch incluem entrada mais visível para Serviços, avaliações de prestadores, localização GPS temporária para refinar resultados durante a sessão e a migration do banco de avaliações.

## Gerar APK/AAB assinado

1. Abra a pasta `android/` no terminal e confirme que Java, Android SDK e Node.js estão disponíveis. A toolchain validada em 02/11/2026 usa Node.js 22, JDK 17, Android SDK 36, Build Tools 36.1.0, Gradle 8.11.1 e Bubblewrap 1.27.0. Rode `pnpm dlx @bubblewrap/cli@1.27.0 doctor` antes do build. O pin da versão evita que uma atualização futura do CLI regenere o projeto de forma diferente.
2. Solicite ao Vinícius o arquivo `vizinhocerto-upload.keystore` por um canal privado. Copie-o para `android/vizinhocerto-upload.keystore`; esse caminho está ignorado pelo Git. O alias é `vizinhocerto-upload`.
3. Rode `pnpm dlx @bubblewrap/cli build` na pasta `android/`. Para repetir exatamente a toolchain validada, use `pnpm dlx @bubblewrap/cli@1.27.0 build`. Se o comando detectar mudanças no `twa-manifest.json`, interrompa e revise o diff antes de regenerar; `bubblewrap update` pode sobrescrever arquivos e incrementar a versão. Use `pnpm dlx @bubblewrap/cli@1.27.0 update --skipVersionUpgrade` somente quando a mudança não representar uma nova versão da Play Store.
4. Digite as senhas da keystore/chave somente no terminal local. O terminal pode não exibir os caracteres; não as envie ao Codex, chat, WhatsApp ou GitHub.
5. O Bubblewrap gera `app-release-signed.apk` para teste direto em aparelho e `app-release-bundle.aab` para uma futura submissão na Play Console. Esses binários são artefatos locais, não arquivos-fonte do Git.

Para validar a compilação sem a chave, pode-se usar `pnpm dlx @bubblewrap/cli@1.27.0 build --skipSigning`. Esse comando gera somente artefatos sem assinatura, que não substituem o APK/AAB finais.

Não crie uma keystore nova para gerar atualizações do mesmo app. A chave de upload precisa ser preservada para as próximas versões. Nunca inclua a keystore ou senhas em commits.

## Cuidados com o projeto e publicação

- Faça alterações em branch própria e proponha um Pull Request para `main`. Não faça merge nem deploy em produção sem combinar com o Vinícius.
- Preserve todas as landing pages, rotas públicas e o domínio atual. Mantenha `/app` como entrada do app.
- Antes de usar `bubblewrap update`, verifique o diff: o Bubblewrap pode regenerar arquivos Android. Prefira manter configurações em `twa-manifest.json` e revisar os arquivos gerados.
- A migration `supabase/migrations/20261102182551_add_provider_ratings.sql` cria a base de avaliações. Não a aplique no Supabase de produção sem conferir o projeto vinculado, revisar RLS/permissões e obter autorização do Vinícius.
- Antes de submeter à Play Store, revisar a [política de pagamentos do Google Play](https://support.google.com/googleplay/android-developer/answer/18265346) para os planos pagos de divulgação. Se a compra liberar divulgação, destaque ou outra funcionalidade digital dentro do app, a regra geral exige o sistema de cobrança do Google Play, salvo uma exceção aplicável. Confirmar o enquadramento e o fluxo de compra antes da submissão, além de privacidade, permissões e conteúdo. O AAB gerado não significa aprovação automática.

## Prompt para iniciar no Codex

Você está no repositório `viniciusbergantini-blip/vizinho-certo`, na branch de handoff do Vizinho Certo Android. Leia primeiro este documento e depois inspecione o diff inteiro da branch contra `main`. O produto é um app de vizinhança já em uso, com várias landing pages que precisam continuar funcionando. A versão Android é uma TWA Bubblewrap que abre `/app`; não transforme o site em outro framework nem altere o identificador `br.com.vizinhocerto.app`.

Revise as mudanças de localização, avaliações e migration, verifique o projeto Android e identifique o que falta para um build reproduzível. Gere localmente APK/AAB assinados somente se a keystore original for fornecida pelo Vinícius por canal privado. Não revele nem registre senhas. Não gere uma nova keystore, não suba keystores/APKs/AABs/saídas de build ao GitHub, não aplique migrations no Supabase de produção e não faça merge/deploy de produção sem autorização. Preserve as landing pages e faça mudanças adicionais em branch com Pull Request. Ao terminar, informe o que foi verificado, o que precisa de ação manual do Vinícius e os caminhos dos artefatos locais.
