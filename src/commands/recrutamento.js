const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChannelType,
  PermissionFlagsBits
} = require("discord.js");

// Tabela de Hierarquia (Peso dos Cargos)
const HIERARQUIA = {
  "Chefe": 60, "Sub-Chefe": 50, "Gerente": 40, "Coordenador": 30, "Supervisores": 20, "Equipe Recrutamento": 10,
  "Equipe Divulgação": 5, "Equipe Eventos": 5, "Equipe MovCall": 5, "Equipe MovChat": 5, 
  "Equipe Acolhimento": 5, "Equipe Design": 5, "Equipe Pastime": 5, "Staff Geral": 5
};

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
      if (!alvo) return interaction.reply({ content: "❌ Membro não encontrado.", ephemeral: true });

      let pesoExecutor = 0;
      executor.roles.cache.forEach(role => {
        if (HIERARQUIA[role.name] && HIERARQUIA[role.name] > pesoExecutor) pesoExecutor = HIERARQUIA[role.name];
      });

      if (pesoExecutor === 0 && !executor.permissions.has("Administrator")) {
        return interaction.reply({ content: "❌ Você não tem permissão para usar este painel.", ephemeral: true });
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
        for (const [roleName, peso] of Object.entries(HIERARQUIA)) {
          if (peso < pesoExecutor || executor.permissions.has("Administrator")) {
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

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return { embeds: [embed], components: optionsAdded > 0 ? [row] : [] };
      };

      const msg = await interaction.reply({ ...buildPanel(), ephemeral: false, fetchReply: true });
      const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

      collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ Este painel não é seu.", ephemeral: true });

        const roleId = i.values[0];
        const role = interaction.guild.roles.cache.get(roleId);

        if (alvo.roles.cache.has(roleId)) {
          await alvo.roles.remove(roleId).catch(()=>{});
          await i.reply({ content: `✅ Cargo **${role.name}** removido de ${alvo.user}.`, ephemeral: true });
        } else {
          await alvo.roles.add(roleId).catch(()=>{});
          
          // MÁGICA: Adiciona Aspirante e Staff Geral automaticamente!
          const aspiranteId = "1097700110126809140"; 
          const roleStaffGeral = interaction.guild.roles.cache.find(r => r.name === "Staff Geral");
          
          if (!alvo.roles.cache.has(aspiranteId)) alvo.roles.add(aspiranteId).catch(()=>{});
          if (roleStaffGeral && !alvo.roles.cache.has(roleStaffGeral.id)) alvo.roles.add(roleStaffGeral.id).catch(()=>{});

          await i.reply({ content: `✅ Cargo **${role.name}** adicionado a ${alvo.user} (Aspirante e Staff Geral aplicados!).`, ephemeral: true });
        }
        await interaction.editReply(buildPanel());
      });

      collector.on("end", () => { interaction.editReply({ components: [] }).catch(()=>{}); });
    }

    // ==========================================
    // SISTEMA DE ENTREVISTA PRIVADA
    // ==========================================
    if (sub === "entrevista") {
      const candidato = interaction.options.getMember("candidato");
      if (!candidato) return interaction.reply({ content: "❌ Candidato não encontrado.", ephemeral: true });

      await interaction.reply({ content: "⏳ Montando as salas de entrevista...", ephemeral: true });

      try {
        // Criação da categoria/canais trancados
        const guild = interaction.guild;
        const perms = [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }, // Esconde de todos
          { id: executor.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] }, // Libera pro Recrutador
          { id: candidato.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] } // Libera pro Candidato
        ];

        const chatEntrevista = await guild.channels.create({ name: `💬・entrevista-${candidato.user.username}`, type: ChannelType.GuildText, permissionOverwrites: perms });
        const callEntrevista = await guild.channels.create({ name: `🔊・Call ${candidato.user.username}`, type: ChannelType.GuildVoice, permissionOverwrites: perms });

        // Embed com Botão de Encerrar
        const embedSalas = new EmbedBuilder()
          .setTitle("🤝 Sala de Entrevista WDA")
          .setColor("#ff9ff3")
          .setDescription(`Olá ${candidato.user}, esta é a sua sala privada de entrevista!\n\nO recrutador ${executor.user} irá conduzir o processo com você no canal de voz abaixo: <#${callEntrevista.id}>\n\n*(Recrutador: Utilize o botão abaixo para apagar estas salas quando terminar)*`);

        const btnFechar = new ButtonBuilder().setCustomId("fechar_salas_entrevista").setLabel("🔒 Encerrar e Apagar Salas").setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(btnFechar);

        const msgSalas = await chatEntrevista.send({ content: `${candidato.user} ${executor.user}`, embeds: [embedSalas], components: [row] });

        await interaction.editReply({ content: `✅ Salas criadas com sucesso! Acesse: <#${chatEntrevista.id}>` });

        // Coletor para apagar os canais
        const collector = msgSalas.createMessageComponentCollector({ componentType: ComponentType.Button, time: 86400000 }); // Dura 24h
        collector.on("collect", async (i) => {
          if (i.customId === "fechar_salas_entrevista") {
            if (!i.member.permissions.has("ManageChannels") && i.user.id !== executor.id) {
              return i.reply({ content: "❌ Apenas o recrutador pode encerrar a entrevista.", ephemeral: true });
            }
            await i.reply({ content: "🧹 Apagando salas em 5 segundos..." });
            setTimeout(() => {
              chatEntrevista.delete().catch(()=>{});
              callEntrevista.delete().catch(()=>{});
            }, 5000);
          }
        });

      } catch (e) {
        console.error(e);
        interaction.editReply({ content: "❌ Erro ao criar as salas. Verifique as permissões do bot." }).catch(()=>{});
      }
    }
  }
};