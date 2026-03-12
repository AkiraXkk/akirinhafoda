const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require("discord.js");
const { createEmbed } = require("../embeds");

const categoryMapping = {
  "Administração": ["botadmin", "moderation", "leveladmin", "shopadmin", "tagroleadmin", "resetconfig", "logs", "presence", "vipadmin", "sejawda", "config", "metas"],
  "Diversão": ["fun", "dama", "enquete", "blackjack", "roleta", "velha", "bicho", "pastime"],
  "Economia": ["economy", "shop", "setupcards"],
  "VIP": ["vip", "vipbuy", "vipservice"],
  "Social": ["social", "family", "tellonym"],
  "Níveis": ["levels", "leaderboard", "voicetime"],
  "Parcerias": ["partnership", "boost", "verify"],
  "Staff": ["staffstats", "recrutamento", "divulgacao", "eventos", "movcall", "movchat", "acolhimento", "design"],
  "Utilidade": ["utility", "ping", "ticket", "ajuda", "welcome"]
};

function getCategoryName(commandName) {
  for (const [category, list] of Object.entries(categoryMapping)) {
    if (list.includes(commandName)) return category;
  }
  return "Outros";
}

function formatUsage(base, options = []) {
  if (!options?.length) return base;
  const parts = options
    .filter((opt) => opt.type !== 1)
    .map((opt) => (opt.required ? `<${opt.name}>` : `[${opt.name}]`));
  return parts.length ? `${base} ${parts.join(" ")}` : base;
}

function formatPermission(defaultPermissions) {
  if (!defaultPermissions) return "Todos os membros";
  try {
    const bits = new PermissionsBitField(BigInt(defaultPermissions));
    const names = bits.toArray().map((name) =>
      name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()
    );
    return names.length ? names.join("\n") : "Todos os membros";
  } catch {
    return "Todos os membros";
  }
}

function getDecorEmoji(interaction, emojiName, fallback) {
  const found = interaction.guild?.emojis?.cache?.find((e) => e.name === emojiName);
  if (!found) return fallback;
  return found.animated ? `<a:${found.name}:${found.id}>` : `<:${found.name}:${found.id}>`;
}

function buildHelpEntries(commands) {
  const entries = [];
  for (const command of commands) {
    const json = command.data.toJSON();
    const name = json.name;
    const category = getCategoryName(name);
    const permission = formatPermission(json.default_member_permissions);
    const subcommands = (json.options || []).filter((opt) => opt.type === 1);
    if (subcommands.length > 0) {
      for (const sub of subcommands) {
        const base = `/${name} ${sub.name}`;
        entries.push({
          key: base,
          usage: formatUsage(base, sub.options || []),
          description: sub.description || "Sem descrição",
          permission,
          category
        });
      }
    } else {
      const base = `/${name}`;
      entries.push({
        key: base,
        usage: formatUsage(base, json.options || []),
        description: json.description || "Sem descrição",
        permission,
        category
      });
    }
  }
  return entries;
}

function chunkCommands(commands, limit = 3500) {
  const lines = commands.map((command) => `• \`${command.key}\`\n> ${command.description}\n> Uso: \`${command.usage}\``);
  const pages = [];
  let current = "";
  for (const line of lines) {
    const block = current ? `\n\n${line}` : line;
    if ((current + block).length > limit) {
      pages.push(current);
      current = line;
    } else {
      current += block;
    }
  }
  if (current) pages.push(current);
  return pages.length ? pages : ["Nenhum comando encontrado nesta categoria."];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ajuda")
    .setDescription("Mostra o painel de ajuda interativo"),
  async execute(interaction) {
    const commands = [...interaction.client.commands.values()];
    const entries = buildHelpEntries(commands);
    const mascot = getDecorEmoji(interaction, "yfgg", "🟣");
    const pin = getDecorEmoji(interaction, "ufixado", "📌");
    const commandsByCategory = {};
    for (const entry of entries) {
      if (!commandsByCategory[entry.category]) {
        commandsByCategory[entry.category] = [];
      }
      commandsByCategory[entry.category].push(entry);
    }

    Object.keys(commandsByCategory).forEach((category) => {
      if (commandsByCategory[category].length === 0) delete commandsByCategory[category];
    });

    const orderedCategories = Object.keys(commandsByCategory).sort((a, b) => {
      if (a === "Outros") return 1;
      if (b === "Outros") return -1;
      return a.localeCompare(b, "pt-BR");
    });
    const categorySummary = orderedCategories
      .map((category) => [category, commandsByCategory[category]])
      .map(([category, list]) => `${getCategoryEmoji(category)} ${category}: **${list.length}**`)
      .join("\n");
    const totalCommands = Object.values(commandsByCategory).reduce((sum, list) => sum + list.length, 0);

    function createCategoryMenu() {
      const options = orderedCategories.map(cat => 
        new StringSelectMenuOptionBuilder()
          .setLabel(cat)
          .setValue(cat)
          .setDescription(`${commandsByCategory[cat].length} comandos`)
          .setEmoji(getCategoryEmoji(cat))
      );

      const select = new StringSelectMenuBuilder()
        .setCustomId("help_category_menu")
        .setPlaceholder("Selecione uma categoria")
        .addOptions(options);

      return new ActionRowBuilder().addComponents(select);
    }

    function createBackButton() {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("help_back")
          .setLabel("📓 Voltar ao Menu")
          .setStyle(ButtonStyle.Secondary)
      );
    }

    const mainEmbed = createEmbed({
      title: `${mascot} Menu de Ajuda `,
      description: "Escolha uma categoria para ver todos os comandos disponíveis no servidor.",
      thumbnail: interaction.client.user.displayAvatarURL(),
      fields: [
        { name: "<:y_oclin:856592277525626930> Total de Comandos", value: `${totalCommands}`, inline: true },
        { name: "📂 Categorias", value: `${Object.keys(commandsByCategory).length}`, inline: true },
        { name: "💡 Como usar", value: "Use os menus abaixo para navegar entre as categorias!", inline: true },
        { name: "🗂️ Quantidade por Categoria", value: categorySummary, inline: false },
        { name: `${pin} Dica`, value: "Abra uma categoria para ver descrição, uso e permissões dos comandos.", inline: false }
      ],
      color: 0x8e44ad,
      footer: { text: `Solicitado por ${interaction.user.username} • WDA - Atendimento & Gestão` }
    });

    await interaction.reply({ 
      embeds: [mainEmbed], 
      components: [createCategoryMenu()], 
      ephemeral: true 
    });
    const response = await interaction.fetchReply();
    let currentCategory = null;
    let currentPages = [];
    let currentPage = 0;

    const collector = response.createMessageComponentCollector({
      time: 180000
    });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: "Este menu não é para você!", ephemeral: true });
      }

      if (i.isStringSelectMenu() && i.customId === "help_category_menu") {
        currentCategory = i.values[0];
        const categoryCommands = [...commandsByCategory[currentCategory]].sort((a, b) =>
          a.key.localeCompare(b.key, "pt-BR")
        );
        currentPages = chunkCommands(categoryCommands);
        currentPage = 0;

        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("help_prev").setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId("help_back").setLabel("📓 Voltar ao Menu").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("help_next").setLabel("➡️").setStyle(ButtonStyle.Secondary).setDisabled(currentPages.length <= 1)
        );

        const categoryEmbed = createEmbed({
          title: `${mascot} ${getCategoryEmoji(currentCategory)} ${currentCategory}`,
          description: currentPages[currentPage],
          fields: [
            { name: "📊 Comandos", value: `${categoryCommands.length}`, inline: true },
            { name: `${pin} Navegação`, value: `Página ${currentPage + 1}/${currentPages.length}`, inline: true }
          ],
          color: getCategoryColor(currentCategory),
          footer: { text: `Categoria: ${currentCategory} • WDA - Atendimento & Gestão` }
        });

        return i.update({
          embeds: [categoryEmbed],
          components: [navRow]
        });
      }

      if (i.isButton() && i.customId === "help_back") {
        currentCategory = null;
        currentPages = [];
        currentPage = 0;
        return i.update({
          embeds: [mainEmbed],
          components: [createCategoryMenu()]
        });
      }

      if (i.isButton() && (i.customId === "help_prev" || i.customId === "help_next")) {
        if (!currentCategory || currentPages.length === 0) {
          return i.reply({ content: "Selecione uma categoria primeiro.", ephemeral: true });
        }
        if (i.customId === "help_prev") currentPage = Math.max(0, currentPage - 1);
        if (i.customId === "help_next") currentPage = Math.min(currentPages.length - 1, currentPage + 1);

        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("help_prev").setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
          new ButtonBuilder().setCustomId("help_back").setLabel("📓 Voltar ao Menu").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("help_next").setLabel("➡️").setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= currentPages.length - 1)
        );

        const categoryEmbed = createEmbed({
          title: `${mascot} ${getCategoryEmoji(currentCategory)} ${currentCategory}`,
          description: currentPages[currentPage],
          fields: [
            { name: "📊 Comandos", value: `${commandsByCategory[currentCategory].length}`, inline: true },
            { name: `${pin} Navegação`, value: `Página ${currentPage + 1}/${currentPages.length}`, inline: true }
          ],
          color: getCategoryColor(currentCategory),
          footer: { text: `Categoria: ${currentCategory} • WDA - Atendimento & Gestão` }
        });

        return i.update({ embeds: [categoryEmbed], components: [navRow] });
      }
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {}
    });
  },
};

function getCategoryEmoji(category) {
  const emojis = {
    "Administração": "🛡️",
    "VIP": "💎",
    "Economia": "💰",
    "Níveis": "⭐",
    "Diversão": "🎉",
    "Social": "👥",
    "Parcerias": "🤝",
    "Staff": "👮",
    "Utilidade": "🛠️",
    "Outros": "📂"
  };
  return emojis[category] || "❓";
}

function getCategoryColor(category) {
  const colors = {
    "Administração": 0xff3333,
    "VIP": 0x9966ff,
    "Economia": 0x33cc33,
    "Níveis": 0xff9900,
    "Diversão": 0xff66cc,
    "Social": 0x00ccff,
    "Parcerias": 0x00ff88,
    "Staff": 0x5865F2,
    "Utilidade": 0x666666,
    "Outros": 0x999999
  };
  return colors[category] || 0x0099ff;
}
