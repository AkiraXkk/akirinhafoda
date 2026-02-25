const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

async function createPagination({
  interaction,
  items,
  itemsPerPage = 10,
  embedBuilder,
  title = "Lista",
}) {
  if (!items.length) {
    return interaction.reply({ content: "Nenhum item para mostrar.", ephemeral: true });
  }

  const totalPages = Math.ceil(items.length / itemsPerPage);
  let currentPage = 0;

  const generateEmbed = (page) => {
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const currentItems = items.slice(start, end);
    
    return embedBuilder(currentItems, page, totalPages);
  };

  const generateRow = (page) => {
    const row = new ActionRowBuilder();
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("prev")
        .setLabel("◀")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId("count")
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("next")
        .setLabel("▶")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages - 1)
    );
    
    return row;
  };

  const payload = {
    embeds: [generateEmbed(currentPage)],
    components: [generateRow(currentPage)],
    fetchReply: true,
  };

  let response;
  if (interaction.deferred || interaction.replied) {
    response = await interaction.editReply(payload);
  } else {
    response = await interaction.reply(payload);
  }

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000 * 5, // 5 min
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      return i.reply({ content: "Você não pode usar estes botões.", ephemeral: true });
    }

    if (i.customId === "prev") {
      currentPage--;
    } else if (i.customId === "next") {
      currentPage++;
    }

    await i.update({
      embeds: [generateEmbed(currentPage)],
      components: [generateRow(currentPage)],
    });
  });

  collector.on("end", () => {
    // Desativar botões
    // interaction.editReply({ components: [] }).catch(() => {});
  });
}

module.exports = { createPagination };
