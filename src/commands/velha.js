const { logger } = require("../logger");
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  MessageFlags, } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

const EMPTY = "⬜";
const X_EMOJI = "❌";
const O_EMOJI = "⭕";

const WIN_CONDITIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // columns
  [0, 4, 8],
  [2, 4, 6], // diagonals
];

function checkWinner(board) {
  for (const [a, b, c] of WIN_CONDITIONS) {
    if (board[a] !== EMPTY && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isBoardFull(board) {
  return board.every((cell) => cell !== EMPTY);
}

function getBoardButtons(board, disabled = false) {
  const rows = [];
  for (let row = 0; row < 3; row++) {
    const actionRow = new ActionRowBuilder();
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;
      const cell = board[index];
      const button = new ButtonBuilder()
        .setCustomId(`velha_${index}`)
        .setStyle(
          cell === X_EMOJI
            ? ButtonStyle.Danger
            : cell === O_EMOJI
              ? ButtonStyle.Primary
              : ButtonStyle.Secondary
        )
        .setLabel(cell === EMPTY ? "\u200b" : cell)
        .setDisabled(disabled || cell !== EMPTY);
      actionRow.addComponents(button);
    }
    rows.push(actionRow);
  }
  return rows;
}

function getAIMove(board, aiSymbol, playerSymbol) {
  // Try to win
  for (let i = 0; i < 9; i++) {
    if (board[i] === EMPTY) {
      board[i] = aiSymbol;
      if (checkWinner(board) === aiSymbol) {
        board[i] = EMPTY;
        return i;
      }
      board[i] = EMPTY;
    }
  }

  // Block player from winning
  for (let i = 0; i < 9; i++) {
    if (board[i] === EMPTY) {
      board[i] = playerSymbol;
      if (checkWinner(board) === playerSymbol) {
        board[i] = EMPTY;
        return i;
      }
      board[i] = EMPTY;
    }
  }

  // Take center
  if (board[4] === EMPTY) return 4;

  // Take a corner
  const corners = [0, 2, 6, 8].filter((i) => board[i] === EMPTY);
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  // Take any available
  const available = board
    .map((cell, i) => (cell === EMPTY ? i : -1))
    .filter((i) => i !== -1);
  return available[Math.floor(Math.random() * available.length)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("velha")
    .setDescription("Jogue Jogo da Velha (Tic-Tac-Toe)!")
    .addUserOption((opt) =>
      opt
        .setName("oponente")
        .setDescription(
          "Usuário para jogar contra (deixe vazio para jogar contra o bot)"
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    const challenger = interaction.user;
    const opponent = interaction.options.getUser("oponente");

    // Play against bot
    if (!opponent || opponent.id === interaction.client.user.id) {
      return runBotGame(interaction, challenger);
    }

    // Can't play against yourself
    if (opponent.id === challenger.id) {
      return interaction.reply({
        embeds: [
          createEmbed({
            title: "❌ Oponente Inválido",
            description: "Você não pode jogar contra si mesmo!",
            color: 0xe74c3c,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Can't play against other bots
    if (opponent.bot) {
      return interaction.reply({
        embeds: [
          createEmbed({
            title: "❌ Oponente Inválido",
            description:
              "Você não pode jogar contra um bot! Deixe o campo vazio para jogar contra mim.",
            color: 0xe74c3c,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Challenge another player
    return runPvPGame(interaction, challenger, opponent);
  },

  // Handles stale velha buttons after bot restart (no active collector)
  async handleButton(interaction) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "❌ Esta sessão do Jogo da Velha expirou. Use `/velha` para iniciar um novo jogo.", flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    }
  },
};

async function runBotGame(interaction, player) {
  const board = Array(9).fill(EMPTY);
  const playerSymbol = X_EMOJI;
  const botSymbol = O_EMOJI;

  const getEmbed = (status = "playing", resultMsg = "") => {
    if (status === "won") {
      return createEmbed({
        title: "🏆 Você Venceu!",
        description: `${resultMsg}\n\n${player.username} (${playerSymbol}) derrotou o Bot (${botSymbol})!`,
        color: 0x2ecc71,
      });
    }
    if (status === "lost") {
      return createEmbed({
        title: "🤖 O Bot Venceu!",
        description: `${resultMsg}\n\nO Bot (${botSymbol}) derrotou ${player.username} (${playerSymbol})!`,
        color: 0xe74c3c,
      });
    }
    if (status === "draw") {
      return createEmbed({
        title: "🤝 Empate!",
        description: "Ninguém venceu! O tabuleiro está cheio.",
        color: 0xf1c40f,
      });
    }
    return createEmbed({
      title: `🎮 Jogo da Velha — vs Bot`,
      description: `${playerSymbol} ${player.username} (sua vez) vs ${botSymbol} Bot`,
      color: 0x3498db,
      footer: "Clique em uma posição para jogar!",
    });
  };

  await interaction.reply({
    embeds: [getEmbed()],
    components: getBoardButtons(board),
  });

  const msg = await interaction.fetchReply();

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === player.id && i.customId.startsWith("velha_"),
    time: 120000,
  });

  collector.on("collect", async (i) => {
    const index = parseInt(i.customId.split("_")[1], 10);

    if (board[index] !== EMPTY) {
      return i.reply({
        content: "Essa posição já está ocupada!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Player move
    board[index] = playerSymbol;

    // Check if player won
    if (checkWinner(board) === playerSymbol) {
      collector.stop("won");
      return i.update({
        embeds: [getEmbed("won", "Parabéns! 🎉")],
        components: getBoardButtons(board, true),
      });
    }

    // Check for draw
    if (isBoardFull(board)) {
      collector.stop("draw");
      return i.update({
        embeds: [getEmbed("draw")],
        components: getBoardButtons(board, true),
      });
    }

    // Bot move
    const botMove = getAIMove(board, botSymbol, playerSymbol);
    board[botMove] = botSymbol;

    // Check if bot won
    if (checkWinner(board) === botSymbol) {
      collector.stop("lost");
      return i.update({
        embeds: [getEmbed("lost", "O bot foi mais esperto desta vez!")],
        components: getBoardButtons(board, true),
      });
    }

    // Check for draw after bot move
    if (isBoardFull(board)) {
      collector.stop("draw");
      return i.update({
        embeds: [getEmbed("draw")],
        components: getBoardButtons(board, true),
      });
    }

    // Continue game
    await i.update({
      embeds: [getEmbed()],
      components: getBoardButtons(board),
    });
  });

  collector.on("end", async (_, reason) => {
    if (reason === "time") {
      await interaction
        .editReply({
          embeds: [
            createEmbed({
              title: "⏱️ Tempo Esgotado",
              description: "O jogo foi encerrado por inatividade.",
              color: 0x95a5a6,
            }),
          ],
          components: getBoardButtons(board, true),
        })
        .catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    }
  });
}

async function runPvPGame(interaction, challenger, opponent) {
  // Send challenge
  const challengeEmbed = createEmbed({
    title: "🎮 Desafio — Jogo da Velha!",
    description: `${challenger} desafiou ${opponent} para um Jogo da Velha!\n\n${opponent.username}, você Aceita?`,
    color: 0x3498db,
    footer: { text: "WDA - Todos os direitos reservados" },
    thumbnail: challenger.displayAvatarURL({ dynamic: true }),
  });

  const challengeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("velha_accept")
      .setLabel("Aceitar ✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("velha_decline")
      .setLabel("Recusar ❌")
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({
    content: `${opponent}`,
    embeds: [challengeEmbed],
    components: [challengeRow],
  });

  const msg = await interaction.fetchReply();

  const challengeCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) =>
      i.user.id === opponent.id &&
      (i.customId === "velha_accept" || i.customId === "velha_decline"),
    time: 60000,
    max: 1,
  });

  challengeCollector.on("collect", async (i) => {
    if (i.customId === "velha_decline") {
      return i.update({
        content: null,
        embeds: [
          createEmbed({
            title: "❌ Desafio Recusado",
            description: `${opponent.username} recusou o desafio.`,
            color: 0xe74c3c,
          }),
        ],
        components: [],
      });
    }

    // Challenge accepted - start game
    await startPvPMatch(i, interaction, challenger, opponent, msg);
  });

  challengeCollector.on("end", async (_, reason) => {
    if (reason === "time") {
      await interaction
        .editReply({
          content: null,
          embeds: [
            createEmbed({
              title: "⏱️ Tempo Esgotado",
              description: `${opponent.username} não respondeu ao desafio.`,
              color: 0x95a5a6,
            }),
          ],
          components: [],
        })
        .catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    }
  });
}

async function startPvPMatch(
  buttonInteraction,
  originalInteraction,
  player1,
  player2,
  msg
) {
  const board = Array(9).fill(EMPTY);
  const p1Symbol = X_EMOJI;
  const p2Symbol = O_EMOJI;
  let currentTurn = player1.id; // Player 1 starts

  const getEmbed = (status = "playing", resultMsg = "") => {
    const currentPlayer = currentTurn === player1.id ? player1 : player2;
    const currentSymbol = currentTurn === player1.id ? p1Symbol : p2Symbol;

    if (status === "won") {
      const winner = currentTurn === player1.id ? player1 : player2;
      return createEmbed({
        title: "🏆 Temos um Vencedor!",
        description: `${resultMsg}\n\n**${winner.username}** venceu o Jogo da Velha!`,
        color: 0x2ecc71,
        thumbnail: winner.displayAvatarURL({ dynamic: true }),
      });
    }
    if (status === "draw") {
      return createEmbed({
        title: "🤝 Empate!",
        description:
          "Ninguém venceu! O tabuleiro está cheio.\nQue tal uma revanche?",
        color: 0xf1c40f,
      });
    }
    return createEmbed({
      title: "🎮 Jogo da Velha",
      description: [
        `${p1Symbol} ${player1.username} vs ${p2Symbol} ${player2.username}`,
        "",
        `Vez de: ${currentSymbol} **${currentPlayer.username}**`,
      ].join("\n"),
      color: 0x3498db,
      footer: `${currentPlayer.username}, clique em uma posição!`,
    });
  };

  await buttonInteraction.update({
    content: null,
    embeds: [getEmbed()],
    components: getBoardButtons(board),
  });

  const gameCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) =>
      (i.user.id === player1.id || i.user.id === player2.id) &&
      i.customId.startsWith("velha_"),
    time: 120000,
  });

  gameCollector.on("collect", async (i) => {
    // Only current player can make a move
    if (i.user.id !== currentTurn) {
      return i.reply({
        content: "Não é sua vez!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const index = parseInt(i.customId.split("_")[1], 10);

    if (board[index] !== EMPTY) {
      return i.reply({
        content: "Essa posição já está ocupada!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const symbol = currentTurn === player1.id ? p1Symbol : p2Symbol;
    board[index] = symbol;

    // Check for winner
    if (checkWinner(board) === symbol) {
      gameCollector.stop("won");
      return i.update({
        embeds: [getEmbed("won", "Parabéns! 🎉")],
        components: getBoardButtons(board, true),
      });
    }

    // Check for draw
    if (isBoardFull(board)) {
      gameCollector.stop("draw");
      return i.update({
        embeds: [getEmbed("draw")],
        components: getBoardButtons(board, true),
      });
    }

    // Switch turns
    currentTurn = currentTurn === player1.id ? player2.id : player1.id;

    await i.update({
      embeds: [getEmbed()],
      components: getBoardButtons(board),
    });
  });

  gameCollector.on("end", async (_, reason) => {
    if (reason === "time") {
      await originalInteraction
        .editReply({
          embeds: [
            createEmbed({
              title: "⏱️ Tempo Esgotado",
              description: "O jogo foi encerrado por inatividade.",
              color: 0x95a5a6,
            }),
          ],
          components: getBoardButtons(board, true),
        })
        .catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    }
  });
}
