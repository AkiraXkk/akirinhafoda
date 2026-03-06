const { SlashCommandBuilder, ActivityType, PermissionFlagsBits } = require("discord.js");
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
        .setDescription("Define o status e atividade fixa")
        .addStringOption((o) => o.setName("text").setDescription("Texto da atividade").setRequired(true))
        .addStringOption((o) => o.setName("status").setDescription("online|idle|dnd|invisible"))
        .addStringOption((o) => o.setName("type").setDescription("playing|streaming|listening|watching|competing"))
        .addStringOption((o) => o.setName("url").setDescription("URL (apenas streaming)"))
        .addStringOption((o) => o.setName("state").setDescription("Linha extra (State)"))
        .addStringOption((o) => o.setName("details").setDescription("Detalhes (Details)"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("profile")
        .setDescription("Altera Nome, Avatar ou Banner")
        .addStringOption((o) => o.setName("nome").setDescription("Novo nome de exibição"))
        .addAttachmentOption((o) => o.setName("avatar").setDescription("Nova imagem de perfil"))
        .addAttachmentOption((o) => o.setName("banner").setDescription("Novo banner (Requer suporte API)"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("random")
        .setDescription("Gerencia a rotação aleatória de frases")
        .addStringOption((o) => o.setName("action").setDescription("add | list | remove | toggle").setRequired(true))
        .addStringOption((o) => o.setName("text").setDescription("Frase para adicionar"))
        .addIntegerOption((o) => o.setName("index").setDescription("Número da frase para remover"))
    )
    .addSubcommand((sub) => sub.setName("clear").setDescription("Reseta o status para o padrão"))
    .addSubcommand((sub) => sub.setName("view").setDescription("Ver configuração atual")),

  async execute(interaction) {
    const ownerId = process.env.OWNER_ID;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ embeds: [createErrorEmbed("Apenas o dono do bot pode usar este comando.")], ephemeral: true });
    }

    const presenceService = interaction.client.services?.presence;
    const sub = interaction.options.getSubcommand();

    if (sub === "profile") {
      const name = interaction.options.getString("nome");
      const avatar = interaction.options.getAttachment("avatar");
      const banner = interaction.options.getAttachment("banner");

      if (name) await interaction.client.user.setUsername(name);
      if (avatar) await interaction.client.user.setAvatar(avatar.url);
      if (banner && typeof interaction.client.user.setBanner === "function") {
        await interaction.client.user.setBanner(banner.url);
      }
      return interaction.reply({ embeds: [createSuccessEmbed("Perfil global atualizado!")], ephemeral: true });
    }

    if (sub === "clear") {
      await presenceService.clearPresence();
      await interaction.client.user.setPresence({ activities: [], status: 'online' });
      return interaction.reply({ embeds: [createSuccessEmbed("Status limpo no banco e no Discord.")], ephemeral: true });
    }

    if (sub === "set") {
      const text = interaction.options.getString("text");
      const type = parseActivityType(interaction.options.getString("type")) ?? ActivityType.Playing;
      
      const data = {
        status: interaction.options.getString("status") || "online",
        activity: {
          name: text,
          type: type,
          url: interaction.options.getString("url") || null,
          state: interaction.options.getString("state") || null,
          details: interaction.options.getString("details") || null
        }
      };

      await presenceService.setPresence(data);
      await presenceService.applyPresence(interaction.client);
      return interaction.reply({ embeds: [createSuccessEmbed(`Status definido: **${text}**`)], ephemeral: true });
    }

    if (sub === "random") {
      const action = interaction.options.getString("action");
      const text = interaction.options.getString("text");
      const index = interaction.options.getInteger("index");

      if (action === "add" && text) {
        await presenceService.addRandomText(text);
        return interaction.reply({ embeds: [createSuccessEmbed("Frase adicionada!")], ephemeral: true });
      }

      if (action === "list") {
        const phrases = await presenceService.getPhrases();
        const lista = phrases.length ? phrases.map((p, i) => `\`${i + 1}.\` ${p}`).join("\n") : "Lista vazia.";
        return interaction.reply({ embeds: [createEmbed({ title: "📝 Frases Salvas", description: lista })], ephemeral: true });
      }

      if (action === "remove" && index) {
        const ok = await presenceService.removeRandomText(index - 1);
        return interaction.reply({ embeds: [ok ? createSuccessEmbed("Removido.") : createErrorEmbed("Índice inválido.")], ephemeral: true });
      }

      if (action === "toggle") {
        const state = await presenceService.toggleRotation();
        if (state) presenceService.startRotation(interaction.client);
        else presenceService.stopRotation();
        return interaction.reply({ embeds: [createSuccessEmbed(`Rotação: **${state ? "LIGADA" : "DESLIGADA"}**`)], ephemeral: true });
      }
    }

    if (sub === "view") {
      const saved = await presenceService.getPresence();
      return interaction.reply({
        embeds: [createEmbed({
          title: "Configuração de Presença",
          fields: [
            { name: "Status", value: `\`${saved.status}\``, inline: true },
            { name: "Rotação", value: `\`${saved.random?.enabled ? "Sim" : "Não"}\``, inline: true },
            { name: "Atividade", value: `\`${saved.activity?.name || "Nenhuma"}\``, inline: false }
          ]
        })],
        ephemeral: true
      });
    }
  }
};