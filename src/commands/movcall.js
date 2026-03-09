const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("movcall")
    .setDescription("Moderação rápida para a equipe de Voice")
    .addSubcommand(sub => 
      sub.setName("acao")
      .setDescription("Aplica uma punição em um membro de uma call de voz")
      .addUserOption(opt => opt.setName("membro").setDescription("Membro infrator").setRequired(true))
      .addStringOption(opt => 
        opt.setName("tipo")
        .setDescription("Mutar ou Desconectar da call?")
        .setRequired(true)
        .addChoices(
          { name: "🔇 Mutar Microfone", value: "mutar" },
          { name: "🔌 Desconectar da Call", value: "kickar" }
        )
      )
      .addStringOption(opt => opt.setName("motivo").setDescription("Motivo da ação").setRequired(true))
    ),

  async execute(interaction) {
    const alvo = interaction.options.getMember("membro");
    const tipo = interaction.options.getString("tipo");
    const motivo = interaction.options.getString("motivo");

    if (!alvo) return interaction.reply({ content: "❌ Membro não encontrado.", ephemeral: true });
    if (!alvo.voice.channel) return interaction.reply({ content: "❌ O membro selecionado não está em um canal de voz no momento.", ephemeral: true });

    try {
      if (tipo === "mutar") {
        await alvo.voice.setMute(true, motivo);
        await interaction.reply({ content: `✅ **${alvo.user.tag}** foi mutado(a) no canal de voz com sucesso.\n📝 **Motivo:** ${motivo}`, ephemeral: true });
      } else if (tipo === "kickar") {
        await alvo.voice.disconnect(motivo);
        await interaction.reply({ content: `✅ **${alvo.user.tag}** foi desconectado(a) da call com sucesso.\n📝 **Motivo:** ${motivo}`, ephemeral: true });
      }
      
      // LOG DA AÇÃO PARA A CÚPULA LER DEPOIS
      const canalLogs = interaction.guild.channels.cache.find(c => c.name.includes("provas-movcall"));
      if (canalLogs) {
        canalLogs.send(`🛡️ **Log MovCall:** ${interaction.user} aplicou um **${tipo}** em ${alvo.user}.\n> **Motivo:** ${motivo}`);
      }
      
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: "❌ Erro ao tentar punir. Verifique se o bot tem permissão suficiente ou se o cargo do membro é superior ao do bot.", ephemeral: true });
    }
  }
};