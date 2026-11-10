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
