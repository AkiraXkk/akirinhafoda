const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  MessageFlags, } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");
const { createEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const partnersStore = createDataStore("partners.json");
const AUDIT_RATE_LIMIT_DELAY_MS = 2500;
const RECOVERY_EXPIRATION_MS = 72 * 60 * 60 * 1000;
const PARTNER_RECOVERY_DM_TEXT = "⚠️ Seu link de parceria na WDA expirou! Você tem exatamente 3 dias (72h) para responder esta mensagem com um NOVO LINK de convite válido. Caso contrário, sua parceria será removida automaticamente.";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnerconfig")
    .setDescription("configuracoes administrativas do sistema de parceria")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("set")
        .setDescription("configura o canal de logs e status do sistema")
        .addChannelOption(o => o.setName("logs").setDescription("canal onde os pedidos irao chegar"))
        .addBooleanOption(o => o.setName("ativo").setDescription("define se o sistema esta aberto ao publico"))
        .addRoleOption(o => o.setName("staff_ping").setDescription("cargo que sera mencionado quando chegar um pedido"))
    )
    .addSubcommand(sub =>
      sub.setName("ranks")
        .setDescription("configura os cargos de ranking (Tiers)")
        .addRoleOption(o => o.setName("bronze").setDescription("cargo para 350+ membros").setRequired(true))
        .addRoleOption(o => o.setName("prata").setDescription("cargo para 500+ membros").setRequired(true))
        .addRoleOption(o => o.setName("ouro").setDescription("cargo para 1000+ membros").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("boostrole")
        .setDescription("configura o cargo VIP para parceiros com AutoBump")
        .addRoleOption(o => o.setName("cargo").setDescription("Cargo de Parceiro Boost").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("info")
        .setDescription("consulta os detalhes de uma parceria especifica")
        .addStringOption(o => o.setName("id").setDescription("ID da parceria (ex: PARC12345)").setRequired(true))
    )
    // ==========================================
    // NOVO SUBCOMANDO: LIST (VISÃO DE ADMIN)
    // ==========================================
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("lista TODAS as parcerias ativas do servidor")
    )
    .addSubcommand(sub =>
      sub.setName("clear")
        .setDescription("apaga TODAS as parcerias do banco de dados (Reset)")
    )
    // ==========================================
    // NOVO SUBCOMANDO: AUDIT (Health-Check)
    // ==========================================
    .addSubcommand(sub =>
      sub.setName("audit")
        .setDescription("executa auditoria de parcerias e recuperacao de links")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId } = interaction;
    
    let guildConfig = await getGuildConfig(guildId) || {};
    if (!guildConfig.partnership) guildConfig.partnership = { enabledForAll: false, ranks: {} };
    let pConfig = guildConfig.partnership;

    if (sub === "set") {
      const logChan = interaction.options.getChannel("logs");
      const active = interaction.options.getBoolean("ativo");
      const staffRole = interaction.options.getRole("staff_ping");

      if (logChan) pConfig.logChannelId = logChan.id;
      if (active !== null) pConfig.enabledForAll = active;
      if (staffRole) pConfig.staffPingRoleId = staffRole.id; 

      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "✅ Configurações básicas de parceria atualizadas.", flags: MessageFlags.Ephemeral });
    }

    if (sub === "ranks") {
      pConfig.ranks = {
        bronze: interaction.options.getRole("bronze").id,
        prata: interaction.options.getRole("prata").id,
        ouro: interaction.options.getRole("ouro").id
      };
      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "✅ Cargos de Ranking configurados com sucesso.", flags: MessageFlags.Ephemeral });
    }

    if (sub === "boostrole") {
      pConfig.boostRole = interaction.options.getRole("cargo").id;
      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "✅ Cargo VIP de **Parceiro Boost** configurado com sucesso!", flags: MessageFlags.Ephemeral });
    }

    if (sub === "info") {
      const partners = await partnersStore.load();
      const searchId = interaction.options.getString("id").toUpperCase();
      const data = partners[searchId];

      if (!data) return interaction.reply({ content: "❌ Nenhuma parceria encontrada com este ID.", flags: MessageFlags.Ephemeral });

      const embed = new EmbedBuilder()
        .setTitle(`Ficha Técnica - ${data.id}`)
        .setColor(data.status === "accepted" || data.status === "ACTIVE" ? 0x00FF00 : (data.status === "pending" || data.status === "PENDING_RECOVERY" ? 0xFFFF00 : 0xFF0000))
        .addFields(
          { name: "Servidor", value: data.serverName, inline: true },
          { name: "Tier", value: data.tier || "Não definido", inline: true },
          { name: "Membros Reais", value: `${data.memberCount}`, inline: true },
          { name: "Representante", value: `<@${data.requesterId}>`, inline: true },
          { name: "Status", value: data.status.toUpperCase(), inline: true },
          { name: "AutoBump VIP?", value: data.autoBump ? "✅ Ativo" : "❌ Inativo", inline: true },
          { name: "Link", value: `[Clique aqui](${data.inviteLink})`, inline: true }
        )
        .setFooter({ text: `Solicitado em: ${new Date(data.date).toLocaleDateString('pt-BR')}` });

      if (data.processedBy) embed.addFields({ name: "Processado por", value: `<@${data.processedBy}>`, inline: false });
      if (data.reason) embed.addFields({ name: "Motivo da Recusa", value: data.reason, inline: false });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ==========================================
    // EXECUÇÃO DA NOVA LISTA DE ADMIN
    // ==========================================
    if (sub === "list") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const allPartners = await partnersStore.load();
      const activePartners = Object.values(allPartners).filter(p => p.status === "accepted" || p.status === "ACTIVE");

      if (activePartners.length === 0) {
        return interaction.editReply({ content: "❌ Não há nenhuma parceria ativa no momento." });
      }

      const embedList = new EmbedBuilder()
        .setTitle("🤝 Parcerias Ativas (Painel Admin)")
        .setColor(0x3498db)
        .setDescription(`Temos um total de **${activePartners.length}** parceria(s) fechada(s) e ativa(s) no banco de dados.`);

      // Exibe até 25 parcerias (limite do Discord para Embed Fields)
      activePartners.slice(0, 25).forEach(p => {
        embedList.addFields({
          name: `🔰 ${p.serverName} (${p.tier || "Bronze"})`,
          value: `**ID:** \`${p.id}\`\n**Rep:** <@${p.requesterId}>\n**Staff:** <@${p.processedBy}>\n**Link:** [Convite](${p.inviteLink})`,
          inline: true
        });
      });

      if (activePartners.length > 25) {
        embedList.setFooter({ text: `Mostrando as primeiras 25 de ${activePartners.length} parcerias.` });
      }

      return interaction.editReply({ embeds: [embedList] });
    }

    if (sub === "clear") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const allPartners = await partnersStore.load();
      const keys = Object.keys(allPartners);
      if (keys.length === 0) return interaction.editReply({ content: "❌ O banco de dados já está vazio!" });

      for (const key of keys) {
        try {
            await partnersStore.update(key, (data) => { if (data) data.status = "deleted"; return data; });
            if (typeof partnersStore.delete === 'function') await partnersStore.delete(key);
        } catch (e) {}
      }
      return interaction.editReply({ content: `✅ Limpeza forçada concluída! **${keys.length}** parcerias removidas.` });
    }

    // ==========================================
    // EXECUÇÃO: AUDITORIA DE PARCERIAS
    // ==========================================
    if (sub === "audit") {
      await interaction.deferReply({ ephemeral: false });

      try {
        const client = interaction.client;
        const guild = interaction.guild;
        const logService = client?.services?.log;
        const auditGuildConfig = guildConfig;
        const auditConfig = pConfig;
        const partners = await partnersStore.load();

        const entries = Object.entries(partners).filter(([, data]) => isPartnerAuditableStatus(data?.status));
        let verificadas = 0;
        let removidas = 0;
        let avisadas = 0;
        let erros = 0;
        let changed = false;

        for (const [id, data] of entries) {
          try {
            verificadas++;

            const ownerId = resolvePartnerOwnerId(data);
            const member = ownerId ? await guild.members.fetch(ownerId).catch(() => null) : null;

            // A) Check de Membro
            if (!member) {
              await deletePartnerMessage({ guild, channelId: data?.channelId, messageId: data?.messageId });
              delete partners[id];
              changed = true;
              removidas++;

              await sendPartnershipStaffLog({
                guild,
                pConfig: auditConfig,
                logService,
                title: "Parceria Removida (Dono ausente)",
                description: `A parceria **${data?.serverName || id}** foi removida porque o dono não está mais no servidor.`,
                fields: [
                  { name: "Parceria", value: id, inline: true },
                  { name: "Owner", value: ownerId ? `<@${ownerId}>` : "Desconhecido", inline: true }
                ]
              });
              continue;
            }

            // B) Check de Convite
            const inviteUrl = resolvePartnerInvite(data);
            const inviteData = inviteUrl ? await client.fetchInvite(inviteUrl).catch(() => null) : null;
            if (!inviteData) {
              const wasPending = data?.status === "PENDING_RECOVERY";
              const hadWaitingSince = typeof data?.waitingSince === "number";

              if (!wasPending) data.status = "PENDING_RECOVERY";
              if (!hadWaitingSince) data.waitingSince = Date.now();
              if (!wasPending || !hadWaitingSince) changed = true;

              if (!wasPending || !hadWaitingSince) {
                const user = await client.users.fetch(ownerId).catch(() => null);
                if (user) {
                  const dmSent = await user.send(PARTNER_RECOVERY_DM_TEXT).then(() => true).catch(async () => {
                    erros++;
                    await sendPartnershipStaffLog({
                      guild,
                      pConfig: auditConfig,
                      logService,
                      title: "Aviso de link expirado falhou",
                      description: `Aviso de link expirado falhou para <@${ownerId}> (DMs fechadas). A parceria será removida em 3 dias de qualquer forma.`,
                      fields: [{ name: "Parceria", value: id, inline: true }]
                    });
                    return false;
                  });
                  if (dmSent) avisadas++;
                } else {
                  erros++;
                  await sendPartnershipStaffLog({
                    guild,
                    pConfig: auditConfig,
                    logService,
                    title: "Aviso de link expirado falhou",
                    description: `Aviso de link expirado falhou para <@${ownerId}> (usuário não encontrado). A parceria será removida em 3 dias de qualquer forma.`,
                    fields: [{ name: "Parceria", value: id, inline: true }]
                  });
                }
              }
            }

            // C) Check de Expiração Crítica
            if (data?.status === "PENDING_RECOVERY") {
              const waitingSince = typeof data?.waitingSince === "number" ? data.waitingSince : 0;
              if (waitingSince && (Date.now() - waitingSince) > RECOVERY_EXPIRATION_MS) {
                await removePartnershipRoles(member, auditGuildConfig);
                await deletePartnerMessage({ guild, channelId: data?.channelId, messageId: data?.messageId });
                delete partners[id];
                changed = true;
                removidas++;

                await sendPartnershipStaffLog({
                  guild,
                  pConfig: auditConfig,
                  logService,
                  title: "Parceria Removida (Recuperação expirada)",
                  description: `A parceria **${data?.serverName || id}** foi removida após 72h sem resposta.`,
                  fields: [
                    { name: "Parceria", value: id, inline: true },
                    { name: "Owner", value: ownerId ? `<@${ownerId}>` : "Desconhecido", inline: true }
                  ]
                });
                continue;
              }
            }
          } catch (err) {
            erros++;
            await sendPartnershipStaffLog({
              guild,
              pConfig: auditConfig,
              logService,
              title: "Erro na auditoria de parceria",
              description: `Falha ao auditar a parceria **${id}**.`,
              fields: [{ name: "Erro", value: err?.message || String(err), inline: false }]
            });
          } finally {
            // 🛡️ ANTI-RATE LIMIT
            await new Promise(res => setTimeout(res, AUDIT_RATE_LIMIT_DELAY_MS));
          }
        }

        if (changed) {
          await partnersStore.save(partners);
        }

        const reportFields = [];
        if (erros > 0) reportFields.push({ name: "Erros", value: String(erros), inline: true });

        const reportEmbed = createEmbed({
          title: "📊 Auditoria Concluída!",
          description: `Verificadas: **${verificadas}** | Avisadas via DM: **${avisadas}** | Removidas: **${removidas}**`,
          color: 0x3498db,
          fields: reportFields
        });

        return interaction.editReply({ embeds: [reportEmbed] });
      } catch (err) {
        return interaction.editReply({ content: `❌ Erro ao executar auditoria: ${err.message || err}` });
      }
    }
  }
};

// ==========================================
// Helpers auxiliares (auditoria de parcerias)
// ==========================================
function resolvePartnerOwnerId(data) {
  return data?.requesterId || data?.representante || data?.ownerId || data?.responsavel || null;
}

function resolvePartnerInvite(data) {
  return data?.inviteLink || data?.convite || data?.inviteUrl || data?.link || null;
}

function isPartnerActiveStatus(status) {
  return status === "accepted" || status === "ACTIVE";
}

function isPartnerAuditableStatus(status) {
  return isPartnerActiveStatus(status) || status === "PENDING_RECOVERY";
}

async function deletePartnerMessage({ guild, channelId, messageId }) {
  if (!guild || !channelId || !messageId) return;
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (msg) await msg.delete().catch(() => null);
}

async function removePartnershipRoles(member, guildConfig) {
  if (!member || !guildConfig) return;
  const roleIds = new Set();
  const ranks = guildConfig?.partnership?.ranks || {};
  if (ranks.bronze) roleIds.add(ranks.bronze);
  if (ranks.prata) roleIds.add(ranks.prata);
  if (ranks.ouro) roleIds.add(ranks.ouro);
  if (guildConfig?.partnership?.boostRole) roleIds.add(guildConfig.partnership.boostRole);
  if (guildConfig?.partnerRoleId) roleIds.add(guildConfig.partnerRoleId);
  if (roleIds.size === 0) return;
  await member.roles.remove([...roleIds]).catch(() => null);
}

async function sendPartnershipStaffLog({ guild, pConfig, logService, title, description, fields = [] }) {
  if (!guild) return;
  if (logService?.log) {
    await logService.log(guild, { title, description, fields, color: 0xe74c3c }).catch(() => null);
  }
  const logChannelId = pConfig?.logChannelId;
  if (!logChannelId) return;
  const channel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const embed = createEmbed({ title, description, fields, color: 0xe74c3c });
  await channel.send({ embeds: [embed] }).catch(() => null);
}
