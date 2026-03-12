const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig } = require("../config/guildConfig");

const FOOTER_TEXT = "Banco | © WDA - Todos os direitos reservados";

// Juros diários por tier VIP (em percentual)
const INTEREST_RATES = {
  default: 0.5,   // 0.5% ao dia
  silver: 1.0,    // 1.0% ao dia
  gold: 1.5,      // 1.5% ao dia
  diamond: 2.5,   // 2.5% ao dia
  vip: 1.0,       // fallback genérico
};

const bankStore = createDataStore("cashier.json");

// Determina a taxa de juros do usuário com base nos cargos VIP
function getInterestRate(member, guildConfig) {
  if (!member || !guildConfig) return INTEREST_RATES.default;
  const tiers = guildConfig?.vipTiers || [];
  for (const tier of [...tiers].reverse()) {
    if (tier.roleId && member.roles?.cache?.has(tier.roleId)) {
      const name = (tier.name || "").toLowerCase();
      if (name.includes("diamond") || name.includes("diamante")) return INTEREST_RATES.diamond;
      if (name.includes("gold") || name.includes("ouro")) return INTEREST_RATES.gold;
      if (name.includes("silver") || name.includes("prata")) return INTEREST_RATES.silver;
      return INTEREST_RATES.vip;
    }
  }
  return INTEREST_RATES.default;
}

// Aplica juros acumulados desde o último acesso
async function applyAccruedInterest(guildId, userId) {
  const key = `${guildId}:${userId}`;
  let accrued = 0;
  await bankStore.update(key, (current) => {
    if (!current || !current.balance || current.balance <= 0) return current || { balance: 0, lastInterest: Date.now(), rate: INTEREST_RATES.default };
    const now = Date.now();
    const last = current.lastInterest || now;
    const daysPassed = (now - last) / (1000 * 60 * 60 * 24);
    if (daysPassed >= 1) {
      const interest = Math.floor(current.balance * (current.rate / 100) * Math.floor(daysPassed));
      accrued = interest;
      current.balance += interest;
      current.lastInterest = last + Math.floor(daysPassed) * 24 * 60 * 60 * 1000;
    }
    return current;
  });
  return accrued;
}

async function getBankData(guildId, userId, rate) {
  const key = `${guildId}:${userId}`;
  let data = await bankStore.get(key);
  if (!data) {
    data = { balance: 0, lastInterest: Date.now(), rate };
    await bankStore.set(key, data);
  }
  return data;
}

function buildPanel(user, bankBalance, walletBalance, rate, accrued) {
  const nextInterest = Math.floor(bankBalance * (rate / 100));
  const fields = [
    { name: "🏦 Saldo no Banco", value: `**${bankBalance.toLocaleString("pt-BR")}** 🪙`, inline: true },
    { name: "💰 Carteira", value: `**${walletBalance.toLocaleString("pt-BR")}** 🪙`, inline: true },
    { name: "📈 Taxa de Juros", value: `**${rate}%** ao dia`, inline: true },
    { name: "💵 Juros de Amanhã", value: `+**${nextInterest}** 🪙 (estimado)`, inline: true },
  ];

  if (accrued > 0) {
    fields.push({ name: "✅ Juros Aplicados", value: `+**${accrued}** 🪙 creditados agora!`, inline: false });
  }

  return createEmbed({
    title: "🏦 Banco WDA",
    description: `Bem-vindo(a) ao seu banco pessoal, **${user.username}**!\nDeposite moedas para ganhar juros automáticos diários.`,
    color: 0x1abc9c,
    fields,
    footer: { text: FOOTER_TEXT },
    thumbnail: "https://cdn-icons-png.flaticon.com/512/2830/2830284.png",
  });
}

function buildButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("cashier_deposit")
      .setLabel("Depositar")
      .setStyle(ButtonStyle.Success)
      .setEmoji("📥"),
    new ButtonBuilder()
      .setCustomId("cashier_withdraw")
      .setLabel("Sacar")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📤"),
    new ButtonBuilder()
      .setCustomId("cashier_refresh")
      .setLabel("Atualizar")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔄")
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("cashier")
    .setDescription("Painel do banco com juros automáticos por tier VIP"),

  async execute(interaction) {
    const { economy: eco, vip: vipService } = interaction.client.services;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    await interaction.deferReply({ ephemeral: true });

    const guildConfig = await getGuildConfig(guildId).catch(() => ({}));
    const rate = getInterestRate(interaction.member, guildConfig);

    const accrued = await applyAccruedInterest(guildId, userId);
    const bankData = await getBankData(guildId, userId, rate);
    const walletBal = await eco.getBalance(guildId, userId);

    await interaction.editReply({
      embeds: [buildPanel(interaction.user, bankData.balance || 0, walletBal.coins || 0, rate, accrued)],
      components: [buildButtons()],
    });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === userId,
      time: 120000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "cashier_refresh") {
        await i.deferUpdate().catch(() => {});
        const accrued2 = await applyAccruedInterest(guildId, userId);
        const bankData2 = await getBankData(guildId, userId, rate);
        const wallet2 = await eco.getBalance(guildId, userId);
        await i.editReply({
          embeds: [buildPanel(interaction.user, bankData2.balance || 0, wallet2.coins || 0, rate, accrued2)],
          components: [buildButtons()],
        }).catch(() => {});
        return;
      }

      if (i.customId === "cashier_deposit" || i.customId === "cashier_withdraw") {
        const isDeposit = i.customId === "cashier_deposit";
        const modal = new ModalBuilder()
          .setCustomId(isDeposit ? "cashier_deposit_modal" : "cashier_withdraw_modal")
          .setTitle(isDeposit ? "💰 Depositar no Banco" : "📤 Sacar do Banco");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("cashier_amount")
              .setLabel(isDeposit ? "Quanto depositar?" : "Quanto sacar?")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Ex: 500 ou 'tudo'")
              .setRequired(true)
          )
        );

        await i.showModal(modal);

        try {
          const submission = await i.awaitModalSubmit({
            time: 60000,
            filter: (m) =>
              (m.customId === "cashier_deposit_modal" || m.customId === "cashier_withdraw_modal") &&
              m.user.id === userId,
          });

          await submission.deferUpdate().catch(() => {});

          const raw = submission.fields.getTextInputValue("cashier_amount").trim().toLowerCase();
          const walletNow = await eco.getBalance(guildId, userId);
          const bankNow = await getBankData(guildId, userId, rate);

          let amount;
          if (raw === "tudo" || raw === "all" || raw === "td") {
            amount = isDeposit ? (walletNow.coins || 0) : (bankNow.balance || 0);
          } else {
            amount = parseInt(raw, 10);
          }

          if (isNaN(amount) || amount <= 0) {
            await submission.followUp({ content: "❌ Valor inválido.", ephemeral: true }).catch(() => {});
            return;
          }

          const key = `${guildId}:${userId}`;
          let resultMsg = "";

          if (isDeposit) {
            if ((walletNow.coins || 0) < amount) {
              await submission.followUp({ content: `❌ Saldo insuficiente! Você tem **${walletNow.coins || 0}** 🪙 na carteira.`, ephemeral: true }).catch(() => {});
              return;
            }
            await eco.removeCoins(guildId, userId, amount);
            await bankStore.update(key, (cur) => {
              const d = cur || { balance: 0, lastInterest: Date.now(), rate };
              d.balance = (d.balance || 0) + amount;
              return d;
            });
            resultMsg = `✅ **${amount}** 🪙 depositados com sucesso!`;
          } else {
            if ((bankNow.balance || 0) < amount) {
              await submission.followUp({ content: `❌ Saldo insuficiente no banco! Você tem **${bankNow.balance || 0}** 🪙.`, ephemeral: true }).catch(() => {});
              return;
            }
            await bankStore.update(key, (cur) => {
              const d = cur || { balance: 0, lastInterest: Date.now(), rate };
              d.balance = Math.max(0, (d.balance || 0) - amount);
              return d;
            });
            await eco.addCoins(guildId, userId, amount);
            resultMsg = `✅ **${amount}** 🪙 sacados com sucesso!`;
          }

          const bankFinal = await getBankData(guildId, userId, rate);
          const walletFinal = await eco.getBalance(guildId, userId);
          await interaction.editReply({
            content: resultMsg,
            embeds: [buildPanel(interaction.user, bankFinal.balance || 0, walletFinal.coins || 0, rate, 0)],
            components: [buildButtons()],
          }).catch(() => {});
        } catch {
          // Timeout no modal – ignora silenciosamente
        }
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        await interaction.editReply({ components: [] }).catch(() => {});
      }
    });
  },

  async handleButton(interaction) {
    // O roteador principal chama execute; os botões são gerenciados internamente pelo collector
    // Este método existe para compatibilidade com o roteador dinâmico caso seja necessário
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
  },
};
