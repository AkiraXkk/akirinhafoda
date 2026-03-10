const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("divulgacao")
    .setDescription("Ferramentas da equipe de Divulgação")
    .addSubcommand(sub => 
      sub.setName("registrar")
      .setDescription("Registra uma parceria ou convite realizado")
      .addStringOption(opt => 
        opt.setName("tipo")
        .setDescription("Qual foi o método?")
        .setRequired(true)
        .addChoices(
          { name: "🤝 Parceria de Servidor", value: "Parceria" },
          { name: "📩 Convite Direto (DM)", value: "Convite Direto" },
          { name: "📱 Postagem em Rede Social", value: "Rede Social" }
        )
      )
      .addIntegerOption(opt => opt.setName("quantidade").setDescription("Quantos membros entraram? (Aproximado)").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "registrar") {
      const tipo = interaction.options.getString("tipo");
      const quantidade = interaction.options.getInteger("quantidade");
      const prova = interaction.options.getAttachment("prova");

      const embedRegistro = new EmbedBuilder()
        .setTitle("🗞️ Novo Registro de Divulgação")
        .setColor("#ff4d4d")
        .addFields(
          { name: "👤 Divulgador", value: `${interaction.user}`, inline: true },
          { name: "📌 Tipo", value: tipo, inline: true },
          { name: "📈 Membros Trazidos", value: `${quantidade} membro(s)`, inline: true }
        )
        .setTimestamp();

      // Envia para o canal de provas da divulgação
      const canalProvas = interaction.guild.channels.cache.find(c => c.name.includes("provas-divulgação") || c.name.includes("provas-divulgacao"));
      
      if (canalProvas) {
        await canalProvas.send({ embeds: [embedRegistro] });
        await interaction.reply({ content: "✅ O seu registro foi salvo com sucesso no canal de provas! Bom trabalho!", ephemeral: true });
      } else {
        // Se não achar o canal, manda onde o comando foi usado
        await interaction.reply({ content: "✅ Registro salvo!", embeds: [embedRegistro] });
      }
    }
  }
};
