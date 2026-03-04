const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { createCanvas, loadImage } = require("canvas");

const levelsStore = createDataStore("levels.json");
const levelRolesStore = createDataStore("levelRoles.json");
const levelConfigStore = createDataStore("levelConfig.json");
const userCardsStore = createDataStore("userCards.json");

// Cooldown de XP por mensagem (1 minuto)
const xpCooldowns = new Map();

// Função para formatar duração de tempo
function formatDuration(ms) {
  if (!ms || ms === 0) return "0min";
  
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

// Função para obter cards do usuário
async function getUserCards(userId) {
  const cards = await userCardsStore.load();
  return cards[userId] || { owned: [], selected: "default" };
}

// Função para adicionar card ao usuário
async function addUserCard(userId, cardId) {
  await userCardsStore.update(userId, (current) => {
    const userCards = current || { owned: [], selected: "default" };
    if (!userCards.owned.includes(cardId)) {
      userCards.owned.push(cardId);
    }
    return userCards;
  });
}

// Função para selecionar card do usuário
async function selectUserCard(userId, cardId) {
  await userCardsStore.update(userId, (current) => {
    const userCards = current || { owned: [], selected: "default" };
    if (userCards.owned.includes(cardId) || cardId === "default") {
      userCards.selected = cardId;
    }
    return userCards;
  });
}

// Função para obter configuração do card
function getCardConfig(cardId) {
  const cards = {
    "default": {
      name: "Padrão",
      background: "#1a1a1a",
      gradient: ["#2c2f33", "#1a1a1a"],
      textColor: "#ffffff",
      levelColor: "#ffd700",
      barColor: "#ffd700"
    },
    "premium": {
      name: "Premium",
      background: "#1a1a1a",
      gradient: ["#7289da", "#4a5568"],
      textColor: "#ffffff",
      levelColor: "#7289da",
      barColor: "#7289da"
    },
    "gold": {
      name: "Gold",
      background: "#1a1a1a",
      gradient: ["#ffd700", "#ffb347"],
      textColor: "#ffffff",
      levelColor: "#ffffff",
      barColor: "#ffffff"
    },
    "neon": {
      name: "Neon",
      background: "#1a1a1a",
      gradient: ["#ff006e", "#8338ec"],
      textColor: "#ffffff",
      levelColor: "#ff006e",
      barColor: "#ff006e"
    },
    "ocean": {
      name: "Ocean",
      background: "#1a1a1a",
      gradient: ["#0077be", "#00a8cc"],
      textColor: "#ffffff",
      levelColor: "#0077be",
      barColor: "#0077be"
    }
  };
  
  return cards[cardId] || cards["default"];
}

// Função para gerar card visual de rank
async function gerarCardRank(user, data, levels, interaction) {
  const canvas = createCanvas(934, 282);
  const ctx = canvas.getContext("2d");
  
  // Obter card selecionado do usuário
  const userCards = await getUserCards(user.id);
  const cardConfig = getCardConfig(userCards.selected);
  
  // Fundo principal
  ctx.fillStyle = cardConfig.background;
  ctx.fillRect(0, 0, 934, 282);
  
  // Aplicar gradiente se configurado
  if (cardConfig.gradient) {
    const gradient = ctx.createLinearGradient(0, 0, 934, 282);
    gradient.addColorStop(0, cardConfig.gradient[0]);
    gradient.addColorStop(1, cardConfig.gradient[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 934, 282);
  }
  
  // Carregar banner do usuário ou usar fallback
  let backgroundImage;
  try {
    if (data.banner_atual) {
      backgroundImage = await loadImage(data.banner_atual);
    }
  } catch (error) {
    console.log(`Erro ao carregar banner do usuário ${user.id}, usando fallback:`, error.message);
  }
  
  // Desenhar banner ou manter gradiente
  if (backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0, 934, 282);
    // Overlay escuro para legibilidade
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, 934, 282);
  }
  
  // Carregar avatar do usuário
  let avatar;
  try {
    avatar = await loadImage(user.displayAvatarURL({ size: 128, extension: "png" }));
  } catch (error) {
    console.log(`Erro ao carregar avatar do usuário ${user.id}:`, error.message);
  }
  
  // Desenhar avatar circular
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(80, 80, 50, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 30, 30, 100, 100);
    ctx.restore();
    
    // Borda do avatar
    ctx.strokeStyle = "#4a5568";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(80, 80, 50, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Informações do usuário
  ctx.fillStyle = cardConfig.textColor;
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "left";
  
  // Nome do usuário
  const displayName = user.displayName || user.username;
  ctx.fillText(displayName, 160, 50);
  
  // XP e Nível
  ctx.font = "bold 36px Arial";
  ctx.fillStyle = cardConfig.levelColor;
  ctx.fillText(`Nível ${data.level || 1}`, 160, 90);
  
  ctx.font = "20px Arial";
  ctx.fillStyle = cardConfig.textColor;
  ctx.fillText(`${data.totalXp || 0} / 1000 XP`, 160, 130);
  
  // Barra de progresso
  const progress = Math.min((data.xp || 0) / 1000, 1);
  const barWidth = 200;
  const filledWidth = Math.floor(barWidth * progress);
  const barHeight = 8;
  const barX = 160;
  const barY = 160;
  
  // Fundo da barra
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.fillRect(barX, barY, barWidth, barHeight);
  
  // Preenchimento da barra
  ctx.fillStyle = cardConfig.barColor;
  ctx.fillRect(barX, barY, filledWidth, barHeight);
  
  // Métricas adicionais
  ctx.font = "16px Arial";
  ctx.fillStyle = "#b8bfc7";
  
  // Mensagens
  const messagesY = 190;
  ctx.fillText("💬", 160, messagesY);
  ctx.fillStyle = cardConfig.textColor;
  ctx.fillText(`${data.messages_count || 0} mensagens`, 200, messagesY);
  
  // Tempo em call
  const voiceY = 215;
  const tempoFormatado = formatDuration(data.voice_time || 0);
  ctx.fillText("🎙️", 160, voiceY);
  ctx.fillStyle = cardConfig.textColor;
  ctx.fillText(`${tempoFormatado} em call`, 200, voiceY);
  
  // Posição no ranking
  const allUsers = Object.entries(levels).filter(([id, d]) => (d.totalXp || 0) > 0);
  const sortedUsers = allUsers.sort((a, b) => (b[1].totalXp || 0) - (a[1].totalXp || 0));
  const userRank = sortedUsers.findIndex(([id]) => id === user.id) + 1;
  
  ctx.font = "14px Arial";
  ctx.fillStyle = "#95a5a6";
  ctx.fillText(`🏆 Rank #${userRank || 'N/A'}`, 160, 245);
  
  // Nome do card no canto inferior direito
  ctx.font = "12px Arial";
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.textAlign = "right";
  ctx.fillText(cardConfig.name, 934 - 10, 282 - 10);
  
  return canvas.toBuffer("image/png");
}

async function getLevelRoleConfig(guildId) {
  if (!guildId) return {};
  const data = await levelRolesStore.load();
  return data[guildId] || {};
}

async function setLevelRole(guildId, nivel, roleId) {
  if (!guildId) return;
  const chave = String(nivel);
  await levelRolesStore.update(guildId, (atual) => {
    const roles = atual || {};
    if (roleId) roles[chave] = roleId; else delete roles[chave];
    return roles;
  });
}

async function applyLevelRoles(member, nivelAnterior, novoNivel) {
  if (!member?.guild?.id) return;
  const config = await getLevelRoleConfig(member.guild.id);
  const cargoNovoId = config[String(novoNivel)];
  const cargoAntigoId = config[String(nivelAnterior)];

  try {
    // Remover TODOS os cargos de nível que o usuário possa ter (stacking prevention)
    const allLevelRoles = Object.values(config);
    const rolesToRemove = allLevelRoles.filter(roleId => 
      member.roles.cache.has(roleId) && roleId !== cargoNovoId
    );

    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove);
    }

    // Adicionar o novo cargo (se existir e se o usuário ainda não tiver)
    if (cargoNovoId && !member.roles.cache.has(cargoNovoId)) {
      await member.roles.add(cargoNovoId);
    }
  } catch (error) {
    console.error(`Erro ao aplicar cargos de nível para usuário ${member.id}:`, error);
  }
}

async function addXp(userId, amount = 10) {
  let subiuNivel = false;
  let novoNivel = 1;
  let nivelAnterior = 1;

  await levelsStore.update(userId, (current) => {
    const data = current || { xp: 0, level: 1, totalXp: 0, messages_count: 0, voice_time: 0 };
    nivelAnterior = data.level;
    
    // Adicionar ao XP total
    data.totalXp = (data.totalXp || 0) + amount;
    
    // Calcular novo nível baseado no XP total (1000 XP por nível)
    // Fórmula: Nível = Math.floor(XP / 1000)
    const novoNivelCalculado = Math.floor(data.totalXp / 1000);
    
    // Garantir nível mínimo de 1
    data.level = Math.max(1, novoNivelCalculado);
    
    // Calcular XP para o nível atual
    data.xp = data.totalXp % 1000;
    
    // Verificar se subiu de nível
    if (data.level > nivelAnterior) {
      subiuNivel = true;
      novoNivel = data.level;
    }

    return data;
  });

  return { subiuNivel, novoNivel, nivelAnterior };
}

async function getLevelConfig(guildId) {
  if (!guildId) return { xpPerMessage: 10, xpPerMinuteVoice: 60, immuneRoleIds: [], multiplierRoles: {} };
  const data = await levelConfigStore.load();
  const config = data[guildId] || {};
  return {
    xpPerMessage: Number.isFinite(config.xpPerMessage) ? config.xpPerMessage : 10,
    xpPerMinuteVoice: Number.isFinite(config.xpPerMinuteVoice) ? config.xpPerMinuteVoice : 60,
    immuneRoleIds: Array.isArray(config.immuneRoleIds) ? config.immuneRoleIds : [],
    multiplierRoles: typeof config.multiplierRoles === "object" && config.multiplierRoles !== null ? config.multiplierRoles : {},
  };
}

async function setLevelConfig(guildId, patch) {
  if (!guildId) return;
  await levelConfigStore.update(guildId, (current) => {
    const atual = current || {};
    return { ...atual, ...patch };
  });
}

async function addXpForMessage(member) {
  if (!member?.guild?.id) return { subiuNivel: false, novoNivel: 1, nivelAnterior: 1 };
  
  // Verificar cooldown de 1 minuto
  const now = Date.now();
  const lastXpTime = xpCooldowns.get(member.id) || 0;
  if (now - lastXpTime < 60000) { // 1 minuto = 60000ms
    return { subiuNivel: false, novoNivel: 1, nivelAnterior: 1 };
  }
  
  const config = await getLevelConfig(member.guild.id);

  if (config.immuneRoleIds.some((roleId) => member.roles.cache.has(roleId))) {
    return { subiuNivel: false, novoNivel: 1, nivelAnterior: 1 };
  }

  // XP aleatório entre 1 e 12
  const xpAleatorio = Math.floor(Math.random() * 12) + 1; // 1-12
  
  // Aplicar multiplicador baseado em vezes (ex: 2x, 3x)
  let multiplicador = 1;
  for (const [roleId, vezes] of Object.entries(config.multiplierRoles)) {
    if (member.roles.cache.has(roleId)) {
      multiplicador = Math.max(multiplicador, Number(vezes) || 1);
    }
  }
  
  const quantidade = Math.min(xpAleatorio * multiplicador, 50); // Limite máximo de 50 XP por mensagem
  
  // Atualizar cooldown
  xpCooldowns.set(member.id, now);
  
  const resultado = await addXp(member.id, quantidade);

  // Incrementar contador de mensagens
  await levelsStore.update(member.id, (current) => {
    const dados = current || { xp: 0, level: 1, totalXp: 0, messages_count: 0, voice_time: 0 };
    dados.messages_count = (dados.messages_count || 0) + 1;
    return dados;
  });

  return resultado;
}

async function addXpForVoiceTick(member, minutos = 1) {
  if (!member?.guild?.id) return { subiuNivel: false, novoNivel: 1, nivelAnterior: 1 };
  const config = await getLevelConfig(member.guild.id);

  if (config.immuneRoleIds.some((roleId) => member.roles.cache.has(roleId))) {
    return { subiuNivel: false, novoNivel: 1, nivelAnterior: 1 };
  }

  let fator = 1;
  for (const [roleId, mult] of Object.entries(config.multiplierRoles)) {
    if (member.roles.cache.has(roleId)) {
      fator = Math.max(fator, Number(mult) || 1);
    }
  }

  const base = config.xpPerMinuteVoice || 60;
  const quantidade = Math.max(0, Math.round(base * minutos * fator));
  const resultado = await addXp(member.id, quantidade);

  const incrementoMs = minutos * 60 * 1000;
  await levelsStore.update(member.id, (current) => {
    const dados = current || { xp: 0, level: 1, totalXp: 0, messages_count: 0, voice_time: 0 };
    dados.voice_time = (dados.voice_time || 0) + incrementoMs;
    return dados;
  });

  return resultado;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Sistema de níveis")
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("Verifica seu nível e XP")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário (opcional)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName("leaderboard").setDescription("Mostra o ranking de usuários com mais XP")
        .addIntegerOption((opt) => opt.setName("pagina").setDescription("Número da página").setMinValue(1).setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("xpconfig")
        .setDescription("Configura XP por mensagem/voz e multiplicadores (Admin)")
        .addIntegerOption((opt) =>
          opt.setName("xp_msg").setDescription("XP base por mensagem (1-12 aleatório)").setMinValue(0).setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt.setName("xp_voz").setDescription("XP base por minuto em call").setMinValue(0).setRequired(false)
        )
        .addRoleOption((opt) =>
          opt.setName("cargo_imune").setDescription("Cargo que não ganha XP").setRequired(false)
        )
        .addRoleOption((opt) =>
          opt.setName("cargo_multiplicador").setDescription("Cargo com multiplicador de XP (2x, 3x, etc)").setRequired(false)
        )
        .addNumberOption((opt) =>
          opt
            .setName("fator")
            .setDescription("Multiplicador de XP para o cargo (ex: 2 para 2x)")
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Mapeia nível → cargo (Admin)")
        .addIntegerOption((opt) => opt.setName("nivel").setDescription("Nível").setRequired(true).setMinValue(1))
        .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo a atribuir ao atingir esse nível").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("cards").setDescription("Gerenciar seus cards de rank")
        .addStringOption((opt) =>
          opt.setName("action")
            .setDescription("Ação")
            .setRequired(true)
            .addChoices(
              { name: "Ver meus cards", value: "view" },
              { name: "Selecionar card", value: "select" }
            )
        )
        .addStringOption((opt) =>
          opt.setName("card")
            .setDescription("Card para selecionar")
            .setRequired(false)
            .addChoices(
              { name: "Padrão", value: "default" },
              { name: "Premium", value: "premium" },
              { name: "Gold", value: "gold" },
              { name: "Neon", value: "neon" },
              { name: "Ocean", value: "ocean" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName("manage").setDescription("Gerenciar XP de membros (Admin)")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário").setRequired(true))
        .addStringOption((opt) =>
          opt.setName("action")
            .setDescription("Ação")
            .setRequired(true)
            .addChoices(
              { name: "Adicionar XP", value: "add" },
              { name: "Remover XP", value: "remove" },
              { name: "Definir XP", value: "set" },
              { name: "Resetar XP", value: "reset" }
            )
        )
        .addIntegerOption((opt) => opt.setName("quantidade").setDescription("Quantidade de XP").setMinValue(0).setRequired(false))
        .addStringOption((opt) =>
          opt.setName("motivo")
            .setDescription("Motivo da alteração")
            .setRequired(false)
            .setMaxLength(100)
        )
    ),

  getLevelRoleConfig,
  setLevelRole,
  applyLevelRoles,
  addXp,
  addXpForMessage,
  addXpForVoiceTick,
  getLevelConfig,
  setLevelConfig,
  getUserCards,
  addUserCard,
  getCardConfig,
  formatDuration,
  getLevelsStore: () => levelsStore,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const levels = await levelsStore.load();

    if (sub === "xpconfig") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [createErrorEmbed("Sem permissão.")], ephemeral: true });
      }

      const patch = {};
      const xpMsg = interaction.options.getInteger("xp_msg");
      const xpVoz = interaction.options.getInteger("xp_voz");
      const cargoImune = interaction.options.getRole("cargo_imune");
      const cargoMultiplicador = interaction.options.getRole("cargo_multiplicador");
      const fator = interaction.options.getNumber("fator");

      if (typeof xpMsg === "number") patch.xpPerMessage = xpMsg;
      if (typeof xpVoz === "number") patch.xpPerMinuteVoice = xpVoz;

      const atual = await getLevelConfig(interaction.guildId);

      if (cargoImune) {
        const lista = new Set(atual.immuneRoleIds || []);
        lista.add(cargoImune.id);
        patch.immuneRoleIds = Array.from(lista);
      }

      if (cargoMultiplicador && typeof fator === "number") {
        patch.multiplierRoles = {
          ...(atual.multiplierRoles || {}),
          [cargoMultiplicador.id]: fator,
        };
      }

      await setLevelConfig(interaction.guildId, patch);

      return interaction.reply({
        embeds: [createSuccessEmbed("Configuração de XP atualizada.")],
        ephemeral: true,
      });
    }

    if (sub === "config") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [createErrorEmbed("Sem permissão.")], ephemeral: true });
      }
      const nivel = interaction.options.getInteger("nivel");
      const cargo = interaction.options.getRole("cargo");
      await setLevelRole(interaction.guildId, nivel, cargo.id);
      return interaction.reply({
        embeds: [createSuccessEmbed(`Nível **${nivel}** agora concede o cargo ${cargo}.`)],
        ephemeral: true,
      });
    }

    if (sub === "view") {
      await interaction.deferReply(); // Defer para evitar timeout na geração da imagem
      
      const user = interaction.options.getUser("usuario") || interaction.user;
      const data = levels[user.id] || { xp: 0, level: 1, totalXp: 0, messages_count: 0, voice_time: 0 };
      
      try {
        const imagemBuffer = await gerarCardRank(user, data, levels, interaction);
        
        const attachment = new AttachmentBuilder(imagemBuffer, "rank.png");
        
        return interaction.editReply({
          files: [attachment]
        });
        
      } catch (error) {
        console.error("Erro ao gerar card de rank:", error);
        return interaction.editReply({
          content: "Ocorreu um erro ao gerar seu card de rank. Tente novamente.",
          ephemeral: true
        });
      }
    }

    if (sub === "cards") {
      const action = interaction.options.getString("action");
      const cardId = interaction.options.getString("card");
      
      if (action === "view") {
        const userCards = await getUserCards(interaction.user.id);
        
        const fields = [];
        
        // Card selecionado atual
        const selectedConfig = getCardConfig(userCards.selected);
        fields.push({
          name: "🎯 Card Atual",
          value: `**${selectedConfig.name}** (ID: ${userCards.selected})`,
          inline: false
        });
        
        // Cards disponíveis
        const availableCards = ["default", "premium", "gold", "neon", "ocean"];
        const ownedCards = availableCards.filter(card => 
          userCards.owned.includes(card) || card === "default"
        );
        
        if (ownedCards.length > 0) {
          const ownedList = ownedCards.map(cardId => {
            const config = getCardConfig(cardId);
            const isSelected = cardId === userCards.selected ? " ✅" : "";
            return `**${config.name}** (${cardId})${isSelected}`;
          }).join("\n");
          
          fields.push({
            name: "📋 Seus Cards",
            value: ownedList,
            inline: false
          });
        }
        
        // Cards para comprar
        const cardsToBuy = availableCards.filter(card => 
          !userCards.owned.includes(card) && card !== "default"
        );
        
        if (cardsToBuy.length > 0) {
          const buyList = cardsToBuy.map(cardId => {
            const config = getCardConfig(cardId);
            return `**${config.name}** - Use \`/shop\` para comprar`;
          }).join("\n");
          
          fields.push({
            name: "🛒 Cards Disponíveis",
            value: buyList,
            inline: false
          });
        }
        
        return interaction.reply({
          embeds: [createEmbed({
            title: "🎴 Seus Cards de Rank",
            description: "Gerencie seus cards personalizados para o comando `/rank view`",
            fields: fields,
            color: 0x9b59b6
          })],
          ephemeral: true
        });
      }
      
      if (action === "select") {
        if (!cardId) {
          return interaction.reply({
            embeds: [createErrorEmbed("Você precisa especificar qual card deseja selecionar.")],
            ephemeral: true
          });
        }
        
        const userCards = await getUserCards(interaction.user.id);
        
        // Verificar se o usuário possui o card
        if (!userCards.owned.includes(cardId) && cardId !== "default") {
          return interaction.reply({
            embeds: [createErrorEmbed(`Você não possui o card **${cardId}**. Use \`/shop\` para comprar cards.`)],
            ephemeral: true
          });
        }
        
        await selectUserCard(interaction.user.id, cardId);
        const cardConfig = getCardConfig(cardId);
        
        return interaction.reply({
          embeds: [createSuccessEmbed(`Card **${cardConfig.name}** selecionado com sucesso! Use \`/rank view\` para ver seu novo card.`)],
          ephemeral: true
        });
      }
    }

    if (sub === "manage") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Sem permissão para gerenciar XP.")], 
          ephemeral: true 
        });
      }

      const targetUser = interaction.options.getUser("usuario");
      const action = interaction.options.getString("action");
      const amount = interaction.options.getInteger("quantidade") || 0;
      const reason = interaction.options.getString("motivo") || "Sem motivo informado";

      // Obter dados atuais do usuário
      const currentData = levels[targetUser.id] || { xp: 0, level: 1, totalXp: 0, messages_count: 0, voice_time: 0 };
      
      let newTotalXp = currentData.totalXp || 0;
      let oldLevel = Math.floor((currentData.totalXp || 0) / 1000);
      let newLevel;
      let actionDescription = "";

      // Executar ação baseada no tipo
      switch (action) {
        case "add":
          newTotalXp += amount;
          actionDescription = `Adicionado ${amount} XP`;
          break;
        
        case "remove":
          newTotalXp = Math.max(0, newTotalXp - amount);
          actionDescription = `Removido ${amount} XP`;
          break;
        
        case "set":
          newTotalXp = amount;
          actionDescription = `XP definido para ${amount}`;
          break;
        
        case "reset":
          newTotalXp = 0;
          actionDescription = "XP resetado";
          break;
        
        default:
          return interaction.reply({
            embeds: [createErrorEmbed("Ação inválida.")],
            ephemeral: true
          });
      }

      // Calcular novo nível
      newLevel = Math.floor(newTotalXp / 1000);
      
      // Atualizar dados no banco
      await levelsStore.update(targetUser.id, (current) => {
        const data = current || { xp: 0, level: 1, totalXp: 0, messages_count: 0, voice_time: 0 };
        data.totalXp = newTotalXp;
        data.level = newLevel;
        data.xp = newTotalXp % 1000;
        return data;
      });

      // Aplicar cargos se o nível mudou
      if (newLevel !== oldLevel) {
        await applyLevelRoles(targetUser, interaction.guild, newLevel);
      }

      // Criar embed de resposta
      const fields = [
        { name: "👤 Usuário", value: `<@${targetUser.id}>`, inline: true },
        { name: "⚡ Ação", value: actionDescription, inline: true },
        { name: "📊 XP Anterior", value: `${currentData.totalXp || 0} (Nível ${oldLevel})`, inline: true },
        { name: "📈 XP Atual", value: `${newTotalXp} (Nível ${newLevel})`, inline: true },
        { name: "📝 Motivo", value: reason, inline: false }
      ];

      const embed = createEmbed({
        title: "🔧 XP Modificado",
        fields: fields,
        color: action === "remove" || action === "reset" ? 0xe74c3c : 0x2ecc71,
        footer: { text: `Executado por ${interaction.user.username}` }
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "leaderboard") {
      const page = Math.max(0, (interaction.options.getInteger("pagina") || 1) - 1);
      const pageSize = 10;
      
      const sorted = Object.entries(levels)
        .filter(([id, data]) => (data.totalXp || 0) > 0) // Filtrar usuários com 0 XP
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));

      const totalPages = Math.ceil(sorted.length / pageSize);
      const startIndex = page * pageSize;
      const endIndex = Math.min(startIndex + pageSize, sorted.length);
      const pageData = sorted.slice(startIndex, endIndex);

      if (pageData.length === 0) {
        return interaction.reply({
          embeds: [createEmbed({ description: "Ninguém ganhou XP ainda." })],
          ephemeral: true,
        });
      }

      const linhas = pageData.map(
        (entry, i) => `**${startIndex + i + 1}.** <@${entry.id}> — Nível ${entry.level} (${entry.totalXp || 0} XP total)`
      );

      const embed = createEmbed({ 
        title: "🏆 Leaderboard de Níveis", 
        description: linhas.join("\n"), 
        color: 0xf1c40f,
        footer: { text: `Página ${page + 1}/${totalPages} • Mostrando ${startIndex + 1}-${endIndex} de ${sorted.length} usuários` }
      });

      // Adicionar botões de navegação se houver mais de uma página
      const components = [];
      if (totalPages > 1) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
        const row = new ActionRowBuilder();
        
        // Botão anterior
        if (page > 0) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`leaderboard_prev_${page}`)
              .setLabel("⬅️ Anterior")
              .setStyle(ButtonStyle.Secondary)
          );
        }
        
        // Botão próximo
        if (page < totalPages - 1) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`leaderboard_next_${page}`)
              .setLabel("Próximo ➡️")
              .setStyle(ButtonStyle.Secondary)
          );
        }
        
        components.push(row);
      }

      return interaction.reply({ embeds: [embed], components });
    }
  },

  async handleInteraction(interaction) {
    if (!interaction.customId?.startsWith("leaderboard_")) return;
    
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const currentPage = parseInt(parts[2]);
    
    if (action === "prev") {
      return this.executeLeaderboardPage(interaction, currentPage - 1);
    } else if (action === "next") {
      return this.executeLeaderboardPage(interaction, currentPage + 1);
    }
  },

  async executeLeaderboardPage(interaction, page) {
    const levels = await levelsStore.load();
    const pageSize = 10;
    
    const sorted = Object.entries(levels)
      .filter(([id, data]) => (data.totalXp || 0) > 0)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));

    const totalPages = Math.ceil(sorted.length / pageSize);
    const startIndex = page * pageSize;
    const endIndex = Math.min(startIndex + pageSize, sorted.length);
    const pageData = sorted.slice(startIndex, endIndex);

    if (pageData.length === 0) {
      return interaction.update({
        embeds: [createEmbed({ description: "Ninguém ganhou XP ainda." })],
        components: [],
      });
    }

    const linhas = pageData.map(
      (entry, i) => `**${startIndex + i + 1}.** <@${entry.id}> — Nível ${entry.level} (${entry.totalXp || 0} XP total)`
    );

    const embed = createEmbed({ 
      title: "🏆 Leaderboard de Níveis", 
      description: linhas.join("\n"), 
      color: 0xf1c40f,
      footer: { text: `Página ${page + 1}/${totalPages} • Mostrando ${startIndex + 1}-${endIndex} de ${sorted.length} usuários` }
    });

    // Adicionar botões de navegação
    const components = [];
    if (totalPages > 1) {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
      const row = new ActionRowBuilder();
      
      // Botão anterior
      if (page > 0) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`leaderboard_prev_${page}`)
            .setLabel("⬅️ Anterior")
            .setStyle(ButtonStyle.Secondary)
        );
      }
      
      // Botão próximo
      if (page < totalPages - 1) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`leaderboard_next_${page}`)
            .setLabel("Próximo ➡️")
            .setStyle(ButtonStyle.Secondary)
        );
      }
      
      components.push(row);
    }

    return interaction.update({ embeds: [embed], components });
  }
};
