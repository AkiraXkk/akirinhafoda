const { Events } = require("discord.js");
const { logger } = require("../logger");
const { createDataStore } = require("../store/dataStore");
const { createEmbed } = require("../embeds");
const { checkMessage: automodCheckMessage } = require("../services/automodService");

const ticketStore = createDataStore("tickets.json");
const chatStore = createDataStore("sejawda_chats.json");
const partnersStore = createDataStore("partners.json");
const PARTNER_CONTENT_TEMPLATE = "**Servidor:** {server}\n**Tier:** {tier}\n**Representante:** {owner}\n**Responsável:** {staff}\n**Ping:** {ping}\n**Link:** {link}";
const PARTNER_EMBED_TEMPLATE = "--- {☩} NOVA PARCERIA FECHADA! {☩} ---\n\n{description}\n\n{☩}----------{🤝}----------{☩}";
const PARTNER_FALLBACK_PING = "Sem menção";

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // ==========================================
    // NOVO: COLETOR DE DM PARA RECUPERAÇÃO
    // ==========================================
    if (message.channel?.isDMBased?.() && !message.author.bot) {
      try {
        const partners = await partnersStore.load();
        const pendingEntry = Object.entries(partners).find(([, data]) => {
          const ownerId = resolvePartnerOwnerId(data);
          return ownerId === message.author.id && data?.status === "PENDING_RECOVERY";
        });

        if (!pendingEntry) return;

        const [id, data] = pendingEntry;
        const rawInvite = String(message.content || "").trim();
        const inviteData = await client.fetchInvite(rawInvite).catch(() => null);

        if (!inviteData) {
          await message.reply("❌ Este não é um link de convite válido do Discord. Tente novamente.");
          return;
        }

        const normalizedInvite = normalizeInviteInput(rawInvite);

        const channelId = data?.channelId;
        const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;

        if (!channel?.isTextBased?.()) {
          await message.reply("❌ Não consegui localizar o canal da parceria para repostar a mensagem. Contate a Staff.");
          return;
        }

        const oldMessage = data?.messageId ? await channel.messages.fetch(data.messageId).catch(() => null) : null;
        const oldContent = oldMessage?.content || null;
        const oldEmbeds = oldMessage?.embeds?.length ? oldMessage.embeds : null;

        if (oldMessage) await oldMessage.delete().catch(() => null);

        const { content, embeds } = buildRecoveredPartnerPost({
          data,
          inviteLink: normalizedInvite,
          oldContent,
          fallbackEmbeds: oldEmbeds
        });

        const sentMessage = await channel.send({ content, embeds });

        await partnersStore.update(id, (current) => {
          if (!current) return current;
          const next = { ...current };
          next.inviteLink = normalizedInvite;
          next.convite = normalizedInvite;
          next.messageId = sentMessage.id;
          next.channelId = channel.id;
          next.status = "ACTIVE";
          if (next.waitingSince) delete next.waitingSince;
          return next;
        });

        await message.reply("✅ Link atualizado com sucesso! Sua parceria foi renovada e postada novamente.");
        return;
      } catch (err) {
        logger.error({ err }, "Erro ao processar recuperação de parceria via DM");
        await message.reply("❌ Ocorreu um erro ao processar seu link. Tente novamente mais tarde.");
        return;
      }
    }

    if (message.author.bot || !message.guild) return;

    // ── AutoMod: verifica a mensagem contra todas as regras ativas ─────────
    automodCheckMessage(message).catch((err) =>
      logger.error({ err }, "AutoMod: Erro ao verificar mensagem")
    );

    // ── SLA: Atualiza lastMessageAt/lastMessageBy nos tickets ──
    try {
      const tickets = await ticketStore.load();
      const ticketInfo = tickets[message.channelId];
      if (ticketInfo && !ticketInfo.closedAt && ticketInfo.userId) {
        const isOwner = message.author.id === ticketInfo.userId;
        await ticketStore.update(message.channelId, (info) => info ? {
          ...info,
          lastMessageAt: Date.now(),
          lastMessageBy: isOwner ? "user" : "staff",
          ping30Sent: false,
          ping90Sent: false
        } : null);
      }
    } catch (err) {
      logger.error({ err }, "Erro ao atualizar SLA do ticket");
    }

    try {
      const chats = await chatStore.load();
      const chatInfo = chats[message.channelId];
      if (chatInfo && !chatInfo.closedAt && chatInfo.userId) {
        const isOwner = message.author.id === chatInfo.userId;
        await chatStore.update(message.channelId, (info) => info ? {
          ...info,
          lastMessageAt: Date.now(),
          lastMessageBy: isOwner ? "user" : "staff",
          ping30Sent: false,
          ping90Sent: false
        } : null);
      }
    } catch (err) {
      logger.error({ err }, "Erro ao atualizar SLA do sejawda");
    }

    // AFK: verifica menções a usuários AFK e auto-remove AFK de quem falar
    const afkCommand = client.commands.get("afk");
    if (afkCommand?.handleMessage) {
      afkCommand.handleMessage(message).catch((err) =>
        logger.error({ err }, "Erro ao processar AFK no messageCreate")
      );
    }

    const levelsCommand = client.commands.get("rank");
    if (!levelsCommand?.addXpForMessage) return;

    try {
      const membro = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (!membro) return;

      const { subiuNivel, novoNivel, nivelAnterior } = await levelsCommand.addXpForMessage(membro);
      
      // Quando a pessoa subir para QUALQUER nível, sem limites:
      if (subiuNivel && levelsCommand.applyLevelRoles) {
        await levelsCommand.applyLevelRoles(membro, nivelAnterior, novoNivel);

        // Enviar mensagem de level up no canal em que ela acabou de falar
        const levelUpMessage = await message.channel.send({
          embeds: [{
            title: "🎉 LEVEL UP!",
            description: `Parabéns ${message.author}! Você alcançou o nível **${novoNivel}**!`,
            color: 0x00ff00,
            thumbnail: { url: message.author.displayAvatarURL({ dynamic: true }) },
            footer: { text: "Esta mensagem será excluída em 20 segundos • WDA - Todos os direitos reservados" }
          }]
        }).catch((err) => {
          logger.warn({ err, channelId: message.channel.id }, "Falha ao enviar mensagem de level up");
          return null;
        });

        // Apagar mensagem após 20 segundos
        if (levelUpMessage) {
          setTimeout(() => {
            levelUpMessage.delete().catch(() => {});
          }, 20000);
        }
      }
    } catch (err) {
      logger.error({ err }, "Erro ao processar XP no messageCreate");
    }
  },
};

// ==========================================
// Helpers auxiliares (DM Recovery)
// ==========================================
function resolvePartnerOwnerId(data) {
  return data?.requesterId || data?.representante || data?.ownerId || data?.responsavel || null;
}

function buildRecoveredPartnerPost({ data, inviteLink, oldContent, fallbackEmbeds }) {
  const updatedContent = replaceInviteInContent(oldContent || "", inviteLink);
  const content = updatedContent || buildFallbackPartnerContent(data, inviteLink);
  const embeds = fallbackEmbeds && fallbackEmbeds.length
    ? fallbackEmbeds
    : [buildFallbackPartnerEmbed(data)];
  return { content, embeds };
}

function replaceInviteInContent(content, inviteLink) {
  if (!content) return "";
  const regex = /(\*\*Link:\*\*\s*)(\S+)/i;
  if (regex.test(content)) return content.replace(regex, `$1${inviteLink}`);
  return "";
}

function buildFallbackPartnerContent(data, inviteLink) {
  const serverName = data?.serverName || data?.servidor || "Servidor Desconhecido";
  const tier = data?.tier || "Bronze";
  const ownerId = resolvePartnerOwnerId(data);
  const processedBy = data?.processedBy || data?.responsavel || "Sistema";
  const ownerLine = ownerId ? `<@${ownerId}>` : "Desconhecido";
  const staffLine = processedBy === "Sistema" ? processedBy : `<@${processedBy}>`;
  return PARTNER_CONTENT_TEMPLATE
    .replace("{server}", serverName)
    .replace("{tier}", tier)
    .replace("{owner}", ownerLine)
    .replace("{staff}", staffLine)
    .replace("{ping}", PARTNER_FALLBACK_PING)
    .replace("{link}", inviteLink);
}

function buildFallbackPartnerEmbed(data) {
  const description = data?.description || data?.descricao || "Nenhuma descrição fornecida.";
  const embed = createEmbed({
    color: 0x2ecc71,
    description: PARTNER_EMBED_TEMPLATE.replace("{description}", description),
  });
  if (data?.banner?.startsWith?.("http")) embed.setImage(data.banner);
  return embed;
}

function normalizeInviteInput(rawInvite) {
  if (!rawInvite) return "";
  if (rawInvite.startsWith("http")) return rawInvite;
  if (rawInvite.includes("discord.gg/") || rawInvite.includes("discord.com/invite/")) {
    return `https://${rawInvite}`;
  }
  return `https://discord.gg/${rawInvite}`;
}
