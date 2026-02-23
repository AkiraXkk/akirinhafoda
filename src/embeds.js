const { EmbedBuilder, Colors } = require("discord.js");
// Nota: Para usar configuração dinâmica, o ideal seria passar o guildId para createEmbed,
// mas como refatorar tudo seria complexo, vamos manter o padrão Gold por enquanto ou
// aceitar um parâmetro opcional de config.

const VIP_COLOR = 0xffd700; // Gold
const DEFAULT_FOOTER_TEXT = "© WDA todos os direitos reservados";

function createEmbed({
  title,
  description,
  color,
  fields,
  footer,
  thumbnail,
  image,
  author,
  timestamp = true,
  user // Novo parâmetro para o footer dinâmico
} = {}) {
  // Se cor não for passada, usa Gold (padrão)
  const embed = new EmbedBuilder().setColor(color || VIP_COLOR);

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (Array.isArray(fields) && fields.length) embed.addFields(fields);
  
  if (footer) {
      embed.setFooter(typeof footer === "string" ? { text: footer } : footer);
  } else if (user) {
      embed.setFooter({ text: `${user.tag} • ${DEFAULT_FOOTER_TEXT}`, iconURL: user.displayAvatarURL() });
  } else {
      embed.setFooter({ text: DEFAULT_FOOTER_TEXT });
  }
  
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (author) embed.setAuthor(author);
  if (timestamp) embed.setTimestamp();

  return embed;
}

function createSuccessEmbed(description, user) {
    return createEmbed({
        description: `✅ | ${description}`,
        color: Colors.Green,
        user
    });
}

function createErrorEmbed(description, user) {
    return createEmbed({
        description: `❌ | ${description}`,
        color: Colors.Red,
        user
    });
}

module.exports = { createEmbed, createSuccessEmbed, createErrorEmbed, VIP_COLOR };
