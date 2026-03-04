const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

// Constantes para Velha
const EMPTY = "⬜";
const X_EMOJI = "❌";
const O_EMOJI = "⭕";
const WIN_CONDITIONS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6], // diagonals
];

// Constantes para Roleta
const CHAMBERS = 6;
const QUICK_BETS = [100, 500, 1000];

// Animais para Bicho
const animals = [
  { id: 1, name: "Avestruz", emoji: "🐦" },
  { id: 2, name: "Águia", emoji: "🦅" },
  { id: 3, name: "Burro", emoji: "🐴" },
  { id: 4, name: "Borboleta", emoji: "🦋" },
  { id: 5, name: "Cachorro", emoji: "🐕" },
  { id: 6, name: "Cabra", emoji: "🐐" },
  { id: 7, name: "Carneiro", emoji: "🐑" },
  { id: 8, name: "Camelo", emoji: "🐫" },
  { id: 9, name: "Cobra", emoji: "🐍" },
  { id: 10, name: "Coelho", emoji: "🐇" },
  { id: 11, name: "Cavalo", emoji: "🐎" },
  { id: 12, name: "Elefante", emoji: "🐘" },
  { id: 13, name: "Galo", emoji: "🐓" },
  { id: 14, name: "Gato", emoji: "🐈" },
  { id: 15, name: "Jacaré", emoji: "🐊" },
  { id: 16, name: "Leão", emoji: "🦁" },
  { id: 17, name: "Macaco", emoji: "🐒" },
  { id: 18, name: "Porco", emoji: "🐖" },
  { id: 19, name: "Pavão", emoji: "🦚" },
  { id: 20, name: "Peru", emoji: "🦃" },
  { id: 21, name: "Touro", emoji: "🐂" },
  { id: 22, name: "Tigre", emoji: "🐅" },
  { id: 23, name: "Urso", emoji: "🐻" },
  { id: 24, name: "Veado", emoji: "🦌" },
  { id: 25, name: "Vaca", emoji: "🐄" }
];

// Funções utilitárias
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

function getGroup(number) {
  const lastTwo = number % 100;
  if (lastTwo === 0) return 25;
  return Math.ceil(lastTwo / 4);
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
            ? ButtonStyle.Success
            : ButtonStyle.Secondary
        )
        .setLabel(cell)
        .setDisabled(disabled || cell !== EMPTY);
      actionRow.addComponents(button);
    }
    rows.push(actionRow);
  }
  return rows;
}

// Storage para jogos
const velhaGames = new Map();
const roletaGames = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fun")
    .setDescription("Comandos de diversão")
    .addSubcommand((sub) =>
      sub
        .setName("8ball")
        .setDescription("Faça uma pergunta para a bola mágica")
        .addStringOption((opt) => opt.setName("pergunta").setDescription("Sua pergunta").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("avatar")
        .setDescription("Mostra o avatar de um usuário")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário (opcional)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("say")
        .setDescription("Faz o bot falar algo")
        .addStringOption((opt) => opt.setName("texto").setDescription("O que o bot deve dizer").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("coinflip")
        .setDescription("Joga uma moeda (Cara ou Coroa)")
    )
    .addSubcommand((sub) =>
      sub
        .setName("velha")
        .setDescription("Jogue Jogo da Velha contra um amigo")
        .addUserOption((opt) => opt.setName("oponente").setDescription("Seu oponente").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("roleta")
        .setDescription("Jogue Roleta Russa e aposte suas moedas!")
        .addIntegerOption((opt) =>
          opt
            .setName("aposta")
            .setDescription("Valor da aposta para iniciar direto")
            .setMinValue(1)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("bicho")
        .setDescription("Aposte no Jogo do Bicho!")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // 8BALL
    if (sub === "8ball") {
      const question = interaction.options.getString("pergunta");
      const answers = [
        "Sim!", "Infelizmente não", "Você está absolutamente certo!", "Não, desculpe.",
        "Eu concordo", "Sem ideia!", "Eu não sou tão inteligente...", "Minhas fontes dizem não!",
        "É certo", "Você pode confiar nisso", "Provavelmente não", "Tudo aponta para um não",
        "Sem dúvida", "Absolutamente", "Eu não sei"
      ];
      
      const result = answers[Math.floor(Math.random() * answers.length)];

      await interaction.reply({ 
        embeds: [createEmbed({
          title: "🎱 Bola 8 Mágica",
          fields: [
            { name: "💬 Sua Pergunta", value: `\`\`\`${question}\`\`\`` },
            { name: "🤖 Resposta do Bot", value: `\`\`\`${result}\`\`\`` }
          ],
          color: 0x000000
        })] 
      });
    }

    // AVATAR
    if (sub === "avatar") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      
      await interaction.reply({ 
        embeds: [createEmbed({
          title: `🖼 Avatar de ${user.username}`,
          image: user.displayAvatarURL({ dynamic: true, size: 1024 }),
          color: 0x3498db
        })] 
      });
    }

    // SAY
    if (sub === "say") {
      const text = interaction.options.getString("texto");
      
      if (text.length > 2000) {
        return interaction.reply({ content: "O texto é muito longo (máx 2000 caracteres).", ephemeral: true });
      }

      const blacklistedWords = ["@everyone", "@here", "<@&", "<@!"];
      const containsBlacklist = blacklistedWords.some(word => text.includes(word));
      
      if (containsBlacklist) {
        return interaction.reply({ 
          embeds: [createEmbed({
            title: "❌ Conteúdo Bloqueado",
            description: "O texto contém menções massivas ou conteúdo não permitido.",
            color: 0xe74c3c
          })],
          ephemeral: true
        });
      }

      const cleanText = text.replace(/`{3,}/g, '').replace(/\*\*(.*?)\*\*/g, '$1');

      await interaction.channel.send({ content: cleanText });
      await interaction.reply({ content: "Mensagem enviada com sucesso!", ephemeral: true });
    }

    // COINFLIP
    if (sub === "coinflip") {
      const result = Math.random() < 0.5 ? "Cara" : "Coroa";
      
      await interaction.reply({ 
        embeds: [createEmbed({
          title: "🪙 Cara ou Coroa",
          description: `A moeda caiu em: **${result}**!`,
          color: 0xF1C40F
        })] 
      });
    }

    // VELHA
    if (sub === "velha") {
      const opponent = interaction.options.getUser("oponente");
      
      if (opponent.id === interaction.user.id) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Você não pode jogar contra si mesmo!")],
          ephemeral: true 
        });
      }

      if (opponent.bot) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Você não pode jogar contra um bot!")],
          ephemeral: true 
        });
      }

      const gameId = `${interaction.user.id}_${opponent.id}`;
      
      if (velhaGames.has(gameId)) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Você já tem um jogo em andamento com este usuário!")],
          ephemeral: true 
        });
      }

      const board = Array(9).fill(EMPTY);
      velhaGames.set(gameId, {
        board,
        players: [interaction.user.id, opponent.id],
        currentPlayer: 0,
        message: null,
        guildId: interaction.guildId
      });

      const embed = createEmbed({
        title: "🎮 Jogo da Velha",
        description: `**${interaction.user.username}** ❌ vs **${opponent.username}** ⭕\n\nÉ a vez de **${interaction.user.username}**!`,
        color: 0x3498db
      });

      const rows = getBoardButtons(board);
      
      const message = await interaction.reply({ 
        embeds: [embed], 
        components: rows,
        fetchReply: true 
      });

      velhaGames.get(gameId).message = message;
    }

    // ROLETA
    if (sub === "roleta") {
      const { economy: eco } = interaction.client.services;
      if (!eco) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Serviço de economia não disponível!")],
          ephemeral: true 
        });
      }

      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const directBet = interaction.options.getInteger("aposta");

      if (directBet) {
        return runRoletaGame(interaction, directBet, eco, guildId, userId);
      }

      const mainEmbed = createEmbed({
        title: "🔫 Roleta Russa",
        description: "Teste sua coragem! O revólver tem **6 câmaras** e **1 bala**.\nA cada rodada você puxa o gatilho. Quanto mais sobreviver, maior o prêmio!",
        color: 0xe74c3c,
        fields: [
          {
            name: "💸 Premiação",
            value: "1ª rodada: **1.2x**\n2ª rodada: **1.5x**\n3ª rodada: **2x**\n4ª rodada: **3x**\n5ª rodada: **5x**\nSobreviveu tudo: **6x**",
            inline: true,
          },
          {
            name: "🎮 Como jogar",
            value: "Escolha um valor e puxe o gatilho!\nVocê pode parar a qualquer momento e levar o prêmio acumulado.",
            inline: true,
          },
        ],
      });

      const row = new ActionRowBuilder();
      QUICK_BETS.forEach((bet) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`roleta_bet_${bet}`)
            .setLabel(`${bet} moedas`)
            .setStyle(ButtonStyle.Primary)
        );
      });

      await interaction.reply({ embeds: [mainEmbed], components: [row] });
    }

    // BICHO
    if (sub === "bicho") {
      const { economy: eco } = interaction.client.services;
      if (!eco) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Serviço de economia não disponível!")],
          ephemeral: true 
        });
      }

      const mainEmbed = createEmbed({
        title: "🎰 Banca do Jogo do Bicho",
        description: "Aposte nos animais e ganhe prêmios incríveis!\n\n**Como funciona:**\n• Escolha um animal ou grupo\n• Aguarde o sorteio\n• Ganhe se seu animal for sorteado!",
        color: 0x00ff00,
        fields: [
          {
            name: "🏆 Premiações",
            value: "• **Animal correto:** 18x\n• **Grupo correto:** 3x\n• **Milhar correta:** 100x",
            inline: true,
          },
          {
            name: "📊 Grupos",
            value: "Cada animal pertence a um grupo (1-25)\nAposte no animal ou no grupo inteiro!",
            inline: true,
          }
        ]
      });

      // Criar menu de seleção de animais
      const animalSelect = new StringSelectMenuBuilder()
        .setCustomId('bicho_animal_select')
        .setPlaceholder('Escolha um animal para apostar')
        .addOptions(
          animals.slice(0, 25).map(animal => ({
            label: `${animal.emoji} ${animal.name}`,
            description: `Grupo ${getGroup(animal.id * 4)}`,
            value: animal.id.toString()
          }))
        );

      const row = new ActionRowBuilder().addComponents(animalSelect);

      await interaction.reply({ embeds: [mainEmbed], components: [row] });
    }
  },

  // Handlers para interações de componentes
  async handleButton(interaction) {
    const customId = interaction.customId;

    // Handler para Velha
    if (customId.startsWith('velha_')) {
      const index = parseInt(customId.split('_')[1]);
      const userId = interaction.user.id;
      
      // Encontrar o jogo do usuário
      let game = null;
      let gameId = null;
      
      for (const [key, value] of velhaGames.entries()) {
        if (value.players.includes(userId)) {
          game = value;
          gameId = key;
          break;
        }
      }

      if (!game || game.players[game.currentPlayer] !== userId) {
        return interaction.reply({ content: "Não é sua vez!", ephemeral: true });
      }

      if (game.board[index] !== EMPTY) {
        return interaction.reply({ content: "Esta posição já está ocupada!", ephemeral: true });
      }

      // Fazer jogada
      game.board[index] = game.currentPlayer === 0 ? X_EMOJI : O_EMOJI;
      
      // Verificar vencedor
      const winner = checkWinner(game.board);
      const isFull = isBoardFull(game.board);

      if (winner || isFull) {
        const embed = createEmbed({
          title: "🎮 Jogo da Velha - Fim!",
          description: winner 
            ? `**${winner === X_EMOJI ? interaction.client.users.cache.get(game.players[0])?.username : interaction.client.users.cache.get(game.players[1])?.username}** venceu! 🎉`
            : "Empate! 🤝",
          color: winner ? 0x00ff00 : 0xffaa00
        });

        await interaction.update({ embeds: [embed], components: getBoardButtons(game.board, true) });
        velhaGames.delete(gameId);
      } else {
        // Próximo jogador
        game.currentPlayer = 1 - game.currentPlayer;
        const nextPlayer = interaction.client.users.cache.get(game.players[game.currentPlayer]);
        
        const embed = createEmbed({
          title: "🎮 Jogo da Velha",
          description: `**${interaction.client.users.cache.get(game.players[0])?.username}** ❌ vs **${interaction.client.users.cache.get(game.players[1])?.username}** ⭕\n\nÉ a vez de **${nextPlayer?.username}**!`,
          color: 0x3498db
        });

        await interaction.update({ embeds: [embed], components: getBoardButtons(game.board) });
      }
    }

    // Handler para Roleta
    if (customId.startsWith('roleta_bet_')) {
      const bet = parseInt(customId.split('_')[2]);
      const { economy: eco } = interaction.client.services;
      
      await runRoletaGame(interaction, bet, eco, interaction.guildId, interaction.user.id);
    }
  },

  async handleSelectMenu(interaction) {
    const customId = interaction.customId;

    // Handler para Bicho
    if (customId === 'bicho_animal_select') {
      const animalId = parseInt(interaction.values[0]);
      const animal = animals.find(a => a.id === animalId);
      
      if (!animal) {
        return interaction.reply({ embeds: [createErrorEmbed("Animal inválido!")], ephemeral: true });
      }

      // Criar modal para valor da aposta
      const modal = new ModalBuilder()
        .setCustomId(`bicho_bet_${animalId}`)
        .setTitle(`Apostar em ${animal.name}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('valor')
              .setLabel('Valor da aposta')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Digite o valor em moedas')
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
    }
  },

  async handleModal(interaction) {
    const customId = interaction.customId;

    // Handler para Bicho
    if (customId.startsWith('bicho_bet_')) {
      const animalId = parseInt(customId.split('_')[2]);
      const valor = parseInt(interaction.fields.getTextInputValue('valor'));
      const { economy: eco } = interaction.client.services;
      
      if (!eco || !valor || valor <= 0) {
        return interaction.reply({ embeds: [createErrorEmbed("Valor inválido!")], ephemeral: true });
      }

      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      
      try {
        const balance = await eco.getBalance(guildId, userId);
        if (balance.coins < valor) {
          return interaction.reply({ embeds: [createErrorEmbed("Você não tem moedas suficientes!")], ephemeral: true });
        }

        await eco.removeCoins(guildId, userId, valor);
        
        // Simular sorteio (em um sistema real, seria agendado)
        const sorteio = Math.floor(Math.random() * 10000);
        const animalSorteado = animals[Math.floor(Math.random() * animals.length)];
        const grupoSorteado = getGroup(sorteio);
        const grupoAnimal = getGroup(animalId * 4);
        
        let ganhou = false;
        let multiplicador = 0;
        
        if (animalSorteado.id === animalId) {
          ganhou = true;
          multiplicador = 18;
        } else if (grupoSorteado === grupoAnimal) {
          ganhou = true;
          multiplicador = 3;
        }

        if (ganhou) {
          const premio = Math.floor(valor * multiplicador);
          await eco.addCoins(guildId, userId, premio);
          
          const embed = createSuccessEmbed(
            `🎉 Você ganhou **${premio} moedas**!\n\n` +
            `🎯 Sorteio: ${animalSorteado.emoji} ${animalSorteado.name}\n` +
            `💰 Multiplicador: ${multiplicador}x`
          );
          
          await interaction.reply({ embeds: [embed] });
        } else {
          const embed = createErrorEmbed(
            `😢 Você perdeu!\n\n` +
            `🎯 Sorteio: ${animalSorteado.emoji} ${animalSorteado.name}\n` +
            `💸 Perda: ${valor} moedas`
          );
          
          await interaction.reply({ embeds: [embed] });
        }
      } catch (error) {
        console.error("Erro no jogo do bicho:", error);
        await interaction.reply({ embeds: [createErrorEmbed("Ocorreu um erro ao processar sua aposta!")], ephemeral: true });
      }
    }
  }
};

// Função auxiliar para Roleta
async function runRoletaGame(interaction, bet, eco, guildId, userId) {
  try {
    const balance = await eco.getBalance(guildId, userId);
    if (balance.coins < bet) {
      return interaction.reply({ 
        embeds: [createErrorEmbed("Você não tem moedas suficientes!")],
        ephemeral: true 
      });
    }

    await eco.removeCoins(guildId, userId, bet);

    const bulletChamber = Math.floor(Math.random() * CHAMBERS);
    let currentChamber = 0;
    let survived = true;
    let multiplier = 1;

    const gameData = {
      bet,
      originalBet: bet,
      bulletChamber,
      survived,
      multiplier,
      guildId,
      userId
    };

    roletaGames.set(userId, gameData);

    const embed = createEmbed({
      title: "🔫 Roleta Russa",
      description: `**${interaction.user.username}** está na mira!\n\nAposta: **${bet} moedas**\nCâmara atual: **${currentChamber + 1}**`,
      color: 0xe74c3c
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`roleta_pull_${userId}`)
        .setLabel("🔫 Puxar Gatilho")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`roleta_stop_${userId}`)
        .setLabel("💰 Parar e Levar")
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error("Erro na roleta:", error);
    await interaction.reply({ 
      embeds: [createErrorEmbed("Ocorreu um erro ao iniciar o jogo!")],
      ephemeral: true 
    });
  }
}
