const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

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

function getGroup(number) {
  const lastTwo = number % 100;
  if (lastTwo === 0) return 25;
  return Math.ceil(lastTwo / 4);
}

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
        .setDescription("Faz o bot falar uma mensagem ou enviar uma Embed via JSON (Admin)")
        .addStringOption((opt) => 
            opt.setName("texto")
            .setDescription("O que o bot deve dizer (deixe vazio se for usar apenas JSON)")
            .setRequired(false)
        )
        .addAttachmentOption((opt) => 
            opt.setName("json")
            .setDescription("Arquivo .json com a estrutura da Embed (Opcional)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("coinflip")
        .setDescription("Joga uma moeda (Cara ou Coroa)")
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

    // SAY COM SUPORTE A JSON E TRAVA DE ADMIN
    if (sub === "say") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return interaction.reply({ 
              embeds: [createErrorEmbed("Você não tem permissão para fazer o bot falar.")], 
              ephemeral: true 
          });
      }

      const text = interaction.options.getString("texto");
      const jsonFile = interaction.options.getAttachment("json");

      if (!text && !jsonFile) {
          return interaction.reply({ 
              embeds: [createErrorEmbed("Você precisa fornecer um texto ou um arquivo JSON.")], 
              ephemeral: true 
          });
      }

      try {
          await interaction.deferReply({ ephemeral: true });

          let optionsToSend = {};

          // Processamento do Texto Normal
          if (text) {
              if (text.length > 2000) {
                  return interaction.editReply({ embeds: [createErrorEmbed("O texto é muito longo (máx 2000 caracteres).")] });
              }

              const blacklistedWords = ["@everyone", "@here"];
              if (blacklistedWords.some(word => text.includes(word))) {
                  return interaction.editReply({ embeds: [createErrorEmbed("O texto contém menções massivas não permitidas.")] });
              }

              optionsToSend.content = text.replace(/`{3,}/g, '').replace(/\*\*(.*?)\*\*/g, '$1');
          }

          // Processamento do JSON (Embed)
          if (jsonFile) {
              if (!jsonFile.name.endsWith('.json')) {
                  return interaction.editReply({ embeds: [createErrorEmbed("O arquivo precisa ter a extensão `.json`.")] });
              }

              const response = await fetch(jsonFile.url);
              const jsonData = await response.json();

              // Suporta tanto o formato do Discohook (objeto com .embeds) quanto arrays diretos
              if (Array.isArray(jsonData)) {
                  optionsToSend.embeds = jsonData;
              } else if (jsonData.embeds) {
                  optionsToSend = { ...optionsToSend, ...jsonData };
              } else {
                  optionsToSend.embeds = [jsonData];
              }
          }

          await interaction.channel.send(optionsToSend);
          await interaction.editReply({ embeds: [createSuccessEmbed("Mensagem enviada com sucesso!")] });

      } catch (error) {
          console.error("Erro no comando say:", error);
          await interaction.editReply({ 
              embeds: [createErrorEmbed(`Erro ao processar a mensagem ou ler o JSON. Verifique a estrutura do arquivo. Erro: \`${error.message}\``)] 
          });
      }
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

    // Handler para Roleta
    if (customId.startsWith('roleta_bet_')) {
      const bet = parseInt(customId.split('_')[2]);
      const { economy: eco } = interaction.client.services;

      await runRoletaGame(interaction, bet, eco, interaction.guildId, interaction.user.id);
    }
  },

  async handleSelectMenu(interaction) {
    const customId = interaction.customId;

    if (customId === 'bicho_animal_select') {
      const animalId = parseInt(interaction.values[0]);
      const animal = animals.find(a => a.id === animalId);

      if (!animal) {
        return interaction.reply({ embeds: [createErrorEmbed("Animal inválido!")], ephemeral: true });
      }

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