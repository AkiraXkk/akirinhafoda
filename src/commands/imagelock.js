const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { logger } = require("../logger");

// ──────────────────────────────────────────────────────────────────────────────
// Estado em memória dos canais com image-lock ativo.
//
// TODO (persistência): Para carregar os canais após reinicialização, substitua
// este Set por um dataStore. Exemplo de integração:
//
//   const { createDataStore } = require("../store/dataStore");
//   const imageLockStore = createDataStore("image_lock.json");
//
//   // No execute() (toggle ON): await imageLockStore.set(targetChannel.id, true);
//   // No execute() (toggle OFF): await imageLockStore.update(targetChannel.id, () => null);
//
//   // Na inicialização (ex: evento ready.js ou aqui mesmo com IIFE):
//   imageLockStore.load().then((data) => {
//     Object.keys(data).forEach((id) => { if (data[id]) lockedImageChannels.add(id); });
//   }).catch(() => {});
// ──────────────────────────────────────────────────────────────────────────────
const lockedImageChannels = new Set();

// Regex para detectar links diretos de imagem no conteúdo da mensagem.
// Detecta URLs terminadas em .png, .jpg, .jpeg, .gif ou .webp (com query string opcional).
const IMAGE_URL_REGEX = /https?:\/\/\S+\.(png|jpg|jpeg|gif|webp)(\?\S*)?\b/i;

/**
 * Verifica se uma mensagem em um canal com image-lock ativo deve ser deletada.
 * Deve ser chamada no evento messageCreate logo após os early-returns de segurança.
 *
 * Regras:
 *  - Bots e Webhooks: ignorados (bypass de segurança).
 *  - Canal não bloqueado: retorno imediato (sem custo).
 *  - Sem permissão ManageMessages: retorno imediato (failsafe).
 *  - Mensagem com imagem válida (anexo image/* OU link com extensão de imagem): permitida.
 *  - Mensagem com anexo não-imagem (pdf, zip, etc.): deletada.
 *  - Mensagem apenas de texto sem link de imagem: deletada.
 *  - Texto com imagem: permitido (funciona como legenda).
 *
 * @param {import("discord.js").Message} message
 */
async function checkImageLock(message) {
  // Failsafe: ignorar bots e webhooks
  if (message.author?.bot || message.webhookId) return;

  // Early return rápido: canal não está sob image-lock
  if (!lockedImageChannels.has(message.channelId)) return;

  // Failsafe: verificar se o bot possui permissão ManageMessages no canal
  const botMember = message.guild?.members?.me;
  if (!botMember) return;

  const channelPerms = message.channel?.permissionsFor?.(botMember);
  if (!channelPerms?.has("ManageMessages")) return;

  // Verificar presença de anexos de imagem
  const hasImageAttachment = message.attachments.some(
    (att) => att.contentType?.startsWith("image/")
  );

  // Verificar presença de anexos que NÃO são imagem (pdf, txt, zip, etc.)
  const hasNonImageAttachment = message.attachments.some(
    (att) => att.contentType && !att.contentType.startsWith("image/")
  );

  // Verificar se o texto da mensagem contém um link direto para uma imagem
  const hasImageUrl = IMAGE_URL_REGEX.test(message.content || "");

  // Bloquear se houver qualquer anexo que não seja imagem
  if (hasNonImageAttachment) {
    try {
      await message.delete();
    } catch (err) {
      // Código 10008 = "Unknown Message" (já deletada); silenciar para não quebrar o fluxo
      if (err?.code !== 10008) {
        logger.warn({ err, channelId: message.channelId }, "ImageLock: erro ao deletar mensagem com anexo não-imagem");
      }
    }
    return;
  }

  // Permitir: mensagem contém imagem válida (texto opcional funciona como legenda)
  if (hasImageAttachment || hasImageUrl) return;

  // Bloquear: texto puro sem nenhuma imagem
  try {
    await message.delete();
  } catch (err) {
    // Código 10008 = "Unknown Message" (já deletada); silenciar para não quebrar o fluxo
    if (err?.code !== 10008) {
      logger.warn({ err, channelId: message.channelId }, "ImageLock: erro ao deletar mensagem de texto sem imagem");
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("imagelock")
    .setDescription("Liga ou desliga o bloqueio de imagens em um canal (apenas imagens são permitidas)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("canal")
        .setDescription("Canal para alternar o image-lock (padrão: canal atual)")
        .setRequired(false)
    ),

  // Exportações para uso interno no evento messageCreate
  checkImageLock,
  lockedImageChannels,

  async execute(interaction) {
    try {
      // Verificar permissão: ManageChannels OU Administrator
      const hasPermission =
        interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
        interaction.member.permissions.has(PermissionFlagsBits.Administrator);

      if (!hasPermission) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você precisa da permissão **Gerenciar Canais** ou **Administrador** para usar este comando.")],
          flags: MessageFlags.Ephemeral,
        });
      }

      const targetChannel = interaction.options.getChannel("canal") ?? interaction.channel;
      const isLocked = lockedImageChannels.has(targetChannel.id);

      if (isLocked) {
        lockedImageChannels.delete(targetChannel.id);

        // TODO (persistência): remova o canal do dataStore aqui:
        //   await imageLockStore.update(targetChannel.id, () => null);

        return interaction.reply({
          embeds: [
            createSuccessEmbed(
              `Image-lock **desativado** no canal ${targetChannel}. Mensagens de qualquer tipo serão novamente aceitas.`,
              interaction.user
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      lockedImageChannels.add(targetChannel.id);

      // TODO (persistência): adicione o canal ao dataStore aqui:
      //   await imageLockStore.set(targetChannel.id, true);

      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            `Image-lock **ativado** no canal ${targetChannel}. Apenas mensagens com imagens serão permitidas.`,
            interaction.user
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      logger.error({ err }, "ImageLock: erro ao executar comando");

      const replyFn = interaction.replied || interaction.deferred
        ? interaction.followUp.bind(interaction)
        : interaction.reply.bind(interaction);

      await replyFn({
        embeds: [createErrorEmbed("Ocorreu um erro ao processar o comando. Tente novamente.")],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
