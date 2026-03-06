const { SlashCommandBuilder, ActivityType } = require("discord.js");
const { createEmbed, createErrorEmbed, createSuccessEmbed } = require("../embeds");

function parseActivityType(typeStr) {
  if (!typeStr) return null;
  const v = String(typeStr).trim().toLowerCase();
  const map = {
    playing: ActivityType.Playing,
    streaming: ActivityType.Streaming,
    listening: ActivityType.Listening,
    watching: ActivityType.Watching,
    competing: ActivityType.Competing,
  };
  return map[v] ?? null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("presence")
    .setDescription("Gerencia o Rich Presence e Perfil do bot")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Define o status e atividade do bot")
        .addStringOption((opt) => opt.setName("text").setDescription("Texto da atividade").setRequired(true))
        .addStringOption((opt) => opt.setName("status").setDescription("online|idle|dnd|invisible").setRequired(false))
        .addStringOption((opt) => opt.setName("type").setDescription("playing|streaming|listening|watching|competing").setRequired(false))
        .addStringOption((opt) => opt.setName("url").setDescription("URL (apenas streaming)").setRequired(false))
        // ADICIONADO: Novos campos de Rich Presence
        .addStringOption((opt) => opt.setName("state").setDescription("Estado da presença (linha extra)").setRequired(false))
        .addStringOption((opt) => opt.setName("details").setDescription("Detalhes da presença").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("profile")
        .setDescription("Altera o perfil público do bot")
        .addStringOption((opt) => opt.setName("display_name").setDescription("Novo Nome de Exibição").setRequired(false))
        .addStringOption((opt) => opt.setName("avatar_url").setDescription("URL da nova imagem de perfil").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("random")
        .setDescription("Gerencia a rotação aleatória de status")
        .addStringOption((opt) => opt.setName("action").setDescription("add|list|toggle").setRequired(true))
        .addStringOption((opt) => opt.setName("text").setDescription("Texto para adicionar à lista").setRequired(false))
    )
    .addSubcommand((sub) => sub.setName("clear").setDescription("Remove o presence salvo (volta ao padrão)"))
    .addSubcommand((sub) => sub.setName("view").setDescription("Mostra o presence salvo")),

  async execute(interaction) {
    const ownerId = process.env.OWNER_ID;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ embeds: [createErrorEmbed("Apenas o dono do bot pode usar isso.")], ephemeral: true });
    }

    const presenceService = interaction.client.services?.presence;
    if (!presenceService) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviço de presence indisponível.")], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    // LÓGICA ORIGINAL VIEW (Mantida)
    if (sub === "view") {
      const saved = await presenceService.getPresence();
      if (!saved) {
        return interaction.reply({ embeds: [createEmbed({ title: "Presence", description: "Nenhum presence salvo.", color: 0x95a5a6 })], ephemeral: true });
      }

      return interaction.reply({
        embeds: [
          createEmbed({
            title: "Presence salvo",
            fields: [
              { name: "Status", value: String(saved.status || "(padrão)"), inline: true },
              { name: "Type", value: String(saved.activity?.type ?? "(padrão)"), inline: true },
              { name: "Texto", value: String(saved.activity?.name || "(vazio)"), inline: false },
              { name: "State/Details", value: `${saved.activity?.state || "N/A"} / ${saved.activity?.details || "N/A"}`, inline: false },
            ],
            color: 0x3498db,
          }),
        ],
        ephemeral: true,
      });
    }

    // LÓGICA NOVA: PROFILE (Para "Bio" e Imagem)
    if (sub === "profile") {
      const newName = interaction.options.getString("display_name");
      const newAvatar = interaction.options.getString("avatar_url");

      if (newName) await interaction.client.user.setDisplayName(newName);
      if (newAvatar) await interaction.client.user.setAvatar(newAvatar);

      return interaction.reply({ embeds: [createSuccessEmbed("Perfil do bot atualizado com sucesso!")], ephemeral: true });
    }

    // LÓGICA NOVA: RANDOM (Para frases aleatórias)
    if (sub === "random") {
      const action = interaction.options.getString("action");
      const text = interaction.options.getString("text");

      if (action === "add" && text) {
        // Assume que seu serviço tem um método para gerenciar listas
        await presenceService.addRandomText?.(text);
        return interaction.reply({ embeds: [createSuccessEmbed(`Frase adicionada à lista aleatória: **${text}**`)], ephemeral: true });
      }
      
      if (action === "toggle") {
        const status = await presenceService.toggleRotation?.();
        return interaction.reply({ embeds: [createSuccessEmbed(`Rotação aleatória: **${status ? "Ligada" : "Desligada"}**`)], ephemeral: true });
      }

      return interaction.reply({ embeds: [createErrorEmbed("Ação inválida ou texto ausente.")], ephemeral: true });
    }

    // LÓGICA ORIGINAL CLEAR (Mantida)
    if (sub === "clear") {
      await presenceService.clearPresence();
      return interaction.reply({ embeds: [createSuccessEmbed("Presence salvo removido.")], ephemeral: true });
    }

    // LÓGICA ORIGINAL SET (Expandida para State/Details)
    if (sub === "set") {
      const status = interaction.options.getString("status");
      const typeStr = interaction.options.getString("type");
      const text = interaction.options.getString("text");
      const url = interaction.options.getString("url");
      const state = interaction.options.getString("state");
      const details = interaction.options.getString("details");

      const type = parseActivityType(typeStr) ?? ActivityType.Playing;

      const next = await presenceService.setPresence({
        status: status || "online",
        activity: {
          type,
          name: text,
          url: url || null,
          state: state || null,   // Novo campo
          details: details || null // Novo campo
        },
      });

      await presenceService.applyPresence(interaction.client).catch(() => {});

      return interaction.reply({
        embeds: [createSuccessEmbed(`Presence atualizado. Atividade: **${next.activity?.name || ""}**`)],
        ephemeral: true,
      });
    }
  },
};