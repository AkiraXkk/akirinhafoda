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
    .setDescription("Gerencia a identidade e o status do bot")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Define o status e atividade")
        .addStringOption((opt) => opt.setName("text").setDescription("Texto da atividade").setRequired(true))
        .addStringOption((opt) => opt.setName("status").setDescription("online|idle|dnd|invisible").setRequired(false))
        .addStringOption((opt) => opt.setName("type").setDescription("playing|streaming|listening|watching|competing").setRequired(false))
        .addStringOption((opt) => opt.setName("url").setDescription("URL (apenas streaming)").setRequired(false))
        .addStringOption((opt) => opt.setName("state").setDescription("Linha extra (State)").setRequired(false))
        .addStringOption((opt) => opt.setName("details").setDescription("Detalhes").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("profile")
        .setDescription("Altera Nome, Avatar ou Banner")
        .addStringOption((opt) => opt.setName("nome").setDescription("Novo nome de exibição").setRequired(false))
        .addAttachmentOption((opt) => opt.setName("avatar").setDescription("Nova imagem de perfil").setRequired(false))
        .addAttachmentOption((opt) => opt.setName("banner").setDescription("Novo banner (requer Nitro/Partner no bot)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("random")
        .setDescription("Gerencia rotação aleatória")
        .addStringOption((opt) => opt.setName("action").setDescription("add|toggle").setRequired(true))
        .addStringOption((opt) => opt.setName("text").setDescription("Texto da frase").setRequired(false))
    )
    .addSubcommand((sub) => sub.setName("clear").setDescription("Reseta o status para o padrão"))
    .addSubcommand((sub) => sub.setName("view").setDescription("Ver status atual")),

  async execute(interaction) {
    const ownerId = process.env.OWNER_ID;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ embeds: [createErrorEmbed("Apenas o dono do bot pode usar este comando.")], ephemeral: true });
    }

    const presenceService = interaction.client.services?.presence;
    const sub = interaction.options.getSubcommand();

    // --- SUBCOMANDO: PROFILE (Unificado) ---
    if (sub === "profile") {
      const name = interaction.options.getString("nome");
      const avatar = interaction.options.getAttachment("avatar");
      const banner = interaction.options.getAttachment("banner");

      if (name) await interaction.client.user.setUsername(name);
      if (avatar) await interaction.client.user.setAvatar(avatar.url);
      if (banner) {
        if (typeof interaction.client.user.setBanner !== "function") {
            return interaction.reply({ embeds: [createErrorEmbed("API não suporta alteração de banner.")], ephemeral: true });
        }
        await interaction.client.user.setBanner(banner.url);
      }

      return interaction.reply({ embeds: [createSuccessEmbed("Perfil atualizado com sucesso!")], ephemeral: true });
    }

    // --- SUBCOMANDO: CLEAR (Corrigido) ---
    if (sub === "clear") {
      await presenceService.clearPresence();
      
      // O PULO DO GATO: Além de limpar o banco, limpamos o cliente agora!
      await interaction.client.user.setPresence({
        activities: [],
        status: 'online'
      });

      return interaction.reply({ embeds: [createSuccessEmbed("Status resetado para o padrão (Limpo).")], ephemeral: true });
    }

    // --- SUBCOMANDO: SET ---
    if (sub === "set") {
      const text = interaction.options.getString("text");
      const status = interaction.options.getString("status") || "online";
      const type = parseActivityType(interaction.options.getString("type")) ?? ActivityType.Playing;

      const next = await presenceService.setPresence({
        status,
        activity: {
          name: text,
          type,
          url: interaction.options.getString("url") || null,
          state: interaction.options.getString("state") || null,
          details: interaction.options.getString("details") || null
        }
      });

      await presenceService.applyPresence(interaction.client);
      return interaction.reply({ embeds: [createSuccessEmbed(`Status definido: **${text}**`)], ephemeral: true });
    }

    // --- SUBCOMANDO: VIEW ---
    if (sub === "view") {
        const saved = await presenceService.getPresence();
        if (!saved) return interaction.reply({ content: "Nenhum status salvo.", ephemeral: true });
        
        return interaction.reply({
            embeds: [createEmbed({
                title: "Status Atual",
                fields: [
                    { name: "Texto", value: saved.activity?.name || "N/A", inline: true },
                    { name: "Status", value: saved.status || "online", inline: true }
                ],
                color: 0x3498db
            })],
            ephemeral: true
        });
    }

    // --- SUBCOMANDO: RANDOM ---
    if (sub === "random") {
        const action = interaction.options.getString("action");
        const text = interaction.options.getString("text");

        if (action === "add" && text) {
            await presenceService.addRandomText?.(text);
            return interaction.reply({ embeds: [createSuccessEmbed("Frase adicionada!")], ephemeral: true });
        }
        if (action === "toggle") {
            const state = await presenceService.toggleRotation?.();
            return interaction.reply({ embeds: [createSuccessEmbed(`Rotação: ${state ? "LIGADA" : "DESLIGADA"}`)], ephemeral: true });
        }
    }
  }
};