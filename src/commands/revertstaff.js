const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require("discord.js");
const { createDataStore } = require("../store/dataStore");

const setupStore = createDataStore("setup_staff.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("revertstaff")
    .setDescription("Apaga EXATAMENTE o que o comando /setupstaff criou (Canais e Cargos).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const data = await setupStore.load();
    const guildData = data[interaction.guildId];

    if (!guildData || (!guildData.roles.length && !guildData.channels.length)) {
      return interaction.reply({ content: "❌ O bot não encontrou nenhum registro de setup recente neste servidor. Nada para reverter.", ephemeral: true });
    }

    const embedAviso = new EmbedBuilder()
      .setTitle("⚠️ Confirmação de Reversão Segura")
      .setColor(0xff0000)
      .setDescription(`O bot encontrou registros de uma criação anterior:\n\n🗑️ **${guildData.channels.length} Canais/Categorias**\n🗑️ **${guildData.roles.length} Cargos**\n\n**GARANTIA:** O bot irá apagar APENAS as IDs exatas que ele salvou quando você rodou o \`/setupstaff\`. Nenhum canal antigo será afetado. \n\nDeseja destruir a estrutura gerada?`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("confirm_revert").setLabel("✅ Sim, apagar tudo").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("cancel_revert").setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.reply({ embeds: [embedAviso], components: [row], ephemeral: true });

    try {
      const btnInteraction = await msg.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 30000 });

      if (btnInteraction.customId === "cancel_revert") {
        return btnInteraction.update({ content: "❌ Reversão cancelada. O servidor continuará intacto.", embeds: [], components: [] });
      }

      await btnInteraction.update({ content: "🧹 **Revertendo o Setup...** Isso pode levar cerca de 1 a 2 minutos.", embeds: [], components: [] });
      
      const guild = interaction.guild;
      let channelsDeleted = 0;
      let rolesDeleted = 0;

      // 1. Apaga os Canais primeiro (para as categorias ficarem vazias e poderem ser apagadas)
      for (const chId of guildData.channels) {
        const channel = guild.channels.cache.get(chId);
        if (channel) {
          await channel.delete().catch(() => null);
          channelsDeleted++;
        }
      }

      // 2. Apaga os Cargos
      for (const roleId of guildData.roles) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          await role.delete().catch(() => null);
          rolesDeleted++;
        }
      }

      // 3. Limpa o banco de dados para evitar apagar "fantasmas" no futuro
      await setupStore.update(interaction.guildId, () => ({ roles: [], channels: [] }));

      return interaction.editReply({ content: `✅ **Reversão concluída com 100% de segurança!**\n\n🗑️ Foram apagados **${channelsDeleted} canais** e **${rolesDeleted} cargos** gerados pelo último setup.` });

    } catch (e) {
      return interaction.editReply({ content: "⏳ Tempo esgotado. A reversão foi cancelada.", embeds: [], components: [] }).catch(()=>{});
    }
  }
};
