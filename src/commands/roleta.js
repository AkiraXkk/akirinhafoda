const { logger } = require("../logger");
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  MessageFlags, } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

const CHAMBERS = 6;
const QUICK_BETS = [100, 500, 1000];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roleta")
    .setDescription("Jogue Roleta Russa e aposte suas moedas!")
    .addIntegerOption((opt) =>
      opt
        .setName("aposta")
        .setDescription("Valor da aposta para iniciar direto")
        .setMinValue(1)
        .setRequired(false)
    ),

  async execute(interaction) {
    const { economy: eco } = interaction.client.services;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const directBet = interaction.options.getInteger("aposta");

    if (directBet) {
      return runGame(interaction, directBet, eco, guildId, userId);
    }

    const mainEmbed = createEmbed({
      title: "🔫 Roleta Russa",
      description:
        "Teste sua coragem! O revólver tem **6 câmaras** e **1 bala**.\nA cada rodada você puxa o gatilho. Quanto mais sobreviver, maior o prêmio!",
      color: 0xe74c3c,
      fields: [
        {
          name: "💸 Premiação",
          value:
            "1ª rodada: **1.2x**\n2ª rodada: **1.5x**\n3ª rodada: **2x**\n4ª rodada: **3x**\n5ª rodada: **5x**\nSobreviveu tudo: **6x**",
          inline: true,
        },
        {
          name: "🎮 Como jogar",
          value:
            "Escolha um valor e puxe o gatilho!\nVocê pode parar a qualquer momento e levar o prêmio acumulado.",
          inline: true,
        },
      ],
      footer: { text: "Jogo | Escolha um valor para começar • © WDA - Todos os direitos reservados" },
    });

    const rowQuick = new ActionRowBuilder().addComponents(
      ...QUICK_BETS.map((value) =>
        new ButtonBuilder()
          .setCustomId(`roleta_quick_${value}`)
          .setLabel(`${value} 🪙`)
          .setStyle(ButtonStyle.Primary)
      )
    );

    await interaction.reply({
      embeds: [mainEmbed],
      components: [rowQuick],
      flags: MessageFlags.Ephemeral,
    });
    const response = await interaction.fetchReply();

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== userId)
        return i.reply({ content: "Não é seu jogo!", flags: MessageFlags.Ephemeral });

      if (i.customId.startsWith("roleta_quick_")) {
        collector.stop("started");
        // 🛡️ PROTEÇÃO: Defer imediatamente
        if (!i.deferred && !i.replied) {
          await i.deferUpdate().catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
        }
        const value = parseInt(i.customId.split("_")[2], 10);
        return runGame(i, value, eco, guildId, userId);
      }
    });
  },
};

async function runGame(interaction, bet, eco, guildId, userId) {
  const originalBet = bet;
  const balance = await eco.getBalance(guildId, userId);

  if ((balance.coins || 0) < bet) {
    const insufficient = {
      embeds: [
        createErrorEmbed(
          `Saldo insuficiente! Você tem **${balance.coins || 0}** 🪙`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.replied || interaction.deferred)
      return interaction.followUp(insufficient).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    return interaction.reply(insufficient);
  }

  let gameResolved = false;

  try {
    await eco.removeCoins(guildId, userId, bet);

    if (interaction.isButton()) {
      if (!interaction.deferred && !interaction.replied)
        await interaction.deferUpdate();
    } else if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "🔫 Carregando o revólver...",
        flags: MessageFlags.Ephemeral,
      });
    }

    const multipliers = [1.2, 1.5, 2, 3, 5, 6];
    // The bullet is in one random chamber (0 to 5)
    const bulletChamber = Math.floor(Math.random() * CHAMBERS);
    let currentRound = 0;

    const getChamberDisplay = (round, alive) => {
      let display = "";
      for (let i = 0; i < CHAMBERS; i++) {
        if (i < round) {
          display += "⬛ "; // already fired (safe)
        } else if (i === round && !alive) {
          display += "💥 "; // bullet found
        } else if (i === round) {
          display += "🟢 "; // current safe
        } else {
          display += "⬜ "; // not yet fired
        }
      }
      return display;
    };

    const getGameEmbed = (round, alive, cashOut = false) => {
      const currentMultiplier = multipliers[Math.min(round, multipliers.length - 1)];
      const prize = Math.floor(originalBet * currentMultiplier);

      if (!alive) {
        return createEmbed({
          title: "💀 BANG! Você foi atingido!",
          description: [
            getChamberDisplay(round, false),
            "",
            `A bala estava na **câmara ${bulletChamber + 1}**!`,
            `Você perdeu **${originalBet}** 🪙`,
          ].join("\n"),
          color: 0xe74c3c,
          footer: { text: "Jogo | © WDA - Todos os direitos reservados" },
        });
      }

      if (cashOut || round >= CHAMBERS) {
        return createEmbed({
          title:
            round >= CHAMBERS
              ? "🏆 SOBREVIVEU A TODAS AS RODADAS!"
              : "💰 Você saiu com vida!",
          description: [
            getChamberDisplay(round, true),
            "",
            `Você ganhou **${prize}** 🪙`,
          ].join("\n"),
          color: 0x2ecc71,
          footer: { text: "Jogo | © WDA - Todos os direitos reservados" },
        });
      }

      const nextMultiplier =
        multipliers[Math.min(round + 1, multipliers.length - 1)];
      return createEmbed({
        title: `🔫 Roleta Russa — Rodada ${round + 1}/${CHAMBERS}`,
        description: [
          getChamberDisplay(round, true),
          "",
          round > 0
            ? `✅ Sobreviveu ${round} rodada${round !== 1 ? "s" : ""}!`
            : "O revólver está carregado...",
          "",
          `💰 Prêmio atual: **${prize}** 🪙 (${currentMultiplier}x)`,
          `🎯 Próximo prêmio: **${Math.floor(originalBet * nextMultiplier)}** 🪙 (${nextMultiplier}x)`,
          "",
          "Puxar o gatilho ou retirar-se com o prêmio?",
        ].join("\n"),
        color: 0xf39c12,
        footer: `Jogo | Aposta: ${originalBet} 🪙 • Chance: ${Math.round(((CHAMBERS - round - 1) / (CHAMBERS - round)) * 100)}% • © WDA - Todos os direitos reservados`,
      });
    };

    const getButtons = (round) => {
      return [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("roleta_fire")
            .setLabel("🔫 Puxar Gatilho")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("roleta_cashout")
            .setLabel(
              `💰 Retirar (${Math.floor(originalBet * multipliers[Math.min(round, multipliers.length - 1)])} 🪙)`
            )
            .setStyle(ButtonStyle.Success)
            .setDisabled(round === 0) // Can't cash out before first round
        ),
      ];
    };

    const msg = await interaction.editReply({
      content: null,
      embeds: [getGameEmbed(0, true)],
      components: getButtons(0),
      flags: MessageFlags.Ephemeral,
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === userId,
      time: 120000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "roleta_fire") {
        if (currentRound === bulletChamber) {
          // BANG!
          collector.stop("dead");
          gameResolved = true;
          await i.update({
            embeds: [getGameEmbed(currentRound, false)],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("roleta_replay")
                  .setLabel(`Jogar novamente (${originalBet} 🪙)`)
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji("🔁")
              ),
            ],
          });

          const replayCollector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (btn) =>
              btn.user.id === userId && btn.customId === "roleta_replay",
            time: 60000,
            max: 1,
          });

          replayCollector.on("collect", async (btn) => {
            await runGame(btn, originalBet, eco, guildId, userId);
          });

          replayCollector.on("end", async (_, reason) => {
            if (reason === "time") {
              await interaction.editReply({ components: [] }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
            }
          });
        } else {
          // Survived!
          currentRound++;

          if (currentRound >= CHAMBERS) {
            // Survived all rounds!
            collector.stop("survived_all");
            const prize = Math.floor(
              originalBet * multipliers[multipliers.length - 1]
            );
            await eco.addCoins(guildId, userId, prize);
            gameResolved = true;
            await i.update({
              embeds: [getGameEmbed(currentRound, true, true)],
              components: [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId("roleta_replay")
                    .setLabel(`Jogar novamente (${originalBet} 🪙)`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("🔁")
                ),
              ],
            });

            const replayCollector = msg.createMessageComponentCollector({
              componentType: ComponentType.Button,
              filter: (btn) =>
                btn.user.id === userId && btn.customId === "roleta_replay",
              time: 60000,
              max: 1,
            });

            replayCollector.on("collect", async (btn) => {
              await runGame(btn, originalBet, eco, guildId, userId);
            });

            replayCollector.on("end", async (_, reason) => {
              if (reason === "time") {
                await interaction
                  .editReply({ components: [] })
                  .catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
              }
            });
          } else {
            await i.update({
              embeds: [getGameEmbed(currentRound, true)],
              components: getButtons(currentRound),
            });
          }
        }
      }

      if (i.customId === "roleta_cashout") {
        collector.stop("cashout");
        const currentMultiplier =
          multipliers[Math.min(currentRound, multipliers.length - 1)];
        const prize = Math.floor(originalBet * currentMultiplier);
        await eco.addCoins(guildId, userId, prize);
        gameResolved = true;
        await i.update({
          embeds: [getGameEmbed(currentRound, true, true)],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("roleta_replay")
                .setLabel(`Jogar novamente (${originalBet} 🪙)`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🔁")
            ),
          ],
        });

        const replayCollector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: (btn) =>
            btn.user.id === userId && btn.customId === "roleta_replay",
          time: 60000,
          max: 1,
        });

        replayCollector.on("collect", async (btn) => {
          await runGame(btn, originalBet, eco, guildId, userId);
        });

        replayCollector.on("end", async (_, reason) => {
          if (reason === "time") {
            await interaction.editReply({ components: [] }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
          }
        });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        if (!gameResolved) {
          // Refund on timeout
          await eco.addCoins(guildId, userId, originalBet);
          gameResolved = true;
        }
        await interaction
          .editReply({
            content: "⏱️ Tempo esgotado! A aposta foi devolvida.",
            components: [],
          })
          .catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
      }
    });
  } catch (error) {
    if (!gameResolved) {
      await eco.addCoins(guildId, userId, originalBet).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    }
    if (interaction.replied || interaction.deferred) {
      await interaction
        .editReply({
          content: "Ocorreu um erro no jogo. Sua aposta foi devolvida.",
          embeds: [],
          components: [],
        })
        .catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    } else {
      await interaction
        .reply({
          content: "Ocorreu um erro no jogo. Sua aposta foi devolvida.",
          flags: MessageFlags.Ephemeral,
        })
        .catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    }
  }
}
