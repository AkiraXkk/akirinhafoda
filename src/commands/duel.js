const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  userMention,
  MessageFlags,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const FOOTER_TEXT = "PvP | © WDA - Todos os direitos reservados";

// ELO constants
const K_FACTOR = 32;
const DEFAULT_ELO = 1000;

const duelStore = createDataStore("duel.json");

// ─── ELO helpers ────────────────────────────────────────────────────────────

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function newRatings(winnerRating, loserRating) {
  const expW = expectedScore(winnerRating, loserRating);
  const expL = expectedScore(loserRating, winnerRating);
  return {
    winner: Math.round(winnerRating + K_FACTOR * (1 - expW)),
    loser: Math.round(loserRating + K_FACTOR * (0 - expL)),
  };
}

function eloRank(elo) {
  if (elo >= 2000) return { label: "🏆 Lendário", color: 0xffd700 };
  if (elo >= 1600) return { label: "💎 Diamante", color: 0x1ee3cf };
  if (elo >= 1300) return { label: "🥇 Ouro", color: 0xf1c40f };
  if (elo >= 1100) return { label: "🥈 Prata", color: 0x95a5a6 };
  return { label: "🥉 Bronze", color: 0xcd7f32 };
}

// ─── Data helpers ────────────────────────────────────────────────────────────

async function getPlayerData(guildId, userId) {
  const key = `${guildId}:${userId}`;
  let data = await duelStore.get(key);
  if (!data) {
    data = { elo: DEFAULT_ELO, wins: 0, losses: 0, streak: 0 };
    await duelStore.set(key, data);
  }
  return data;
}

async function updatePlayerData(guildId, userId, updater) {
  const key = `${guildId}:${userId}`;
  return duelStore.update(key, (cur) => updater(cur || { elo: DEFAULT_ELO, wins: 0, losses: 0, streak: 0 }));
}

// ─── Embed builders ─────────────────────────────────────────────────────────

function buildChallengeEmbed(challenger, target, bet) {
  return createEmbed({
    title: "⚔️ Desafio de Duelo!",
    description: [
      `${userMention(challenger.id)} desafiou ${userMention(target.id)} para um duelo!`,
      "",
      `💰 Aposta em jogo: **${bet}** 🪙`,
      "",
      `${userMention(target.id)}, você aceita o desafio?`,
    ].join("\n"),
    color: 0xe74c3c,
    thumbnail: "https://cdn-icons-png.flaticon.com/512/1067/1067566.png",
    footer: { text: `${FOOTER_TEXT} • Expira em 60 segundos` },
    fields: [
      { name: "⚔️ Desafiante", value: `${challenger.username}`, inline: true },
      { name: "🛡️ Defensor", value: `${target.username}`, inline: true },
    ],
  });
}

function buildDuelEmbed(challenger, target, hp1, hp2, round, log) {
  return createEmbed({
    title: `⚔️ Duelo — Rodada ${round}`,
    description: log.slice(-5).join("\n") || "O duelo começa!",
    color: 0xe67e22,
    fields: [
      { name: `❤️ ${challenger.username}`, value: `**${Math.max(0, hp1)}** HP`, inline: true },
      { name: `❤️ ${target.username}`, value: `**${Math.max(0, hp2)}** HP`, inline: true },
    ],
    footer: { text: `${FOOTER_TEXT} • Rodada ${round}/10` },
  });
}

function buildResultEmbed(winner, loser, bet, eloChanges, winStreak) {
  const rank = eloRank(eloChanges.winner);
  return createEmbed({
    title: "🏆 Duelo Encerrado!",
    description: [
      `${userMention(winner.id)} venceu o duelo contra ${userMention(loser.id)}!`,
      "",
      `💰 Prêmio: **+${bet}** 🪙`,
      winStreak > 1 ? `🔥 Sequência de vitórias: **${winStreak}x**!` : "",
    ].filter(Boolean).join("\n"),
    color: rank.color,
    fields: [
      { name: `📈 ${winner.username}`, value: `ELO: **+${eloChanges.winnerDiff}** → ${eloChanges.winner} ${rank.label}`, inline: true },
      { name: `📉 ${loser.username}`, value: `ELO: **${eloChanges.loserDiff}** → ${eloChanges.loser}`, inline: true },
    ],
    thumbnail: winner.displayAvatarURL({ size: 256 }),
    footer: { text: FOOTER_TEXT },
  });
}

// ─── Combat engine ───────────────────────────────────────────────────────────

async function runDuel(interaction, challenger, target, bet, eco, guildId) {
  const MAX_HP = 100;
  const MAX_ROUNDS = 10;

  let hp1 = MAX_HP;
  let hp2 = MAX_HP;
  let round = 0;
  const log = [];

  const [d1, d2] = await Promise.all([
    getPlayerData(guildId, challenger.id),
    getPlayerData(guildId, target.id),
  ]);

  const attackMsg = (attacker, defender, dmg, isCrit) =>
    `${isCrit ? "⚡ CRÍTICO! " : ""}**${attacker.username}** atacou **${defender.username}** por **${dmg}** de dano.`;

  const doRound = () => {
    round++;
    // Challenger attacks target
    const crit1 = Math.random() < 0.15;
    const dmg1 = Math.floor(Math.random() * 20 + 10) * (crit1 ? 2 : 1);
    hp2 -= dmg1;
    log.push(attackMsg(challenger, target, dmg1, crit1));

    if (hp2 <= 0) return "challenger";

    // Target attacks challenger
    const crit2 = Math.random() < 0.15;
    const dmg2 = Math.floor(Math.random() * 20 + 10) * (crit2 ? 2 : 1);
    hp1 -= dmg2;
    log.push(attackMsg(target, challenger, dmg2, crit2));

    if (hp1 <= 0) return "target";
    return null;
  };

  // Run all rounds automatically (bot-driven combat)
  let winner = null;
  while (round < MAX_ROUNDS && !winner) {
    winner = doRound();
  }

  // If still tied after max rounds, highest HP wins
  if (!winner) {
    winner = hp1 >= hp2 ? "challenger" : "target";
    log.push(`⏱️ Limite de rodadas atingido! ${hp1 >= hp2 ? challenger.username : target.username} vence por mais HP.`);
  }

  const winnerUser = winner === "challenger" ? challenger : target;
  const loserUser = winner === "challenger" ? target : challenger;
  const winnerId = winnerUser.id;
  const loserId = loserUser.id;

  // ELO update
  const winnerElo = winner === "challenger" ? d1.elo : d2.elo;
  const loserElo = winner === "challenger" ? d2.elo : d1.elo;
  const newElo = newRatings(winnerElo, loserElo);

  let winStreak = 1;
  await updatePlayerData(guildId, winnerId, (d) => {
    d.elo = newElo.winner;
    d.wins = (d.wins || 0) + 1;
    d.streak = (d.streak || 0) + 1;
    winStreak = d.streak;
    return d;
  });
  await updatePlayerData(guildId, loserId, (d) => {
    d.elo = Math.max(100, newElo.loser);
    d.losses = (d.losses || 0) + 1;
    d.streak = 0;
    return d;
  });

  // Economy: winner gets both bets (their own back + loser's)
  await eco.addCoins(guildId, winnerId, bet * 2);

  const eloChanges = {
    winner: newElo.winner,
    loser: Math.max(100, newElo.loser),
    winnerDiff: newElo.winner - winnerElo >= 0 ? `+${newElo.winner - winnerElo}` : `${newElo.winner - winnerElo}`,
    loserDiff: Math.max(100, newElo.loser) - loserElo >= 0 ? `+${Math.max(100, newElo.loser) - loserElo}` : `${Math.max(100, newElo.loser) - loserElo}`,
  };

  return {
    winnerUser,
    loserUser,
    log,
    eloChanges,
    winStreak,
    hp1: winner === "challenger" ? hp1 : hp2,
    hp2: winner === "challenger" ? hp2 : hp1,
  };
}

// ─── Main export ─────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("duel")
    .setDescription("Desafie outro usuário para um duelo ranqueado 1v1!")
    .addUserOption((o) =>
      o.setName("oponente").setDescription("Quem você quer desafiar?").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("aposta").setDescription("Moedas em jogo (mínimo 50)").setMinValue(50).setRequired(true)
    ),

  async execute(interaction) {
    const { economy: eco } = interaction.client.services;
    const guildId = interaction.guildId;
    const challenger = interaction.user;
    const target = interaction.options.getUser("oponente");
    const bet = interaction.options.getInteger("aposta");

    // Validações básicas
    if (target.bot) {
      return interaction.reply({ embeds: [createErrorEmbed("Você não pode desafiar um bot!")], flags: MessageFlags.Ephemeral });
    }
    if (target.id === challenger.id) {
      return interaction.reply({ embeds: [createErrorEmbed("Você não pode se desafiar!")], flags: MessageFlags.Ephemeral });
    }

    const challengerBal = await eco.getBalance(guildId, challenger.id);
    if ((challengerBal.coins || 0) < bet) {
      return interaction.reply({
        embeds: [createErrorEmbed(`Saldo insuficiente! Você tem **${challengerBal.coins || 0}** 🪙.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Envia o desafio público
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`duel_accept_${challenger.id}_${target.id}_${bet}`)
        .setLabel("✅ Aceitar Duelo")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`duel_decline_${challenger.id}_${target.id}`)
        .setLabel("❌ Recusar")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      content: userMention(target.id),
      embeds: [buildChallengeEmbed(challenger, target, bet)],
      components: [row],
    });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    let resolved = false;

    collector.on("collect", async (i) => {
      // Only challenger or target can interact
      if (i.user.id !== target.id && i.user.id !== challenger.id) {
        return i.reply({ content: "Esse duelo não é seu!", flags: MessageFlags.Ephemeral });
      }

      if (i.customId.startsWith("duel_decline_")) {
        // Challenger can cancel; target can decline
        collector.stop("declined");
        resolved = true;
        await i.update({
          embeds: [createEmbed({
            title: "⚔️ Duelo Recusado",
            description: `${i.user.username} recusou o duelo.`,
            color: 0x95a5a6,
            footer: { text: FOOTER_TEXT },
          })],
          components: [],
        });
        return;
      }

      if (i.customId.startsWith("duel_accept_")) {
        // Only the target can accept
        if (i.user.id !== target.id) {
          return i.reply({ content: "Somente o desafiado pode aceitar!", flags: MessageFlags.Ephemeral });
        }

        // Check target balance
        const targetBal = await eco.getBalance(guildId, target.id);
        if ((targetBal.coins || 0) < bet) {
          collector.stop("no_funds");
          resolved = true;
          return i.update({
            embeds: [createErrorEmbed(`${target.username} não tem moedas suficientes para aceitar! (Precisa de **${bet}** 🪙)`)],
            components: [],
          });
        }

        // Re-check challenger balance (might have changed)
        const challengerBal2 = await eco.getBalance(guildId, challenger.id);
        if ((challengerBal2.coins || 0) < bet) {
          collector.stop("no_funds");
          resolved = true;
          return i.update({
            embeds: [createErrorEmbed(`${challenger.username} não tem mais moedas suficientes!`)],
            components: [],
          });
        }

        collector.stop("accepted");
        resolved = true;

        // Deduct bets from both players
        await eco.removeCoins(guildId, challenger.id, bet);
        await eco.removeCoins(guildId, target.id, bet);

        await i.update({
          embeds: [createEmbed({
            title: "⚔️ Duelo Aceito! Que comecem os combates...",
            description: `**${challenger.username}** vs **${target.username}** — ${bet} 🪙 cada`,
            color: 0xe67e22,
            footer: { text: FOOTER_TEXT },
          })],
          components: [],
        });

        // Run the duel
        try {
          const result = await runDuel(interaction, challenger, target, bet, eco, guildId);

          const replayRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`duel_replay_${challenger.id}_${target.id}_${bet}`)
              .setLabel("🔁 Revanche")
              .setStyle(ButtonStyle.Primary)
          );

          await interaction.editReply({
            content: null,
            embeds: [buildResultEmbed(result.winnerUser, result.loserUser, bet, result.eloChanges, result.winStreak)],
            components: [replayRow],
          }).catch(() => {});

          // Replay collector
          const replayMsg = await interaction.fetchReply().catch(() => null);
          if (replayMsg) {
            const replayCollector = replayMsg.createMessageComponentCollector({
              componentType: ComponentType.Button,
              filter: (btn) =>
                (btn.user.id === challenger.id || btn.user.id === target.id) &&
                btn.customId.startsWith("duel_replay_"),
              time: 60000,
              max: 1,
            });

            replayCollector.on("collect", async (btn) => {
              await btn.deferUpdate().catch(() => {});
              // Create a new duel initiated by the replay requester
              const newChallenger = btn.user;
              const newTarget = btn.user.id === challenger.id ? target : challenger;

              const newBal = await eco.getBalance(guildId, newChallenger.id);
              if ((newBal.coins || 0) < bet) {
                return interaction.editReply({
                  embeds: [createErrorEmbed(`Saldo insuficiente para a revanche! Você tem **${newBal.coins || 0}** 🪙.`)],
                  components: [],
                }).catch(() => {});
              }

              const newTargetBal = await eco.getBalance(guildId, newTarget.id);
              if ((newTargetBal.coins || 0) < bet) {
                return interaction.editReply({
                  embeds: [createErrorEmbed(`${newTarget.username} não tem moedas suficientes para a revanche!`)],
                  components: [],
                }).catch(() => {});
              }

              await eco.removeCoins(guildId, newChallenger.id, bet);
              await eco.removeCoins(guildId, newTarget.id, bet);

              await interaction.editReply({
                embeds: [createEmbed({
                  title: "⚔️ Revanche em andamento!",
                  description: `**${newChallenger.username}** vs **${newTarget.username}** — ${bet} 🪙 cada`,
                  color: 0xe67e22,
                  footer: { text: FOOTER_TEXT },
                })],
                components: [],
              }).catch(() => {});

              const result2 = await runDuel(interaction, newChallenger, newTarget, bet, eco, guildId);
              await interaction.editReply({
                embeds: [buildResultEmbed(result2.winnerUser, result2.loserUser, bet, result2.eloChanges, result2.winStreak)],
                components: [],
              }).catch(() => {});
            });

            replayCollector.on("end", async (_, reason) => {
              if (reason === "time") {
                await interaction.editReply({ components: [] }).catch(() => {});
              }
            });
          }
        } catch (err) {
          // Refund both players on error
          await eco.addCoins(guildId, challenger.id, bet).catch(() => {});
          await eco.addCoins(guildId, target.id, bet).catch(() => {});
          await interaction.editReply({
            embeds: [createErrorEmbed("Ocorreu um erro durante o duelo. As apostas foram devolvidas.")],
            components: [],
          }).catch(() => {});
        }
      }
    });

    collector.on("end", async (_, reason) => {
      if (!resolved && reason === "time") {
        await interaction.editReply({
          embeds: [createEmbed({
            title: "⏱️ Duelo Expirado",
            description: `${target.username} não respondeu a tempo.`,
            color: 0x95a5a6,
            footer: { text: FOOTER_TEXT },
          })],
          components: [],
        }).catch(() => {});
      }
    });
  },

  // Leaderboard do ranking ELO
  async handleButton(interaction) {
    // Botões internos (replay) são gerenciados pelo collector da execução principal
    // Este método garante compatibilidade com o roteador caso haja botões soltos
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
  },
};
