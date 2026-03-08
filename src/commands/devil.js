const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, createErrorEmbed } = require("../embeds");

const robCooldowns = new Map();
const crimeCooldowns = new Map();
const smuggleCooldowns = new Map();

const ROB_COOLDOWN = 10 * 60 * 1000;   // 10 minutos
const CRIME_COOLDOWN = 15 * 60 * 1000; // 15 minutos
const SMUGGLE_COOLDOWN = 30 * 60 * 1000; // 30 minutos
const ROB_MIN_BALANCE = 200; // Saldo mínimo do ladrão para roubar
const ROB_MIN_VICTIM_BALANCE = 50; // Saldo mínimo da vítima
const ROB_SUCCESS_RATE = 0.45; // 45% de chance de sucesso
const ROB_MAX_PERCENTAGE = 0.3; // Rouba até 30% do saldo da vítima
const ROB_ABSOLUTE_MAX = 500; // Máximo absoluto de moedas roubadas

const CRIMES = [
  { name: "Hackear um sistema bancário", reward: [150, 500], risk: 0.45 },
  { name: "Roubar uma joalheria", reward: [200, 600], risk: 0.50 },
  { name: "Falsificar documentos", reward: [80, 250], risk: 0.30 },
  { name: "Contrabandear eletrônicos", reward: [100, 400], risk: 0.40 },
  { name: "Invadir um cofre", reward: [300, 800], risk: 0.60 },
  { name: "Fraude digital", reward: [120, 350], risk: 0.35 },
  { name: "Assalto a mão armada", reward: [250, 700], risk: 0.55 },
  { name: "Tráfico de informações", reward: [180, 450], risk: 0.40 },
];

const SMUGGLE_ITEMS = [
  { name: "📦 Caixa misteriosa", mult: [0.5, 1.5] },
  { name: "💎 Diamantes falsos", mult: [0.3, 2.0] },
  { name: "🎭 Artefato roubado", mult: [0.8, 2.5] },
  { name: "📱 Eletrônicos importados", mult: [0.6, 1.8] },
  { name: "🧪 Substância desconhecida", mult: [0.2, 3.0] },
  { name: "🗝️ Relíquias antigas", mult: [1.0, 2.0] },
  { name: "🖼️ Obras de arte", mult: [0.7, 2.2] },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function checkCooldown(map, key, cooldownMs) {
  const last = map.get(key) || 0;
  const now = Date.now();
  if (now - last < cooldownMs) {
    return { onCooldown: true, nextTime: Math.floor((last + cooldownMs) / 1000) };
  }
  return { onCooldown: false };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("devil")
    .setDescription("😈 Atividades do submundo — ganhe moedas no lado sombrio")
    .addSubcommand(s => s.setName("roubar").setDescription("Tente roubar moedas de outro usuário")
      .addUserOption(o => o.setName("vitima").setDescription("Quem você quer roubar").setRequired(true)))
    .addSubcommand(s => s.setName("crime").setDescription("Cometa um crime e tente lucrar"))
    .addSubcommand(s => s.setName("contrabando").setDescription("Negocie no mercado negro")
      .addIntegerOption(o => o.setName("investimento").setDescription("Quanto investir no contrabando").setMinValue(50).setRequired(true))),

  async execute(interaction) {
    const { economy: eco } = interaction.client.services;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // ─── ROUBAR (ROB) ───
    if (sub === "roubar") {
      const victim = interaction.options.getUser("vitima");

      if (victim.bot || victim.id === userId) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não pode roubar essa pessoa!")], ephemeral: true });
      }

      const cooldownKey = `${guildId}:${userId}`;
      const cd = checkCooldown(robCooldowns, cooldownKey, ROB_COOLDOWN);
      if (cd.onCooldown) {
        return interaction.reply({
          embeds: [createErrorEmbed(`Você precisa se esconder por um tempo!\n⏳ Tente novamente <t:${cd.nextTime}:R>.`)],
          ephemeral: true
        });
      }

      const robberBal = await eco.getBalance(guildId, userId);
      if ((robberBal.coins || 0) < ROB_MIN_BALANCE) {
        return interaction.reply({
          embeds: [createErrorEmbed(`Você precisa de pelo menos **${ROB_MIN_BALANCE} 🪙** na carteira para tentar roubar.`)],
          ephemeral: true
        });
      }

      const victimBal = await eco.getBalance(guildId, victim.id);
      if ((victimBal.coins || 0) < ROB_MIN_VICTIM_BALANCE) {
        return interaction.reply({
          embeds: [createErrorEmbed(`${victim.username} não tem moedas suficientes para roubar.`)],
          ephemeral: true
        });
      }

      robCooldowns.set(cooldownKey, Date.now());

      const success = Math.random() < ROB_SUCCESS_RATE;

      if (success) {
        const maxSteal = Math.min(Math.floor(victimBal.coins * ROB_MAX_PERCENTAGE), ROB_ABSOLUTE_MAX);
        const stolen = randomInt(ROB_MIN_VICTIM_BALANCE, Math.max(ROB_MIN_VICTIM_BALANCE, maxSteal));

        await eco.removeCoins(guildId, victim.id, stolen);
        await eco.addCoins(guildId, userId, stolen);

        return interaction.reply({
          embeds: [createEmbed({
            title: "😈 Roubo Bem-sucedido!",
            description: `Você roubou **${stolen} 🪙** de ${victim}!\nA vítima nem percebeu... por enquanto.`,
            color: 0x8e44ad,
            footer: { text: "WDA - Todos os direitos reservados" }
          })]
        });
      } else {
        const fine = randomInt(50, 150);
        const actualFine = Math.min(fine, robberBal.coins);
        if (actualFine > 0) {
          await eco.removeCoins(guildId, userId, actualFine);
        }

        return interaction.reply({
          embeds: [createEmbed({
            title: "🚔 Pego em Flagrante!",
            description: `Você tentou roubar ${victim} mas foi pego!\n💸 Multa: **${actualFine} 🪙**`,
            color: 0xe74c3c,
            footer: { text: "WDA - Todos os direitos reservados" }
          })]
        });
      }
    }

    // ─── CRIME ───
    if (sub === "crime") {
      const cooldownKey = `${guildId}:${userId}`;
      const cd = checkCooldown(crimeCooldowns, cooldownKey, CRIME_COOLDOWN);
      if (cd.onCooldown) {
        return interaction.reply({
          embeds: [createErrorEmbed(`A polícia está de olho em você!\n⏳ Tente novamente <t:${cd.nextTime}:R>.`)],
          ephemeral: true
        });
      }

      crimeCooldowns.set(cooldownKey, Date.now());

      const crime = CRIMES[Math.floor(Math.random() * CRIMES.length)];
      const success = Math.random() > crime.risk;

      if (success) {
        const reward = randomInt(crime.reward[0], crime.reward[1]);
        await eco.addCoins(guildId, userId, reward);

        return interaction.reply({
          embeds: [createEmbed({
            title: "😈 Crime Perfeito!",
            description: `**${crime.name}**\n\nVocê completou o crime com sucesso!\n💰 Lucro: **+${reward} 🪙**`,
            color: 0x8e44ad,
            fields: [
              { name: "Risco", value: `${Math.round(crime.risk * 100)}%`, inline: true },
              { name: "Recompensa", value: `${reward} 🪙`, inline: true }
            ],
            footer: { text: "WDA - Todos os direitos reservados" }
          })]
        });
      } else {
        const fine = randomInt(100, 300);
        const bal = await eco.getBalance(guildId, userId);
        const actualFine = Math.min(fine, bal.coins || 0);
        if (actualFine > 0) {
          await eco.removeCoins(guildId, userId, actualFine);
        }

        return interaction.reply({
          embeds: [createEmbed({
            title: "🚨 Preso!",
            description: `**${crime.name}**\n\nVocê foi pego pela polícia!\n💸 Multa: **-${actualFine} 🪙**`,
            color: 0xe74c3c,
            fields: [
              { name: "Risco", value: `${Math.round(crime.risk * 100)}%`, inline: true },
              { name: "Multa", value: `${actualFine} 🪙`, inline: true }
            ],
            footer: { text: "WDA - Todos os direitos reservados" }
          })]
        });
      }
    }

    // ─── CONTRABANDO (SMUGGLING) ───
    if (sub === "contrabando") {
      const investment = interaction.options.getInteger("investimento");

      const cooldownKey = `${guildId}:${userId}`;
      const cd = checkCooldown(smuggleCooldowns, cooldownKey, SMUGGLE_COOLDOWN);
      if (cd.onCooldown) {
        return interaction.reply({
          embeds: [createErrorEmbed(`O mercado negro está fechado para você!\n⏳ Tente novamente <t:${cd.nextTime}:R>.`)],
          ephemeral: true
        });
      }

      const bal = await eco.getBalance(guildId, userId);
      if ((bal.coins || 0) < investment) {
        return interaction.reply({
          embeds: [createErrorEmbed(`Saldo insuficiente! Você tem apenas **${bal.coins || 0} 🪙**.`)],
          ephemeral: true
        });
      }

      smuggleCooldowns.set(cooldownKey, Date.now());
      await eco.removeCoins(guildId, userId, investment);

      const item = SMUGGLE_ITEMS[Math.floor(Math.random() * SMUGGLE_ITEMS.length)];
      const multiplier = randomFloat(item.mult[0], item.mult[1]);
      const payout = Math.floor(investment * multiplier);
      const profit = payout - investment;

      if (payout > 0) {
        await eco.addCoins(guildId, userId, payout);
      }

      const won = profit > 0;
      const even = profit === 0;

      return interaction.reply({
        embeds: [createEmbed({
          title: won ? "📦 Contrabando Lucrativo!" : even ? "📦 Contrabando Neutro" : "📦 Contrabando Fracassado!",
          description: [
            `**Item:** ${item.name}`,
            `**Investimento:** ${investment} 🪙`,
            `**Multiplicador:** ${multiplier.toFixed(2)}x`,
            `**Retorno:** ${payout} 🪙`,
            "",
            won
              ? `💰 Lucro: **+${profit} 🪙**`
              : even
                ? "🤝 Você saiu no zero a zero."
                : `💸 Prejuízo: **${profit} 🪙**`
          ].join("\n"),
          color: won ? 0x2ecc71 : even ? 0xf1c40f : 0xe74c3c,
          footer: { text: "WDA - Todos os direitos reservados" }
        })]
      });
    }
  }
};
