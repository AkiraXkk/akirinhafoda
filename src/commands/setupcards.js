const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  MessageFlags, } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createShopService } = require("../services/shopService");

// Configurações de cards predefinidos
const CARDS_CONFIG = {
  default: { 
    name: "Card Padrão", 
    description: "Card básico com design limpo",
    price: 0, 
    color: "#4a5568",
    emoji: "🆓",
    type: "card",
    durationDays: 0
  },
  premium: { 
    name: "Card Premium", 
    description: "Card com design dourado e exclusivo",
    price: 5000, 
    color: "#f1c40f",
    emoji: "⭐",
    type: "card",
    durationDays: 0
  },
  gold: { 
    name: "Card Gold", 
    description: "Card premium com efeitos dourados",
    price: 10000, 
    color: "#f39c12",
    emoji: "🏆",
    type: "card",
    durationDays: 0
  },
  neon: { 
    name: "Card Neon", 
    description: "Card com design neon vibrante",
    price: 15000, 
    color: "#e74c3c",
    emoji: "💎",
    type: "card",
    durationDays: 0
  },
  ocean: { 
    name: "Card Ocean", 
    description: "Card com tema oceânico exclusivo",
    price: 20000, 
    color: "#3498db",
    emoji: "🌊",
    type: "card",
    durationDays: 0
  },
  legendary: { 
    name: "Card Lendário", 
    description: "Card ultra raro com animações",
    price: 50000, 
    color: "#9b59b6",
    emoji: "👑",
    type: "card",
    durationDays: 0
  },
  cosmic: { 
    name: "Card Cósmico", 
    description: "Card com tema espacial e galáxias",
    price: 75000, 
    color: "#2c3e50",
    emoji: "🌌",
    type: "card",
    durationDays: 0
  },
  dragon: { 
    name: "Card Dragão", 
    description: "Card místico com dragões flamejantes",
    price: 100000, 
    color: "#e67e22",
    emoji: "🐉",
    type: "card",
    durationDays: 0
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setupcards")
    .setDescription("Adiciona cards predefinidos à loja do servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("adicionar")
        .setDescription("Adiciona todos os cards predefinidos à loja")
    )
    .addSubcommand((sub) =>
      sub
        .setName("remover")
        .setDescription("Remove todos os cards da loja")
    )
    .addSubcommand((sub) =>
      sub
        .setName("listar")
        .setDescription("Lista todos os cards predefinidos disponíveis")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const shopService = createShopService();

    if (sub === "adicionar") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let addedCount = 0;
      let errors = [];

      for (const [cardId, cardConfig] of Object.entries(CARDS_CONFIG)) {
        try {
          const result = await shopService.upsertItem(guildId, {
            id: cardId,
            name: cardConfig.name,
            description: cardConfig.description,
            type: cardConfig.type,
            priceCoins: cardConfig.price,
            durationDays: cardConfig.durationDays,
            enabled: true,
            emoji: cardConfig.emoji,
            color: cardConfig.color
          });

          if (result.ok) {
            addedCount++;
          } else {
            errors.push(`❌ ${cardConfig.name}: Falha ao adicionar`);
          }
        } catch (error) {
          errors.push(`❌ ${cardConfig.name}: ${error.message}`);
        }
      }

      const embed = createEmbed({
        title: addedCount > 0 ? "✅ Cards Adicionados com Sucesso!" : "⚠️ Falha ao Adicionar Cards",
        description: 
          `**Cards adicionados:** ${addedCount}/${Object.keys(CARDS_CONFIG).length}\n\n` +
          (errors.length > 0 ? `**Erros:**\n${errors.slice(0, 5).join("\n")}` : ""),
        color: addedCount > 0 ? 0x2ecc71 : 0xe74c3c,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "remover") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const items = await shopService.listItems(guildId);
        const cardItems = items.filter(item => item.type === "card");
        
        let removedCount = 0;
        for (const item of cardItems) {
          await shopService.removeItem(guildId, item.id);
          removedCount++;
        }

        const embed = createEmbed({
          title: "🗑️ Cards Removidos",
          description: `**${removedCount} cards** foram removidos da loja.`,
          color: 0xe74c3c,
          footer: { text: "WDA - Todos os direitos reservados" }
        });

        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        const embed = createErrorEmbed(`Erro ao remover cards: ${error.message}`);
        return interaction.editReply({ embeds: [embed] });
      }
    }

    if (sub === "listar") {
      const embed = createEmbed({
        title: "📋 Cards Predefinidos Disponíveis",
        description: Object.entries(CARDS_CONFIG)
          .map(([id, config]) => 
            `${config.emoji} **${config.name}** (${id})\n` +
            `💰 **${config.price.toLocaleString('pt-BR')} moedas**\n` +
            `📝 ${config.description}\n`
          )
          .join("\n"),
        color: 0x3498db,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};
