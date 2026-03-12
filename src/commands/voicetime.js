const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  MessageFlags, } = require("discord.js");
const { createDataStore } = require("../store/dataStore");

// Conecta diretamente ao banco de dados de níveis que você já tem
const levelsStore = createDataStore("levels.json");

// Função para formatar milissegundos em horas e minutos para exibir bonito
function formatDuration(ms) {
  if (!ms || ms <= 0) return "0min";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voicetime")
    .setDescription("[STAFF] Adiciona, remove ou define o tempo de call de um membro")
    // Trava nativa do Discord: Apenas Administradores verão e poderão usar este comando
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt => opt.setName("usuario").setDescription("O membro que terá o tempo editado").setRequired(true))
    .addStringOption(opt => 
      opt.setName("acao")
         .setDescription("O que você deseja fazer?")
         .setRequired(true)
         .addChoices(
           { name: "➕ Adicionar tempo", value: "add" },
           { name: "➖ Remover tempo", value: "remove" },
           { name: "✏️ Definir tempo exato", value: "set" }
         )
    )
    .addIntegerOption(opt => opt.setName("horas").setDescription("Quantidade de horas").setRequired(false).setMinValue(0))
    .addIntegerOption(opt => opt.setName("minutos").setDescription("Quantidade de minutos").setRequired(false).setMinValue(0).setMaxValue(59)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("usuario");
    const action = interaction.options.getString("acao");
    const hours = interaction.options.getInteger("horas") || 0;
    const minutes = interaction.options.getInteger("minutos") || 0;

    // Proteção: o staff precisa colocar pelo menos 1 minuto ou 1 hora
    if (hours === 0 && minutes === 0) {
      return interaction.reply({ content: "❌ Você precisa informar a quantidade de horas ou minutos para editar!", flags: MessageFlags.Ephemeral });
    }

    // O bot converte as horas e minutos informados para milissegundos (que é como seu banco salva)
    const timeInMs = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);

    await interaction.deferReply();

    // Atualiza o banco de dados
    await levelsStore.update(targetUser.id, (current) => {
      // Se a pessoa nunca ganhou XP, cria os dados base dela
      const data = current || { xp: 0, level: 0, totalXp: 0, messages_count: 0, voice_time: 0 };
      
      if (action === "add") {
        data.voice_time = (data.voice_time || 0) + timeInMs;
      } else if (action === "remove") {
        data.voice_time = Math.max(0, (data.voice_time || 0) - timeInMs); // Math.max impede que o tempo fique negativo
      } else if (action === "set") {
        data.voice_time = timeInMs;
      }

      return data;
    });

    // Puxa o dado atualizado para mostrar na mensagem final
    const allData = await levelsStore.load();
    const updatedUser = allData[targetUser.id];

    // Monta um Embed bonito com o recibo da alteração
    const embed = new EmbedBuilder()
      .setTitle("⏱️ Tempo de Call Atualizado")
      .setColor(0x2ecc71)
      .setDescription(`O tempo de call de ${targetUser} foi atualizado com sucesso por ${interaction.user}.`)
      .addFields(
        { name: "📋 Ação realizada", value: action === "add" ? "Adicionado" : action === "remove" ? "Removido" : "Tempo Definido", inline: true },
        { name: "⏳ Valor aplicado", value: `${hours}h ${minutes}m`, inline: true },
        { name: "📊 Novo tempo total", value: `**${formatDuration(updatedUser.voice_time)}**`, inline: false }
      )
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};
