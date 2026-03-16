const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits
} = require("discord.js");

const LIDERANCA = ["Chefe", "Sub-Chefe", "Gerente", "Coordenador", "Supervisores"];
const AREAS = ["Equipe Recrutamento", "Equipe Divulgação", "Equipe Eventos", "Equipe MovCall", "Equipe MovChat", "Equipe Acolhimento", "Equipe Design", "Equipe Pastime"];
const DIAS_MINIMOS_SERVIDOR = 15;
const DIAS_MINIMOS_CONTA = 30;
const ID_CANAL_LOGS_STAFF = "831327701214298182";

const ROLE_WEIGHTS = {
  "Chefe": 60,
  "Sub-Chefe": 50,
  "Gerente": 40,
  "Coordenador": 30,
  "Supervisores": 20,
  "Equipe Recrutamento": 15,
  "Staff Geral": 1
};

for (const area of AREAS) {
  if (!ROLE_WEIGHTS[area]) ROLE_WEIGHTS[area] = 5;
}

const ASPIRANTE_ID = "1097700110126809140";
const LIDERANCA_SET = new Set(LIDERANCA);
const AREAS_SET = new Set(AREAS);
const ROLES_VALIDOS = new Set([...LIDERANCA_SET, ...AREAS_SET]);
const LIDERANCA_TOP3 = new Set(LIDERANCA.slice(0, 3)); // Chefe, Sub-Chefe, Gerente

const diasDesde = (timestamp) => Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recrutamento")
    .setDescription("Painel de contratação e entrevistas da Staff")
    .addSubcommand(sub => 
      sub.setName("painel")
      .setDescription("Abre o painel para adicionar cargos de áreas a um membro")
      .addUserOption(opt => opt.setName("membro").setDescription("Membro que será gerenciado").setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName("entrevista")
      .setDescription("Cria uma sala privada de entrevista com o candidato")
      .addUserOption(opt => opt.setName("candidato").setDescription("Membro a ser entrevistado").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const executor = interaction.member;

    // ==========================================
    // PAINEL DE CONTRATAÇÃO (C/ AUTO-ASPIRANTE)
    // ==========================================
    if (sub === "painel") {
      const alvo = interaction.options.getMember("membro");
      if (!alvo) return interaction.reply({ content: "❌ Membro não encontrado no servidor.", ephemeral: true });

      // 🛡️ TRAVAS DE SEGURANÇA
      if (alvo.user.bot) return interaction.reply({ content: "❌ Bots não podem ser recrutados.", ephemeral: true });
      if (alvo.id === interaction.user.id) return interaction.reply({ content: "❌ Você não pode alterar sua própria hierarquia.", ephemeral: true });
      const idadeConta = diasDesde(alvo.user.createdTimestamp);
      if (idadeConta < DIAS_MINIMOS_CONTA) {
        return interaction.reply({ content: `❌ **Recusado:** Conta suspeita. O Discord de ${alvo.user.username} foi criado há apenas ${idadeConta} dias (Mínimo: ${DIAS_MINIMOS_CONTA}).`, ephemeral: true });
      }

      // 🛑 FILTRO DE PRÉ-REQUISITOS (Tempo de Servidor e Conta)
      const diasNoServidor = alvo.joinedTimestamp ? diasDesde(alvo.joinedTimestamp) : 0;
      if (diasNoServidor < DIAS_MINIMOS_SERVIDOR) {
        return interaction.reply({ content: `❌ **Recusado:** ${alvo.user.username} está no servidor há apenas ${diasNoServidor} dias. O mínimo é ${DIAS_MINIMOS_SERVIDOR} dias.`, ephemeral: true });
      }

      const isAdmin = executor.permissions.has(PermissionFlagsBits.Administrator);
      const executorRoleNames = new Set(executor.roles.cache.map(r => r.name));
      const hasEquipeRecrutamento = executorRoleNames.has("Equipe Recrutamento");
      const pesoExecutor = executor.roles.cache.reduce((max, role) => {
        const peso = ROLE_WEIGHTS[role.name] || 0;
        return peso > max ? peso : max;
      }, 0);
      const isGerenteOuSuperior = [...LIDERANCA_TOP3].some(roleName => executorRoleNames.has(roleName));
      const pesoLimite = isAdmin ? Number.MAX_SAFE_INTEGER : pesoExecutor;

      if (pesoExecutor === 0 && !isAdmin && !hasEquipeRecrutamento) {
        return interaction.reply({ content: "❌ Você não tem permissão na hierarquia para usar este painel.", ephemeral: true });
      }

      const buildPanel = () => {
        const embed = new EmbedBuilder()
          .setTitle("🫡 Painel de Contratação WDA")
          .setColor("#ff9ff3")
          .setDescription(`Gerenciando: ${alvo.user}\nExecutor: ${executor.user}\n\n*Nota: Ao adicionar o membro em uma equipe, ele receberá automaticamente os cargos **Aspirante** e **Staff Geral**.*`)
          .setFooter({ text: "Apenas cargos abaixo da sua hierarquia estão visíveis." });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("select_roles_recrutamento")
          .setPlaceholder("Selecione um cargo de área...")
          .setMinValues(1)
          .setMaxValues(1);

        let optionsAdded = 0;
        if (isGerenteOuSuperior && !isAdmin && !hasEquipeRecrutamento) {
          for (const area of AREAS) {
            if (!executorRoleNames.has(area)) continue;
            const roleNaGuild = interaction.guild.roles.cache.find(r => r.name === area);
            if (!roleNaGuild) continue;
            const temCargo = alvo.roles.cache.has(roleNaGuild.id);
            selectMenu.addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel(area)
                .setDescription(temCargo ? "🟢 Possui (Clique para Remover)" : "🔴 Não possui (Clique para Adicionar)")
                .setValue(roleNaGuild.id)
            );
            optionsAdded++;
          }
        } else {
          for (const roleName of ROLES_VALIDOS) {
            const peso = ROLE_WEIGHTS[roleName] || 0;
            if (peso < pesoLimite) {
              const roleNaGuild = interaction.guild.roles.cache.find(r => r.name === roleName);
              if (roleNaGuild) {
                const temCargo = alvo.roles.cache.has(roleNaGuild.id);
                selectMenu.addOptions(
                  new StringSelectMenuOptionBuilder()
                    .setLabel(roleName)
                    .setDescription(temCargo ? "🟢 Possui (Clique para Remover)" : "🔴 Não possui (Clique para Adicionar)")
                    .setValue(roleNaGuild.id)
                );
                optionsAdded++;
              }
            }
          }
        }

        const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
        const btnFinalizar = new ButtonBuilder().setCustomId("finalizar_painel_recrutamento").setLabel("Finalizar e Anunciar").setStyle(ButtonStyle.Success).setEmoji("✅");
        const rowBtn = new ActionRowBuilder().addComponents(btnFinalizar);

        return { embeds: [embed], components: optionsAdded > 0 ? [rowMenu, rowBtn] : [] };
      };

      await interaction.deferReply({ ephemeral: true }); // Painel oculto para não sujar o chat
      const msg = await interaction.editReply({ ...buildPanel(), fetchReply: true });
      
      const collector = msg.createMessageComponentCollector({ time: 120000 });

      collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ Este painel não é seu.", ephemeral: true });

        // SE CLICOU NO MENU
        if (i.isStringSelectMenu() && i.customId === "select_roles_recrutamento") {
          const roleId = i.values[0];
          const role = interaction.guild.roles.cache.get(roleId);
          if (!role) return i.reply({ content: "❌ Cargo inválido ou inexistente.", ephemeral: true });
          const isLideranca = LIDERANCA_SET.has(role.name);
          const isArea = AREAS_SET.has(role.name);

          if (!alvo.roles.cache.has(roleId)) {
            const liderancasAtuais = alvo.roles.cache.filter(r => LIDERANCA_SET.has(r.name)).size;
            if (isLideranca && liderancasAtuais >= 1) {
              return i.reply({ content: "❌ Limite de 1 cargo de liderança por membro. Remova o cargo atual antes de atribuir outro.", ephemeral: true });
            }

            const areasAtuais = alvo.roles.cache.filter(r => AREAS_SET.has(r.name)).size;
            if (isArea && areasAtuais >= 3) {
              return i.reply({ content: "❌ Limite de 3 cargos de áreas operacionais por membro. Remova um antes de adicionar outro.", ephemeral: true });
            }
          }

          await i.deferUpdate();

          if (alvo.roles.cache.has(roleId)) {
            await alvo.roles.remove(roleId).catch(() => {});
          } else {
            await alvo.roles.add(roleId).catch(() => {});
            const roleStaffGeral = interaction.guild.roles.cache.find(r => r.name === "Staff Geral");
            if (!alvo.roles.cache.has(ASPIRANTE_ID)) alvo.roles.add(ASPIRANTE_ID).catch(() => {});
            if (roleStaffGeral && !alvo.roles.cache.has(roleStaffGeral.id)) alvo.roles.add(roleStaffGeral.id).catch(() => {});
          }
          await interaction.editReply(buildPanel());
        }

        // SE CLICOU NO BOTÃO FINALIZAR
        if (i.isButton() && i.customId === "finalizar_painel_recrutamento") {
          await i.deferUpdate();
          const areasSetadas = alvo.roles.cache
            .filter(r => ROLES_VALIDOS.has(r.name))
            .map(r => `**${r.name}**`);

          // 📢 Anúncio Público
          const embedAnuncio = new EmbedBuilder()
            .setTitle("🎉 Recrutamento Finalizado!")
            .setColor("#2ecc71")
            .setDescription(`O processo foi concluído! O membro ${alvo.user} agora atua nas seguintes áreas da WDA:\n\n${areasSetadas.length > 0 ? areasSetadas.join("\n") : "*Nenhuma área específica setada.*"}\n\nDêem as boas-vindas e bom trabalho!`)
            .setFooter({ text: `Recrutado por ${executor.user.username}` });

          await interaction.channel.send({ content: `${alvo.user}`, embeds: [embedAnuncio] });
          
          // 📨 Notificação na DM do Candidato
          alvo.send({ content: `🎉 Parabéns, ${alvo.user.username}! Você foi oficialmente integrado à Staff da WDA por ${executor.user.username}. Leia os canais da equipe e bom trabalho!` }).catch(() => {});

          // 👁️ Log de Auditoria Privado
          const canalLogs = interaction.guild.channels.cache.get(ID_CANAL_LOGS_STAFF);
          if (canalLogs) {
             const embedLog = new EmbedBuilder()
               .setTitle("🛡️ Log de Recrutamento")
               .setColor("#3498db")
               .addFields(
                 { name: "Recrutador", value: `${executor.user} (\`${executor.id}\`)`, inline: true },
                 { name: "Recrutado", value: `${alvo.user} (\`${alvo.id}\`)`, inline: true },
                 { name: "Cargos Atuais", value: areasSetadas.length > 0 ? areasSetadas.join(", ") : "Nenhum cargo de hierarquia" }
               )
               .setTimestamp();
             canalLogs.send({ embeds: [embedLog] });
          }

          await interaction.editReply({ content: "✅ O recrutamento foi concluído e anunciado!", embeds: [], components: [] });
          collector.stop();
        }
      });

      collector.on("end", () => { interaction.editReply({ components: [] }).catch(()=>{}); });
    }

    // ==========================================
    // SISTEMA DE ENTREVISTA PRIVADA
    // ==========================================
    if (sub === "entrevista") {
      const candidato = interaction.options.getMember("candidato");
      if (!candidato) return interaction.reply({ content: "❌ Candidato não encontrado.", ephemeral: true });

      // 🛡️ TRAVAS DE SEGURANÇA
      if (candidato.user.bot) return interaction.reply({ content: "❌ Não fazemos entrevistas com bots.", ephemeral: true });
      if (candidato.id === interaction.user.id) return interaction.reply({ content: "❌ Você não pode entrevistar a si mesmo.", ephemeral: true });

      // 🛑 FILTRO DE PRÉ-REQUISITOS
      const idadeConta = diasDesde(candidato.user.createdTimestamp);
      if (idadeConta < DIAS_MINIMOS_CONTA) {
        return interaction.reply({ content: `❌ **Recusado:** Conta suspeita. O Discord de ${candidato.user.username} foi criado há apenas ${idadeConta} dias (Mínimo: ${DIAS_MINIMOS_CONTA}).`, ephemeral: true });
      }
      const diasServidorCandidato = candidato.joinedTimestamp ? diasDesde(candidato.joinedTimestamp) : 0;
      if (diasServidorCandidato < DIAS_MINIMOS_SERVIDOR) {
        return interaction.reply({ content: `❌ **Recusado:** ${candidato.user.username} está no servidor há apenas ${diasServidorCandidato} dias. O mínimo é ${DIAS_MINIMOS_SERVIDOR} dias.`, ephemeral: true });
      }

      await interaction.reply({ content: "⏳ Montando as salas de entrevista...", ephemeral: true });

      try {
        const guild = interaction.guild;
        const perms = [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: executor.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] },
          { id: candidato.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] }
        ];

        // Cria os canais
        const chatEntrevista = await guild.channels.create({ name: `💬・entrevista-${candidato.user.username}`, type: ChannelType.GuildText, permissionOverwrites: perms });
        const callEntrevista = await guild.channels.create({ name: `🔊・Call ${candidato.user.username}`, type: ChannelType.GuildVoice, permissionOverwrites: perms });

        const embedSalas = new EmbedBuilder()
          .setTitle("🤝 Sala de Entrevista WDA")
          .setColor("#ff9ff3")
          .setDescription(`Olá ${candidato.user}, esta é a sua sala privada de entrevista!\n\nO recrutador ${executor.user} irá conduzir o processo com você no canal de voz abaixo: <#${callEntrevista.id}>\n\n*(Recrutador: Utilize o botão abaixo para apagar estas salas quando terminar)*`);

        // 🧠 O SEGREDO ANTI-CRASH: Salvamos o ID do recrutador e da call no próprio botão!
        const btnFechar = new ButtonBuilder()
          .setCustomId(`close_entrevista_${executor.id}_${callEntrevista.id}`)
          .setLabel("🔒 Encerrar e Apagar Salas")
          .setStyle(ButtonStyle.Danger);
          
        const row = new ActionRowBuilder().addComponents(btnFechar);

        await chatEntrevista.send({ content: `${candidato.user} ${executor.user}`, embeds: [embedSalas], components: [row] });
        await interaction.editReply({ content: `✅ Salas criadas com sucesso! Acesse: <#${chatEntrevista.id}>` });

        // O collector perigoso foi REMOVIDO daqui! Tudo acontece no handleButton agora.

      } catch (e) {
        console.error(e);
        interaction.editReply({ content: "❌ Erro ao criar as salas. Verifique se o bot tem permissão de 'Gerenciar Canais'." }).catch(()=>{});
      }
    }
  },

  // ==========================================
  // HANDLER DE COMPONENTES (Botões Seguros)
  // ==========================================
  async handleButton(interaction) {
    
    // Roteador do Botão de Fechar Entrevista
    if (interaction.customId.startsWith("close_entrevista_")) {
      // Extrai os IDs de dentro do botão: close_entrevista_[ID_RECRUTADOR]_[ID_CALL]
      const partes = interaction.customId.split("_");
      const recrutadorId = partes[2];
      const callId = partes[3];

      // Verifica se quem clicou é o recrutador original ou um Administrador
      if (interaction.user.id !== recrutadorId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Apenas o recrutador que abriu a sala ou um Admin pode encerrá-la.", ephemeral: true });
      }

      await interaction.reply({ content: "🧹 Entrevista encerrada. Apagando as salas em 5 segundos...", ephemeral: true });

      // Apaga o canal de texto atual e o canal de voz vinculado
      setTimeout(async () => {
        try {
          const callChannel = interaction.guild.channels.cache.get(callId);
          if (callChannel) await callChannel.delete();
          await interaction.channel.delete();
        } catch (err) {
          console.error("Erro ao deletar canais de entrevista: ", err);
        }
      }, 5000);
    }
  },

  async handleModal(interaction) {},
  async handleSelectMenu(interaction) {}
};
