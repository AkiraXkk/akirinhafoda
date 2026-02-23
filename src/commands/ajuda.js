const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } = require("discord.js");
const { createEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder().setName("ajuda").setDescription("Mostra o painel de ajuda interativo"),
  async execute(interaction) {
    const commands = [...interaction.client.commands.values()];
    
    // Categorias baseadas no nome do arquivo ou prefixo do comando
    const categories = {
        "VIP": ["vip", "myvip", "vipsetup", "vipbonus"],
        "Economia": ["economy"],
        "Diversão": ["fun"],
        "Moderação": ["mod"],
        "Utilidade": ["utility", "ajuda", "ping"],
        "Níveis": ["level"]
    };
    
    // Mapeia comandos para categorias
    const commandsByCategory = {};
    for (const [name, cmds] of Object.entries(categories)) {
        commandsByCategory[name] = commands.filter(c => cmds.includes(c.data.name));
    }
    
    // Comandos sem categoria
    const otherCommands = commands.filter(c => !Object.values(categories).flat().includes(c.data.name));
    if (otherCommands.length > 0) {
        commandsByCategory["Outros"] = otherCommands;
    }

    const options = Object.keys(commandsByCategory).map(cat => 
        new StringSelectMenuOptionBuilder()
            .setLabel(cat)
            .setValue(cat)
            .setDescription(`Comandos de ${cat}`)
            .setEmoji(getCategoryEmoji(cat))
    );

    const select = new StringSelectMenuBuilder()
        .setCustomId("help_menu")
        .setPlaceholder("Selecione uma categoria")
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(select);

    const embed = createEmbed({
      title: "🤖 Painel de Ajuda",
      description: "Selecione uma categoria no menu abaixo para ver os comandos disponíveis.",
      thumbnail: interaction.client.user.displayAvatarURL(),
      fields: [
          { name: "Total de Comandos", value: `${commands.length}`, inline: true },
          { name: "Categorias", value: `${Object.keys(commandsByCategory).length}`, inline: true }
      ],
      user: interaction.user // Adiciona o usuário para o footer dinâmico
    });

    const response = await interaction.reply({ 
        embeds: [embed], 
        components: [row], 
        ephemeral: true 
    });

    const collector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: "Esse menu não é para você!", ephemeral: true });
        }
        
        const selected = i.values[0];
        const cmds = commandsByCategory[selected];
        
        const newEmbed = createEmbed({
            title: `${getCategoryEmoji(selected)} ${selected}`,
            description: cmds.map(c => {
                // Tenta pegar subcomandos de várias formas
                let subcmds = [];
                if (c.data.options) {
                    subcmds = c.data.options.filter(o => o.constructor.name === "SlashCommandSubcommandBuilder" || o.toJSON().type === 1);
                }

                if (subcmds.length > 0) {
                    return `**/${c.data.name}**\n${subcmds.map(s => `> \`${s.name}\`: ${s.description}`).join("\n")}`;
                }
                return `**/${c.data.name}**: ${c.data.description}`;
            }).join("\n\n") || "Nenhum comando encontrado.",
            footer: "Use o menu para trocar de categoria"
        });

        await i.update({ embeds: [newEmbed], components: [row] });
    });

    collector.on('end', () => {
        // Desativa o menu após o tempo
        // Como é ephemeral, não precisa editar para desativar, mas se não fosse:
        // row.components[0].setDisabled(true);
        // interaction.editReply({ components: [row] }).catch(() => {});
    });
  },
};

function getCategoryEmoji(category) {
    const emojis = {
        "VIP": "💎",
        "Economia": "💰",
        "Diversão": "🎉",
        "Moderação": "🛡️",
        "Utilidade": "🛠️",
        "Níveis": "⭐",
        "Outros": "📂"
    };
    return emojis[category] || "❓";
}
