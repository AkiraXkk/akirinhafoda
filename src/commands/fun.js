const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { logger } = require("../logger");

// State management for interactive commands
const activeBattles = new Map();
const triviaAnswers = new Map();

// Helper: decode HTML entities from trivia API
function decodeHtml(text) {
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#039;': "'", '&apos;': "'", '&laquo;': '«', '&raquo;': '»',
    '&ndash;': '–', '&mdash;': '—', '&hellip;': '…',
    '&eacute;': 'é', '&Eacute;': 'É', '&ntilde;': 'ñ',
    '&oacute;': 'ó', '&uuml;': 'ü', '&iacute;': 'í'
  };
  return text.replace(/&[#\w]+;/g, match => entities[match] || match);
}

// Helper: shuffle array (Fisher-Yates)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Helper: generate unique ID
function uniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Helper: HP bar for battle
function hpBar(current, max) {
  const pct = Math.max(0, current) / max;
  const filled = Math.round(pct * 10);
  return '🟩'.repeat(filled) + '⬛'.repeat(10 - filled) + ` ${Math.max(0, current)}/${max}`;
}

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
        .setName("pokemon")
        .setDescription("Busca informações de um Pokémon")
        .addStringOption((opt) =>
          opt.setName("nome").setDescription("Nome ou número do Pokémon").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("rps")
        .setDescription("Jogue Pedra, Papel ou Tesoura contra o bot!")
    )
    .addSubcommand((sub) =>
      sub
        .setName("ship")
        .setDescription("Descubra a compatibilidade entre dois usuários")
        .addUserOption((opt) =>
          opt.setName("usuario1").setDescription("Primeiro usuário").setRequired(true)
        )
        .addUserOption((opt) =>
          opt.setName("usuario2").setDescription("Segundo usuário").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("dado")
        .setDescription("Rola um dado com lados configuráveis")
        .addIntegerOption((opt) =>
          opt.setName("lados").setDescription("Número de lados do dado (padrão: 6)").setRequired(false).setMinValue(2).setMaxValue(1000)
        )
        .addIntegerOption((opt) =>
          opt.setName("quantidade").setDescription("Quantidade de dados (padrão: 1)").setRequired(false).setMinValue(1).setMaxValue(10)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("trivia")
        .setDescription("Responda perguntas de trivia com botões!")
        .addStringOption((opt) =>
          opt.setName("dificuldade")
            .setDescription("Dificuldade da pergunta")
            .setRequired(false)
            .addChoices(
              { name: "Fácil", value: "easy" },
              { name: "Médio", value: "medium" },
              { name: "Difícil", value: "hard" }
            )
        )
        .addStringOption((opt) =>
          opt.setName("categoria")
            .setDescription("Categoria da pergunta")
            .setRequired(false)
            .addChoices(
              { name: "🧠 Conhecimento Geral", value: "9" },
              { name: "🔬 Ciência", value: "17" },
              { name: "💻 Computação", value: "18" },
              { name: "⚽ Esportes", value: "21" },
              { name: "🌍 Geografia", value: "22" },
              { name: "📜 História", value: "23" },
              { name: "🎨 Arte", value: "25" },
              { name: "🐾 Animais", value: "27" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("batalha")
        .setDescription("Batalha RPG contra o bot com ataques, defesa e especial!")
    )
    .addSubcommand((sub) =>
      sub
        .setName("horoscopo")
        .setDescription("Veja seu horóscopo e personalidade do signo")
        .addStringOption((opt) =>
          opt.setName("signo")
            .setDescription("Seu signo do zodíaco")
            .setRequired(true)
            .addChoices(
              { name: "♈ Áries", value: "aries" },
              { name: "♉ Touro", value: "touro" },
              { name: "♊ Gêmeos", value: "gemeos" },
              { name: "♋ Câncer", value: "cancer" },
              { name: "♌ Leão", value: "leao" },
              { name: "♍ Virgem", value: "virgem" },
              { name: "♎ Libra", value: "libra" },
              { name: "♏ Escorpião", value: "escorpiao" },
              { name: "♐ Sagitário", value: "sagitario" },
              { name: "♑ Capricórnio", value: "capricornio" },
              { name: "♒ Aquário", value: "aquario" },
              { name: "♓ Peixes", value: "peixes" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("slot")
        .setDescription("Jogue na máquina caça-níquel!")
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

    // POKEMON
    if (sub === "pokemon") {
      const input = interaction.options.getString("nome").toLowerCase().trim();
      await interaction.deferReply();

      try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(input)}`);
        if (!res.ok) {
          return interaction.editReply({
            embeds: [createErrorEmbed(`Pokémon **${input}** não encontrado. Verifique o nome ou número.`)]
          });
        }

        const data = await res.json();

        const speciesRes = await fetch(data.species.url);
        const speciesData = speciesRes.ok ? await speciesRes.json() : null;

        const displayName = speciesData
          ? (speciesData.names.find(n => n.language.name === "ja") || speciesData.names.find(n => n.language.name === "en") || { name: data.name })
          : { name: data.name };

        const flavorEntry = speciesData
          ? speciesData.flavor_text_entries.find(f => f.language.name === "en")
          : null;
        const description = flavorEntry
          ? flavorEntry.flavor_text.replace(/[\n\f\r]/g, " ")
          : "Sem descrição disponível.";

        const typeNames = {
          normal: "Normal", fire: "Fogo", water: "Água", electric: "Elétrico",
          grass: "Planta", ice: "Gelo", fighting: "Lutador", poison: "Veneno",
          ground: "Terrestre", flying: "Voador", psychic: "Psíquico", bug: "Inseto",
          rock: "Pedra", ghost: "Fantasma", dragon: "Dragão", dark: "Sombrio",
          steel: "Aço", fairy: "Fada"
        };

        const typeColors = {
          normal: 0xA8A878, fire: 0xF08030, water: 0x6890F0, electric: 0xF8D030,
          grass: 0x78C850, ice: 0x98D8D8, fighting: 0xC03028, poison: 0xA040A0,
          ground: 0xE0C068, flying: 0xA890F0, psychic: 0xF85888, bug: 0xA8B820,
          rock: 0xB8A038, ghost: 0x705898, dragon: 0x7038F8, dark: 0x705848,
          steel: 0xB8B8D0, fairy: 0xEE99AC
        };

        const statNames = {
          hp: "HP", attack: "Ataque", defense: "Defesa",
          "special-attack": "Atq. Esp.", "special-defense": "Def. Esp.", speed: "Velocidade"
        };

        const types = data.types.map(t => typeNames[t.type.name] || t.type.name).join(", ");
        const mainType = data.types[0].type.name;
        const color = typeColors[mainType] || 0xFFFFFF;

        const MAX_STAT_BAR_LENGTH = 26;
        const statsText = data.stats.map(s => {
          const name = statNames[s.stat.name] || s.stat.name;
          const val = s.base_stat;
          const filled = Math.round(val / 10);
          const bar = "█".repeat(filled) + "░".repeat(Math.max(0, MAX_STAT_BAR_LENGTH - filled));
          return `**${name}**: ${val} \`${bar}\``;
        }).join("\n");

        const abilities = data.abilities.map(a => {
          const name = a.ability.name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          return a.is_hidden ? `${name} *(oculta)*` : name;
        }).join(", ");

        const sprite = data.sprites.other["official-artwork"].front_default
          || data.sprites.front_default
          || null;

        const embed = createEmbed({
          title: `#${data.id} — ${data.name.charAt(0).toUpperCase() + data.name.slice(1)} (${displayName.name})`,
          description: `*${description}*`,
          color,
          thumbnail: sprite,
          fields: [
            { name: "📋 Tipo(s)", value: types, inline: true },
            { name: "⚖️ Peso", value: `${(data.weight / 10).toFixed(1)} kg`, inline: true },
            { name: "📏 Altura", value: `${(data.height / 10).toFixed(1)} m`, inline: true },
            { name: "✨ Habilidades", value: abilities, inline: false },
            { name: "📊 Stats Base", value: statsText, inline: false }
          ]
        });

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error("Erro no comando pokemon:", error);
        await interaction.editReply({
          embeds: [createErrorEmbed("Ocorreu um erro ao buscar informações do Pokémon. Tente novamente.")]
        });
      }
    }

    // RPS (Pedra, Papel, Tesoura)
    if (sub === "rps") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_rps_pedra_${interaction.user.id}`).setLabel("🪨 Pedra").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fun_rps_papel_${interaction.user.id}`).setLabel("📄 Papel").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`fun_rps_tesoura_${interaction.user.id}`).setLabel("✂️ Tesoura").setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        embeds: [createEmbed({
          title: "✊ Pedra, Papel ou Tesoura!",
          description: "Escolha sua jogada clicando em um dos botões abaixo!",
          color: 0x9B59B6
        })],
        components: [row]
      });
    }

    // SHIP
    if (sub === "ship") {
      const user1 = interaction.options.getUser("usuario1");
      const user2 = interaction.options.getUser("usuario2");

      // Deterministic hash (djb2) of sorted user IDs ensures the same pair always gets the same result
      const ids = [user1.id, user2.id].sort();
      const seed = ids.join("");
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
      }
      const percentage = Math.abs(hash) % 101;

      const filled = Math.round(percentage / 10);
      const bar = "❤️".repeat(filled) + "🖤".repeat(10 - filled);

      let reaction;
      if (percentage >= 90) reaction = "💖 Almas Gêmeas! Amor verdadeiro!";
      else if (percentage >= 70) reaction = "💕 Muito compatíveis! Há algo especial aqui!";
      else if (percentage >= 50) reaction = "💛 Uma boa chance! Vale a pena investir!";
      else if (percentage >= 30) reaction = "💔 Talvez com esforço... Nem tudo está perdido.";
      else reaction = "💀 Melhor só como amigos...";

      const shipName = user1.username.slice(0, Math.ceil(user1.username.length / 2))
        + user2.username.slice(Math.floor(user2.username.length / 2));

      await interaction.reply({
        embeds: [createEmbed({
          title: `💘 Ship: ${shipName}`,
          description: `**${user1.username}** x **${user2.username}**\n\n${bar}\n**${percentage}%** de compatibilidade\n\n${reaction}`,
          color: percentage >= 50 ? 0xFF69B4 : 0x808080,
          thumbnail: user1.displayAvatarURL({ dynamic: true, size: 256 })
        })]
      });
    }

    // DADO
    if (sub === "dado") {
      const sides = interaction.options.getInteger("lados") || 6;
      const quantity = interaction.options.getInteger("quantidade") || 1;

      const results = [];
      for (let i = 0; i < quantity; i++) {
        results.push(Math.floor(Math.random() * sides) + 1);
      }

      const total = results.reduce((a, b) => a + b, 0);
      const resultsText = results.map((r, i) => `🎲 Dado ${i + 1}: **${r}**`).join("\n");

      await interaction.reply({
        embeds: [createEmbed({
          title: `🎲 Rolagem de Dado${quantity > 1 ? "s" : ""}`,
          description: `${resultsText}${quantity > 1 ? `\n\n📊 **Total:** ${total}` : ""}`,
          fields: [
            { name: "⚙️ Configuração", value: `${quantity}d${sides}`, inline: true }
          ],
          color: 0xE67E22
        })]
      });
    }

    // TRIVIA
    if (sub === "trivia") {
      const difficulty = interaction.options.getString("dificuldade") || "";
      const category = interaction.options.getString("categoria") || "";

      await interaction.deferReply();

      try {
        let url = "https://opentdb.com/api.php?amount=1&type=multiple";
        if (difficulty) url += `&difficulty=${difficulty}`;
        if (category) url += `&category=${category}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.response_code !== 0 || !data.results.length) {
          return interaction.editReply({
            embeds: [createErrorEmbed("Não foi possível buscar uma pergunta. Tente novamente.")]
          });
        }

        const q = data.results[0];
        const question = decodeHtml(q.question);
        const correct = decodeHtml(q.correct_answer);
        const answers = shuffle([correct, ...q.incorrect_answers.map(decodeHtml)]);
        const correctIndex = answers.indexOf(correct);

        const id = uniqueId();
        triviaAnswers.set(id, {
          correctIndex,
          userId: interaction.user.id,
          question,
          answers,
          timeout: setTimeout(() => triviaAnswers.delete(id), 60000)
        });

        const difficultyEmoji = { easy: "🟢 Fácil", medium: "🟡 Médio", hard: "🔴 Difícil" };
        const labels = ["A", "B", "C", "D"];

        const row = new ActionRowBuilder().addComponents(
          answers.map((_, i) =>
            new ButtonBuilder()
              .setCustomId(`fun_trivia_${i}_${id}`)
              .setLabel(labels[i])
              .setStyle(ButtonStyle.Primary)
          )
        );

        const answersText = answers.map((a, i) => `**${labels[i]}.** ${a}`).join("\n");

        await interaction.editReply({
          embeds: [createEmbed({
            title: "🧠 Trivia!",
            description: `**${question}**\n\n${answersText}`,
            fields: [
              { name: "📂 Categoria", value: decodeHtml(q.category), inline: true },
              { name: "📊 Dificuldade", value: difficultyEmoji[q.difficulty] || q.difficulty, inline: true }
            ],
            color: 0x3498DB,
            footer: "Tempo: 60 segundos • Responda clicando nos botões"
          })],
          components: [row]
        });
      } catch (error) {
        logger.error({ err: error }, "Erro no comando trivia");
        await interaction.editReply({
          embeds: [createErrorEmbed("Erro ao buscar pergunta de trivia. Tente novamente.")]
        });
      }
    }

    // BATALHA
    if (sub === "batalha") {
      const battleId = uniqueId();
      const state = {
        userId: interaction.user.id,
        playerHp: 100,
        botHp: 100,
        playerLastDefended: false,
        botLastDefended: false,
        playerSpecials: 2,
        botSpecials: 2,
        turn: 1,
        timeout: setTimeout(() => activeBattles.delete(battleId), 180000)
      };

      activeBattles.set(battleId, state);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fun_batalha_atacar_${battleId}`).setLabel("⚔️ Atacar").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`fun_batalha_defender_${battleId}`).setLabel("🛡️ Defender").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fun_batalha_especial_${battleId}`).setLabel(`✨ Especial (${state.playerSpecials})`).setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [createEmbed({
          title: "⚔️ Batalha contra o Bot!",
          description: `**Turno ${state.turn}** — Escolha sua ação!\n\n` +
            `**❤️ Você:** ${hpBar(state.playerHp, 100)}\n` +
            `**🤖 Bot:** ${hpBar(state.botHp, 100)}\n\n` +
            `⚔️ **Atacar** — Causa 15-25 de dano\n` +
            `🛡️ **Defender** — Reduz dano recebido pela metade\n` +
            `✨ **Especial** — Causa 25-40 de dano, ignora defesa (${state.playerSpecials} usos)`,
          color: 0xE74C3C
        })],
        components: [row]
      });
    }

    // HOROSCOPO
    if (sub === "horoscopo") {
      const sign = interaction.options.getString("signo");

      const zodiac = {
        aries: {
          emoji: "♈", name: "Áries", element: "🔥 Fogo", period: "21/03 - 19/04",
          planet: "♂️ Marte",
          traits: ["Corajoso", "Determinado", "Confiante", "Entusiástico", "Otimista", "Honesto"],
          weaknesses: ["Impaciente", "Temperamental", "Agressivo", "Impulsivo"],
          compatibility: "Leão, Sagitário, Gêmeos",
          luckyNumbers: "1, 8, 17", luckyColor: "🔴 Vermelho",
          description: "Áries é o primeiro signo do zodíaco. Como líder natural, são corajosos e aventureiros, sempre prontos para enfrentar novos desafios com energia e determinação."
        },
        touro: {
          emoji: "♉", name: "Touro", element: "🌍 Terra", period: "20/04 - 20/05",
          planet: "♀️ Vênus",
          traits: ["Confiável", "Paciente", "Prático", "Dedicado", "Responsável", "Estável"],
          weaknesses: ["Teimoso", "Possessivo", "Inflexível", "Materialista"],
          compatibility: "Virgem, Capricórnio, Câncer",
          luckyNumbers: "2, 6, 9", luckyColor: "🟢 Verde",
          description: "Touro é o signo mais confiável do zodíaco. Valorizam estabilidade, conforto e os prazeres da vida. São trabalhadores dedicados com um olho para a beleza."
        },
        gemeos: {
          emoji: "♊", name: "Gêmeos", element: "💨 Ar", period: "21/05 - 20/06",
          planet: "☿ Mercúrio",
          traits: ["Adaptável", "Comunicativo", "Curioso", "Versátil", "Inteligente", "Sociável"],
          weaknesses: ["Nervoso", "Indeciso", "Inconsistente", "Superficial"],
          compatibility: "Libra, Aquário, Áries",
          luckyNumbers: "5, 7, 14", luckyColor: "🟡 Amarelo",
          description: "Gêmeos são as borboletas sociais do zodíaco. Com uma mente rápida e curiosidade insaciável, adoram aprender e compartilhar conhecimento."
        },
        cancer: {
          emoji: "♋", name: "Câncer", element: "💧 Água", period: "21/06 - 22/07",
          planet: "🌙 Lua",
          traits: ["Leal", "Emocional", "Protetor", "Intuitivo", "Carinhoso", "Imaginativo"],
          weaknesses: ["Mal-humorado", "Pessimista", "Desconfiado", "Manipulador"],
          compatibility: "Escorpião, Peixes, Touro",
          luckyNumbers: "2, 3, 15", luckyColor: "⚪ Branco",
          description: "Câncer é o guardião do zodíaco. Profundamente conectados com família e lar, são extremamente leais e protetores com quem amam."
        },
        leao: {
          emoji: "♌", name: "Leão", element: "🔥 Fogo", period: "23/07 - 22/08",
          planet: "☀️ Sol",
          traits: ["Criativo", "Generoso", "Caloroso", "Alegre", "Líder", "Dramático"],
          weaknesses: ["Arrogante", "Teimoso", "Preguiçoso", "Egocêntrico"],
          compatibility: "Áries, Sagitário, Libra",
          luckyNumbers: "1, 3, 10", luckyColor: "🟠 Laranja",
          description: "Leão é o rei do zodíaco. Naturalmente carismáticos e dramáticos, adoram ser o centro das atenções e têm um coração generoso."
        },
        virgem: {
          emoji: "♍", name: "Virgem", element: "🌍 Terra", period: "23/08 - 22/09",
          planet: "☿ Mercúrio",
          traits: ["Analítico", "Trabalhador", "Prático", "Detalhista", "Organizado", "Modesto"],
          weaknesses: ["Tímido", "Preocupado", "Crítico", "Perfeccionista"],
          compatibility: "Touro, Capricórnio, Câncer",
          luckyNumbers: "5, 14, 23", luckyColor: "🟤 Marrom",
          description: "Virgem é o perfeccionista do zodíaco. Com atenção meticulosa aos detalhes, são trabalhadores dedicados que sempre buscam melhorar."
        },
        libra: {
          emoji: "♎", name: "Libra", element: "💨 Ar", period: "23/09 - 22/10",
          planet: "♀️ Vênus",
          traits: ["Diplomático", "Justo", "Social", "Cooperativo", "Gracioso", "Harmonioso"],
          weaknesses: ["Indeciso", "Evita conflitos", "Rancoroso", "Autocomplacente"],
          compatibility: "Gêmeos, Aquário, Leão",
          luckyNumbers: "4, 6, 13", luckyColor: "🩷 Rosa",
          description: "Libra busca equilíbrio e harmonia em tudo. São diplomatas naturais com um senso apurado de justiça e amor pela beleza."
        },
        escorpiao: {
          emoji: "♏", name: "Escorpião", element: "💧 Água", period: "23/10 - 21/11",
          planet: "♇ Plutão",
          traits: ["Apaixonado", "Determinado", "Corajoso", "Leal", "Estratégico", "Intenso"],
          weaknesses: ["Ciumento", "Secreto", "Vingativo", "Desconfiado"],
          compatibility: "Câncer, Peixes, Virgem",
          luckyNumbers: "8, 11, 18", luckyColor: "🔴 Escarlate",
          description: "Escorpião é o mais intenso do zodíaco. Com uma paixão ardente e determinação inabalável, são verdadeiros mestres da transformação."
        },
        sagitario: {
          emoji: "♐", name: "Sagitário", element: "🔥 Fogo", period: "22/11 - 21/12",
          planet: "♃ Júpiter",
          traits: ["Otimista", "Aventureiro", "Honesto", "Filosófico", "Livre", "Engraçado"],
          weaknesses: ["Prometem demais", "Impaciente", "Descuidado", "Direto demais"],
          compatibility: "Áries, Leão, Aquário",
          luckyNumbers: "3, 7, 9", luckyColor: "🟣 Roxo",
          description: "Sagitário é o aventureiro do zodíaco. Com um espírito livre e otimismo contagiante, estão sempre em busca de novas experiências e conhecimento."
        },
        capricornio: {
          emoji: "♑", name: "Capricórnio", element: "🌍 Terra", period: "22/12 - 19/01",
          planet: "♄ Saturno",
          traits: ["Responsável", "Disciplinado", "Ambicioso", "Paciente", "Prático", "Sábio"],
          weaknesses: ["Pessimista", "Teimoso", "Rígido", "Workaholic"],
          compatibility: "Touro, Virgem, Escorpião",
          luckyNumbers: "4, 8, 13", luckyColor: "⚫ Preto",
          description: "Capricórnio é o mais ambicioso do zodíaco. Com disciplina e paciência extraordinárias, constroem seu caminho até o topo com determinação."
        },
        aquario: {
          emoji: "♒", name: "Aquário", element: "💨 Ar", period: "20/01 - 18/02",
          planet: "♅ Urano",
          traits: ["Progressivo", "Original", "Independente", "Humanitário", "Inventivo", "Visionário"],
          weaknesses: ["Distante", "Imprevisível", "Teimoso", "Extremista"],
          compatibility: "Gêmeos, Libra, Sagitário",
          luckyNumbers: "4, 7, 11", luckyColor: "🔵 Azul",
          description: "Aquário é o visionário do zodíaco. Com ideias revolucionárias e espírito humanitário, estão sempre à frente do seu tempo."
        },
        peixes: {
          emoji: "♓", name: "Peixes", element: "💧 Água", period: "19/02 - 20/03",
          planet: "♆ Netuno",
          traits: ["Compassivo", "Artístico", "Intuitivo", "Gentil", "Sábio", "Sonhador"],
          weaknesses: ["Medroso", "Triste demais", "Deseja escapar", "Vítima"],
          compatibility: "Câncer, Escorpião, Touro",
          luckyNumbers: "3, 9, 12", luckyColor: "🟢 Verde-água",
          description: "Peixes é o mais empático do zodíaco. Com uma intuição afiada e alma artística, sentem profundamente e têm uma conexão especial com o mundo espiritual."
        }
      };

      const z = zodiac[sign];
      if (!z) {
        return interaction.reply({
          embeds: [createErrorEmbed("Signo não encontrado.")],
          ephemeral: true
        });
      }

      const elementColors = {
        "🔥 Fogo": 0xE74C3C,
        "🌍 Terra": 0x8B4513,
        "💨 Ar": 0x87CEEB,
        "💧 Água": 0x3498DB
      };

      await interaction.reply({
        embeds: [createEmbed({
          title: `${z.emoji} ${z.name}`,
          description: `*${z.description}*`,
          fields: [
            { name: "📅 Período", value: z.period, inline: true },
            { name: "🌟 Elemento", value: z.element, inline: true },
            { name: "🪐 Planeta Regente", value: z.planet, inline: true },
            { name: "💪 Qualidades", value: z.traits.join(", "), inline: false },
            { name: "⚠️ Fraquezas", value: z.weaknesses.join(", "), inline: false },
            { name: "💕 Compatibilidade", value: z.compatibility, inline: true },
            { name: "🔢 Números da Sorte", value: z.luckyNumbers, inline: true },
            { name: "🎨 Cor da Sorte", value: z.luckyColor, inline: true }
          ],
          color: elementColors[z.element] || 0x9B59B6
        })]
      });
    }

    // SLOT
    if (sub === "slot") {
      const symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '🔔', '⭐'];
      const weights = [25, 20, 20, 15, 5, 3, 7, 5];

      function weightedRandom() {
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let rand = Math.floor(Math.random() * totalWeight);
        for (let i = 0; i < symbols.length; i++) {
          rand -= weights[i];
          if (rand < 0) return symbols[i];
        }
        return symbols[0];
      }

      const reel1 = weightedRandom();
      const reel2 = weightedRandom();
      const reel3 = weightedRandom();

      const topRow = [weightedRandom(), weightedRandom(), weightedRandom()];
      const bottomRow = [weightedRandom(), weightedRandom(), weightedRandom()];

      let result;
      let color;

      if (reel1 === reel2 && reel2 === reel3) {
        if (reel1 === '💎') {
          result = "💰 **JACKPOT DIAMANTE!!!** Você é incrivelmente sortudo!";
          color = 0xFFD700;
        } else if (reel1 === '7️⃣') {
          result = "🎰 **JACKPOT 777!!!** Sorte máxima!";
          color = 0xFF0000;
        } else {
          result = `🎉 **TRIPLE ${reel1}!** Você ganhou!`;
          color = 0x2ECC71;
        }
      } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
        result = "😊 **Par!** Quase lá, tente novamente!";
        color = 0xF1C40F;
      } else {
        result = "😔 **Nada desta vez...** Tente a sorte novamente!";
        color = 0x95A5A6;
      }

      const slotDisplay =
        `⬛ ${topRow[0]} ┃ ${topRow[1]} ┃ ${topRow[2]} ⬛\n` +
        `▶ ${reel1} ┃ ${reel2} ┃ ${reel3} ◀\n` +
        `⬛ ${bottomRow[0]} ┃ ${bottomRow[1]} ┃ ${bottomRow[2]} ⬛`;

      await interaction.reply({
        embeds: [createEmbed({
          title: "🎰 Caça-Níquel",
          description: `${slotDisplay}\n\n${result}`,
          color
        })]
      });
    }
  },

  async handleButton(interaction) {
    const customId = interaction.customId;

    // RPS Button Handler
    if (customId.startsWith("fun_rps_")) {
      const parts = customId.split("_");
      if (parts.length < 4) return;
      const choice = parts[2];
      const originalUserId = parts[3];

      if (interaction.user.id !== originalUserId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas quem iniciou o jogo pode jogar!")],
          ephemeral: true
        });
      }

      const choices = ["pedra", "papel", "tesoura"];
      const botChoice = choices[Math.floor(Math.random() * choices.length)];

      const emojis = { pedra: "🪨", papel: "📄", tesoura: "✂️" };
      const names = { pedra: "Pedra", papel: "Papel", tesoura: "Tesoura" };

      let result;
      let color;
      if (choice === botChoice) {
        result = "🤝 **Empate!** Ninguém ganhou dessa vez.";
        color = 0xF1C40F;
      } else if (
        (choice === "pedra" && botChoice === "tesoura") ||
        (choice === "papel" && botChoice === "pedra") ||
        (choice === "tesoura" && botChoice === "papel")
      ) {
        result = "🎉 **Você ganhou!** Parabéns!";
        color = 0x2ECC71;
      } else {
        result = "😔 **Você perdeu!** O bot te derrotou.";
        color = 0xE74C3C;
      }

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("fun_rps_pedra_disabled").setLabel("🪨 Pedra").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("fun_rps_papel_disabled").setLabel("📄 Papel").setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId("fun_rps_tesoura_disabled").setLabel("✂️ Tesoura").setStyle(ButtonStyle.Danger).setDisabled(true)
      );

      await interaction.update({
        embeds: [createEmbed({
          title: "✊ Pedra, Papel ou Tesoura — Resultado!",
          description: `**Você escolheu:** ${emojis[choice]} ${names[choice]}\n**Bot escolheu:** ${emojis[botChoice]} ${names[botChoice]}\n\n${result}`,
          color
        })],
        components: [disabledRow]
      });
    }

    // TRIVIA Button Handler
    if (customId.startsWith("fun_trivia_")) {
      const parts = customId.split("_");
      if (parts.length < 4) return;
      const answerIndex = parseInt(parts[2]);
      const triviaId = parts[3];

      const state = triviaAnswers.get(triviaId);
      if (!state) {
        return interaction.reply({
          embeds: [createErrorEmbed("Esta pergunta expirou.")],
          ephemeral: true
        });
      }

      if (interaction.user.id !== state.userId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas quem iniciou o trivia pode responder!")],
          ephemeral: true
        });
      }

      clearTimeout(state.timeout);
      triviaAnswers.delete(triviaId);

      const correct = answerIndex === state.correctIndex;
      const labels = ["A", "B", "C", "D"];

      const answersText = state.answers.map((a, i) => {
        if (i === state.correctIndex) return `✅ **${labels[i]}.** ${a}`;
        if (i === answerIndex && !correct) return `❌ **${labels[i]}.** ${a}`;
        return `${labels[i]}. ${a}`;
      }).join("\n");

      const disabledRow = new ActionRowBuilder().addComponents(
        labels.map((label, i) =>
          new ButtonBuilder()
            .setCustomId(`fun_trivia_${i}_disabled`)
            .setLabel(label)
            .setStyle(i === state.correctIndex ? ButtonStyle.Success : (i === answerIndex && !correct ? ButtonStyle.Danger : ButtonStyle.Secondary))
            .setDisabled(true)
        )
      );

      await interaction.update({
        embeds: [createEmbed({
          title: correct ? "🧠 Trivia — Correto! 🎉" : "🧠 Trivia — Errado! 😔",
          description: `**${state.question}**\n\n${answersText}`,
          color: correct ? 0x2ECC71 : 0xE74C3C,
          footer: correct ? "Parabéns, você acertou!" : `A resposta correta era ${labels[state.correctIndex]}. ${state.answers[state.correctIndex]}`
        })],
        components: [disabledRow]
      });
    }

    // BATALHA Button Handler
    if (customId.startsWith("fun_batalha_")) {
      const parts = customId.split("_");
      if (parts.length < 4) return;
      const action = parts[2];
      const battleId = parts[3];

      const state = activeBattles.get(battleId);
      if (!state) {
        return interaction.reply({
          embeds: [createErrorEmbed("Esta batalha expirou ou já terminou.")],
          ephemeral: true
        });
      }

      if (interaction.user.id !== state.userId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas quem iniciou a batalha pode jogar!")],
          ephemeral: true
        });
      }

      if (action === "defender" && state.playerLastDefended) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você não pode defender duas vezes seguidas!")],
          ephemeral: true
        });
      }

      if (action === "especial" && state.playerSpecials <= 0) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você não tem mais usos de especial!")],
          ephemeral: true
        });
      }

      // Player action
      let playerDmg = 0;
      let playerActionText = "";
      const playerDefending = action === "defender";

      if (action === "atacar") {
        playerDmg = Math.floor(Math.random() * 11) + 15;
        playerActionText = `⚔️ Você atacou causando`;
      } else if (action === "defender") {
        playerActionText = "🛡️ Você se defendeu";
      } else if (action === "especial") {
        playerDmg = Math.floor(Math.random() * 16) + 25;
        state.playerSpecials--;
        playerActionText = `✨ Você usou especial causando`;
      }

      // Bot AI
      let botAction = "";
      let botDmg = 0;
      let botDefending = false;

      const rand = Math.random();
      const canBotDefend = !state.botLastDefended;
      const canBotSpecial = state.botSpecials > 0;

      if (canBotDefend && canBotSpecial) {
        if (rand < 0.50) botAction = "atacar";
        else if (rand < 0.80) botAction = "defender";
        else botAction = "especial";
      } else if (canBotDefend) {
        botAction = rand < 0.70 ? "atacar" : "defender";
      } else if (canBotSpecial) {
        botAction = rand < 0.65 ? "atacar" : "especial";
      } else {
        botAction = "atacar";
      }

      if (botAction === "atacar") {
        botDmg = Math.floor(Math.random() * 11) + 15;
      } else if (botAction === "defender") {
        botDefending = true;
      } else if (botAction === "especial") {
        botDmg = Math.floor(Math.random() * 16) + 25;
        state.botSpecials--;
      }

      // Apply damage — player to bot
      if (playerDmg > 0) {
        if (botDefending && action !== "especial") {
          playerDmg = Math.floor(playerDmg / 2);
        }
        state.botHp = Math.max(0, state.botHp - playerDmg);
        playerActionText += ` **${playerDmg}** de dano`;
      }

      // Apply damage — bot to player
      if (botDmg > 0) {
        if (playerDefending && botAction !== "especial") {
          botDmg = Math.floor(botDmg / 2);
        }
        state.playerHp = Math.max(0, state.playerHp - botDmg);
      }

      const botActionNames = {
        atacar: `⚔️ Bot atacou causando **${botDmg}** de dano`,
        defender: "🛡️ Bot se defendeu",
        especial: `✨ Bot usou especial causando **${botDmg}** de dano`
      };

      state.playerLastDefended = playerDefending;
      state.botLastDefended = botDefending;
      state.turn++;

      const gameOver = state.playerHp <= 0 || state.botHp <= 0;
      let resultText = "";
      let embedColor = 0xE74C3C;

      if (gameOver) {
        clearTimeout(state.timeout);
        activeBattles.delete(battleId);

        if (state.playerHp <= 0 && state.botHp <= 0) {
          resultText = "\n\n🤝 **EMPATE!** Ambos caíram ao mesmo tempo!";
          embedColor = 0xF1C40F;
        } else if (state.botHp <= 0) {
          resultText = "\n\n🎉 **VITÓRIA!** Você derrotou o bot!";
          embedColor = 0x2ECC71;
        } else {
          resultText = "\n\n💀 **DERROTA!** O bot te derrotou!";
          embedColor = 0xE74C3C;
        }
      }

      const battleRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fun_batalha_atacar_${battleId}`)
          .setLabel("⚔️ Atacar")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(gameOver),
        new ButtonBuilder()
          .setCustomId(`fun_batalha_defender_${battleId}`)
          .setLabel("🛡️ Defender")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(gameOver || playerDefending),
        new ButtonBuilder()
          .setCustomId(`fun_batalha_especial_${battleId}`)
          .setLabel(`✨ Especial (${state.playerSpecials})`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(gameOver || state.playerSpecials <= 0)
      );

      await interaction.update({
        embeds: [createEmbed({
          title: gameOver ? "⚔️ Batalha — Fim!" : `⚔️ Batalha — Turno ${state.turn}`,
          description:
            `**❤️ Você:** ${hpBar(state.playerHp, 100)}\n` +
            `**🤖 Bot:** ${hpBar(state.botHp, 100)}\n\n` +
            `📋 **Turno ${state.turn - 1}:**\n${playerActionText}\n${botActionNames[botAction]}` +
            resultText,
          color: embedColor
        })],
        components: [battleRow]
      });
    }
  },
};