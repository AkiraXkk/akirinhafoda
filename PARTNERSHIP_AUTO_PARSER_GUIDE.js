// ==========================================
// GUIA DE CONFIGURAÇÃO - Auto-Parser de Parcerias
// ==========================================
// Sistema criado: partnershipListener.js

// 📋 PASSO 1: CONFIGURAR O CANAL
// Edite a linha 11 do arquivo partnershipListener.js:
const CANAL_PARCERIAS_ID = "COLOQUE_O_ID_DO_CANAL_AQUI";
// 
// Substitua "COLOQUE_O_ID_DO_CANAL_AQUI" pelo ID real do seu canal de parcerias
// Exemplo: const CANAL_PARCERIAS_ID = "123456789012345678";

// 📋 PASSO 2: VERIFICAR INTENTS
// Certifique-se que seu bot tem os seguintes intents no src/index.js:
// GatewayIntentBits.GuildMessages,
// GatewayIntentBits.MessageContent,

// 📋 PASSO 3: FORMATO DAS MENSAGENS
// O sistema espera mensagens no seguinte formato:
// 
// Nome do Servidor
// @Representante (menção obrigatória)
// discord.gg/convite-aqui (link obrigatório)
// Descrição do servidor aqui...
// [Opcional: URL de imagem para banner]
//
// Exemplo prático:
// ```
// Servidor Gamer Pro
// @joao123
// discord.gg/gamerpro
// Servidor focado em jogos de FPS e MOBA com torneios semanais!
// https://imgur.com/banner.jpg
// ```

// 📋 PASSO 4: FUNCIONALIDADES AUTOMÁTICAS
// ✅ Extrai representante (menção)
// ✅ Extrai link do Discord e valida com fetchInvite
// ✅ Determina tier automaticamente (Bronze 350+, Prata 500+, Ouro 1000+)
// ✅ Extrai banner (anexo ou URL no texto)
// ✅ Extrai descrição (remove menções e links)
// ✅ Apaga mensagem original
// ✅ Envia embed formatado igual ao /partnership manual
// ✅ Salva em partners.json
// ✅ Atualiza staff_stats.json
// ✅ Dá cargo de parceiro ao representante
// ✅ Envia DM de confirmação

// 📋 PASSO 5: VALIDAÇÕES
// O sistema validará e pedirá correção se:
// ❌ Não houver menção de representante
// ❌ Não houver link do Discord
// ❌ Link do Discord for inválido/expirado
// ❌ Servidor estiver banido no Discord

// 📋 PASSO 6: BANCOS DE DADOS
// partners.json: Mesma estrutura do /partnership manual
// staff_stats.json: Incrementa "parcerias_fechadas"

// 📋 PASSO 7: BOTÕES DE AÇÃO
// O sistema cria botões "Aceitar" e "Recusar" com IDs:
// partnership_accept_MESSAGEID
// partnership_reject_MESSAGEID
//
// Esses botões já são tratados pelo seu sistema existente (interactionCreate.js)

// 📋 PASSO 8: CARGOS AUTOMÁTICOS
// Usa a mesma configuração do guildConfig.partnership.ranks:
// - bronze: ID do cargo Bronze
// - prata: ID do cargo Prata  
// - ouro: ID do cargo Ouro

// 📋 PASSO 9: MENSAGENS DE ERRO
// Se houver erro, o sistema envia mensagem efêmera apenas para o usuário
// e NÃO apaga a mensagem original para que ele possa corrigir.

// 📋 PASSO 10: LOGS
// Erros são registrados no logger com contexto do messageId

// ==========================================
// TESTE RÁPIDO
// ==========================================
// 1. Configure o ID do canal
// 2. Reinicie o bot
// 3. Envie uma mensagem de teste no canal de parcerias
// 4. Verifique se o embed foi criado corretamente
// 5. Verifique se os dados foram salvos no partners.json
// 6. Verifique se o representante recebeu o cargo e a DM

// ==========================================
// DICA IMPORTANTE
// ==========================================
// O sistema foi criado como um arquivo de evento SEPARADO
// para não interferir no seu messageCreate.js existente.
// Ele será carregado automaticamente pelo loadEvents.js.

// Se você quiser DESATIVAR temporariamente:
// 1. Renomeie o arquivo para _partnershipListener.js
// 2. Ou comente a linha const CANAL_PARCERIAS_ID = "COLOQUE_O_ID_DO_CANAL_AQUI";

// ==========================================
// SUPORTE
// ==========================================
// Se precisar de ajuda, verifique:
// 1. Se o ID do canal está correto
// 2. Se o bot tem permissão de ler/apagar mensagens no canal
// 3. Se o bot tem permissão de gerenciar cargos
// 4. Se o guildConfig.partnership está configurado
// 5. Logs de erro no console
