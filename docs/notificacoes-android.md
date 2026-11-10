# Notificações no Android

Correção de 10/11/2026: os envios de publicação e comentário agora são aguardados antes de encerrar a requisição. O envio solto podia ser suspenso na Vercel e continuar apenas na próxima requisição. O SOS já aguardava.

No Perfil:
- **Testar notificação neste aparelho** registra a inscrição e envia somente para ela. O retorno informa aceitação pelo serviço push, não confirma exibição/leitura. Não cria SOS.
- **Receber resumo diário da vizinhança** aparece no Android aberto pelo app da Play Store (`vc_play_store=1`/referrer TWA). É uma preferência por inscrição/aparelho, desativada por padrão.
- **Compartilhar com vizinhos e amigos** abre o compartilhamento do sistema, com cópia de link como alternativa.

O workflow `notificacoes-android.yml` chama a API com OIDC do GitHub, sem segredo permanente. Agenda: 22h UTC (19h de Brasília); GitHub pode atrasar. O servidor só envia entre 18h e 21h de Brasília. Execução manual tem simulação habilitada por padrão.

O resumo requer `push_tokens.plataforma=android` e `automaticas=true`. Usa publicações das últimas 24h dentro do raio do destinatário (máximo 500m), exclui próprias, SOS e autores bloqueados em ambos os sentidos. Não envia se não há novidades. Não usa eventos removidos nem inventa atividade. A tabela privada `push_digest_deliveries` reserva um envio por pessoa/dia antes de enviar, evitando duplicação concorrente. Uma falha após reservar não é repetida no mesmo dia.

Envios usam urgência alta e timeout de 8s. SOS expira em 10 minutos; outros avisos em 24h. Inscrições rejeitadas com 404/410 são removidas. O cadastro agora verifica erros e mostra falha no perfil, em vez de informar sucesso sem salvar. Sair da conta remove a inscrição do aparelho.

Não é necessário novo AAB para estas mudanças: o Android 1.0.5 (9) já carrega o app hospedado e habilita notificações. Fechar/reabrir com internet carrega a atualização. O teste final precisa confirmar a chegada no Android, incluindo com o app em segundo plano; permissões e economia de bateria do aparelho podem afetar a entrega.

Validação: `npm run check:notifications`, `npm test`, `npm run build`.
Teste real: Perfil → Testar notificação; depois outra conta próxima publica/comenta. SOS só em teste combinado. Ativar/desativar resumo e reabrir para confirmar persistência. Nunca assumir que aceitação push comprova recebimento.

## Sessão inválida ao testar SOS

O teste do usuário retornou `Sessao invalida`, e não houve novo registro de SOS. O Android estava exibindo uma conta local, mas a autenticação da API recusou a operação antes de publicar/enviar. A partir deste ajuste, SOS e operações de notificação usam uma chamada autenticada que renova o token após um 401 e repete uma única vez. Não repete erros de rede, pois uma requisição incerta poderia já ter sido processada. Se a renovação falha, pede login e avisa que não enviou. Troca de conta cancela a tentativa. Falhas temporárias do serviço de autenticação retornam 503 para evitar tratar indisponibilidade como sessão expirada. O runtime tem URL versionada para impedir que um script antigo em cache impeça a abertura do app atualizado.

## Som exclusivo de SOS — Android 1.0.6 (10)

O usuário confirmou chegada de SOS e publicação após a correção de sessão. O som diferenciado é uma alteração nativa e exige instalar o novo AAB pelo teste interno.

`DelegationService` reconhece somente os títulos exatos de SOS e de teste pessoal produzidos pelo backend. Avisos comuns continuam no tratamento original do Android Browser Helper. SOS usa o canal estável `vc_sos_v1` / **Alertas SOS**, importância alta, toque original `res/raw/sos_alert.wav` (2,15s, três pares de bipes) e vibração distinta. A URI usa nome do recurso para sobreviver à atualização. O canal preserva escolhas do usuário; não contorna silencioso ou Não Perturbe. Android 7 usa som/vibração por notificação. O gerador reproduzível é `scripts/generate-sos-sound.js`.

No Perfil do Android há **Testar som do SOS só neste aparelho**. A API valida sessão, procura a inscrição desse usuário/aparelho e envia exclusivamente para ela. Não grava um SOS, não altera o feed e não seleciona vizinhos. iPhone não recebe som personalizado por esta implementação.

Pacote: `android/VizinhoCerto-1.0.6-v10-Som-SOS.aab`. Assinatura interativa: `android/assinar-versao-1.0.6.ps1`, saída `VizinhoCerto-1.0.6-v10-Som-SOS-signed.aab`. Não armazenar senha. Notas para a versão:

```
<pt-BR>
Som e vibração exclusivos para alertas SOS no Android. Novo teste de som no perfil, enviado somente para o próprio aparelho. Melhorias nas notificações e na recuperação de sessão.
</pt-BR>
```

Validação: `gradlew.bat testDebugUnitTest bundleRelease` (3 testes Java), testes Node (130), build público. Não havia aparelho conectado por USB: confirmação auditiva final fica para o Android do usuário atualizado para 1.0.6 (10), aberto pelo ícone do app. Testar primeiro notificação comum e depois som SOS, sem alertar a vizinhança.
