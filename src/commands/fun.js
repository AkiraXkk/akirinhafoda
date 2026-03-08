const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

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
  },
};