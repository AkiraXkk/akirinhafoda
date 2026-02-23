const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } = require("discord.js");
const { createEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("myvip")
    .setDescription("Gerencie seus benefícios VIP (Cargo, Sala, Call)")
    .addSubcommandGroup((group) =>
      group
        .setName("role")
        .setDescription("Gerencia seu cargo personalizado")
        .addSubcommand((sub) =>
          sub
            .setName("create")
            .setDescription("Cria ou edita seu cargo personalizado")
            .addStringOption((opt) => opt.setName("nome").setDescription("Nome do cargo").setRequired(true))
            .addStringOption((opt) =>
              opt.setName("cor").setDescription("Cor Hex (ex: #FF0000)").setRequired(false),
            ),
        )
        .addSubcommand((sub) => sub.setName("delete").setDescription("Remove seu cargo personalizado"))
        .addSubcommand((sub) =>
            sub.setName("rename").setDescription("Renomeia seu cargo VIP").addStringOption(opt => opt.setName("nome").setDescription("Novo nome").setRequired(true))
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("room")
        .setDescription("Gerencia sua sala/call privada")
        .addSubcommand((sub) => sub.setName("create").setDescription("Cria sua sala de texto e voz"))
        .addSubcommand((sub) => sub.setName("delete").setDescription("Deleta sua sala de texto e voz"))
        .addSubcommand((sub) =>
          sub
            .setName("add_user")
            .setDescription("Adiciona um amigo à sua sala VIP")
            .addUserOption((opt) => opt.setName("amigo").setDescription("Amigo para adicionar").setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove_user")
            .setDescription("Remove um amigo da sua sala VIP")
            .addUserOption((opt) => opt.setName("amigo").setDescription("Amigo para remover").setRequired(true))
        )
        .addSubcommand((sub) =>
            sub
              .setName("rename")
              .setDescription("Renomeia suas salas")
              .addStringOption((opt) => opt.setName("nome").setDescription("Novo nome").setRequired(true))
              .addStringOption((opt) => 
                  opt.setName("tipo")
                     .setDescription("Qual sala renomear?")
                     .setRequired(false)
                     .addChoices(
                         { name: "Ambas", value: "both" },
                         { name: "Texto", value: "text" },
                         { name: "Voz", value: "voice" }
                     )
              )
        )
        .addSubcommand((sub) =>
            sub.setName("decorate").setDescription("Aplica um template de decoração nas salas")
        ),
    ),

  async execute(interaction) {
    const vipService = interaction.client.services.vip;
    const vipRoleManager = interaction.client.services.vipRole;
    const vipChannelManager = interaction.client.services.vipChannel;

    if (!vipService.isVip({ userId: interaction.user.id, member: interaction.member })) {
      await interaction.reply({
        content: "Este comando é exclusivo para VIPs.",
        ephemeral: true,
      });
      return;
    }

    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    if (group === "role") {
      if (sub === "create" || sub === "rename") {
        await interaction.deferReply({ ephemeral: true });
        const name = interaction.options.getString("nome");
        const color = interaction.options.getString("cor");

        const patch = { roleName: name };
        if (color) patch.roleColor = color;

        const result = await vipRoleManager.updatePersonalRole(interaction.user.id, patch, {
          guildId: interaction.guildId,
        });

        if (!result.ok) {
          await interaction.editReply(`Erro ao ${sub === "create" ? "criar" : "renomear"} cargo: ${result.reason}`);
          return;
        }

        const embed = createEmbed({
          title: "Cargo VIP",
          description: `Seu cargo **${result.role.name}** foi ${sub === "create" ? "configurado" : "renomeado"} com sucesso!`,
          color: result.role.color,
        });
        await interaction.editReply({ embeds: [embed] });
      }

      if (sub === "delete") {
        await interaction.deferReply({ ephemeral: true });
        const result = await vipRoleManager.deletePersonalRole(interaction.user.id, {
          guildId: interaction.guildId,
        });
        
        if (!result.ok) {
           await interaction.editReply(`Erro ao deletar cargo: ${result.reason}`);
           return;
        }
        
        await interaction.editReply("Seu cargo personalizado foi removido.");
      }
    }

    if (group === "room") {
      if (sub === "create") {
        await interaction.deferReply({ ephemeral: true });
        const result = await vipChannelManager.ensureVipChannels(interaction.user.id, {
          guildId: interaction.guildId,
        });

        if (!result.ok) {
          if (result.reason === "no_category_configured") {
             await interaction.editReply("O sistema de salas VIP não foi configurado pelo administrador (falta categoria).");
             return;
          }
          await interaction.editReply(`Erro ao criar salas: ${result.reason}`);
          return;
        }

        const embed = createEmbed({
          title: "Salas VIP",
          description: `Suas salas foram criadas:\n💬 ${result.textChannel}\n🔊 ${result.voiceChannel}`,
        });
        await interaction.editReply({ embeds: [embed] });
      }

      if (sub === "delete") {
        await interaction.deferReply({ ephemeral: true });
        await vipChannelManager.deleteVipChannels(interaction.user.id, {
           guildId: interaction.guildId,
        });
        await interaction.editReply("Suas salas privadas foram deletadas.");
      }

      if (sub === "add_user" || sub === "remove_user") {
          await interaction.deferReply({ ephemeral: true });
          const friend = interaction.options.getUser("amigo");
          const allow = sub === "add_user";
          
          const result = await vipChannelManager.updateChannelPermissions(interaction.user.id, {
              guildId: interaction.guildId,
              targetUserId: friend.id,
              allow
          });
          
          if (!result.ok) {
              await interaction.editReply(`Erro: ${result.reason === "no_channels" ? "Você não tem sala criada ainda." : result.reason}`);
              return;
          }
          
          await interaction.editReply(`Permissão de ${friend} ${allow ? "adicionada" : "removida"}.`);
      }

      if (sub === "rename") {
          await interaction.deferReply({ ephemeral: true });
          const name = interaction.options.getString("nome");
          const type = interaction.options.getString("tipo") || "both";

          const result = await vipChannelManager.updateChannelName(interaction.user.id, name, {
              guildId: interaction.guildId,
              type
          });

          if (!result.ok) {
              await interaction.editReply(`Erro ao renomear: ${result.reason === "no_channels" ? "Você não tem sala criada." : result.reason}`);
              return;
          }

          await interaction.editReply(`Salas renomeadas para **${name}** com sucesso!`);
      }

      if (sub === "decorate") {
          // Não deferReply aqui pois vamos abrir modal ou select
          // Mas como select menu precisa ser resposta...
          
          const templates = [
              { label: "✨ • {nome}", value: "✨・{nome}", description: "Estilo Brilho" },
              { label: "🔊 | {nome}", value: "🔊 | {nome}", description: "Estilo Voz" },
              { label: "╭👑╯ {nome}", value: "╭👑╯ {nome}", description: "Estilo Coroa" },
              { label: "『💎』{nome}", value: "『💎』{nome}", description: "Estilo Diamante" },
              { label: "🌸 {nome} 🌸", value: "🌸 {nome} 🌸", description: "Estilo Flor" },
              { label: "⚡ {nome} ⚡", value: "⚡ {nome} ⚡", description: "Estilo Raio" },
              { label: "🌙 {nome}", value: "🌙 {nome}", description: "Estilo Lua" },
              { label: "🔥 {nome}", value: "🔥 {nome}", description: "Estilo Fogo" }
          ];

          const options = templates.map(t => 
              new StringSelectMenuOptionBuilder()
                  .setLabel(t.label.replace("{nome}", "Nome"))
                  .setValue(t.value)
                  .setDescription(t.description)
          );

          const select = new StringSelectMenuBuilder()
              .setCustomId("decorate_menu")
              .setPlaceholder("Escolha um estilo")
              .addOptions(options);

          const row = new ActionRowBuilder().addComponents(select);

          const response = await interaction.reply({
              content: "Escolha um estilo para suas salas:",
              components: [row],
              ephemeral: true
          });

          const collector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

          collector.on('collect', async i => {
              const template = i.values[0];
              const baseName = interaction.user.username; // Usa nome do usuário como base se não tiver como pedir input no select
              // O ideal seria pegar o nome atual, mas não temos fácil aqui. Vamos usar o username.
              
              const newName = template.replace("{nome}", baseName);

              await i.deferUpdate();
              
              const result = await vipChannelManager.updateChannelName(interaction.user.id, newName, {
                  guildId: interaction.guildId,
                  type: "both"
              });

              if (result.ok) {
                  await i.editReply({ content: `Estilo aplicado! Suas salas agora são: **${newName}**`, components: [] });
              } else {
                  await i.editReply({ content: `Erro ao aplicar estilo: ${result.reason}`, components: [] });
              }
          });
      }
    }
  },
};

