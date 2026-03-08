const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

let createCanvas, loadImage;
try {
  const canvas = require("canvas");
  createCanvas = canvas.createCanvas;
  loadImage = canvas.loadImage;
} catch (error) {
  console.log("⚠️ Canvas não disponível - comandos de imagem desativados");
}

const levelsStore = createDataStore("levels.json");
const levelRolesStore = createDataStore("levelRoles.json");
const levelConfigStore = createDataStore("levelConfig.json");
const userCardsStore = createDataStore("userCards.json");
const xpCooldowns = new Map();

function formatDuration(ms) {
  if (!ms || ms === 0) return "0min";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

async function getUserCards(userId) {
  const cards = await userCardsStore.load();
  return cards[userId] || { owned: ["default"], selected: "default" };
}

async function addUserCard(userId, cardId) {
  await userCardsStore.update(userId, (current) => {
    const userCards = current || { owned: ["default"], selected: "default" };
    if (!userCards.owned.includes(cardId)) userCards.owned.push(cardId);
    return userCards;
  });
}

async function selectUserCard(userId, cardId) {
  await userCardsStore.update(userId, (current) => {
    const userCards = current || { owned: ["default"], selected: "default" };
    if (userCards.owned.includes(cardId) || cardId === "default") userCards.selected = cardId;
    return userCards;
  });
}

function getCardConfig(cardId) {
  const cards = {
    "default": { name: "Padrão", background: "#1a1a1a", gradient: ["#2c2f33", "#1a1a1a"], textColor: "#ffffff", levelColor: "#ffd700", barColor: "#ffd700" },
    "premium": { name: "Premium", background: "#1a1a1a", gradient: ["#7289da", "#4a5568"], textColor: "#ffffff", levelColor: "#7289da", barColor: "#7289da" },
    "gold": { name: "Gold", background: "#1a1a1a", gradient: ["#ffd700", "#ffb347"], textColor: "#ffffff", levelColor: "#ffffff", barColor: "#ffffff" },
    "neon": { name: "Neon", background: "#1a1a1a", gradient: ["#ff006e", "#8338ec"], textColor: "#ffffff", levelColor: "#ff006e", barColor: "#ff006e" },
    "ocean": { name: "Ocean", background: "#1a1a1a", gradient: ["#0077be", "#00a8cc"], textColor: "#ffffff", levelColor: "#0077be", barColor: "#0077be" },
    "legendary": { name: "Lendário", background: "#1a1a1a", gradient: ["#9b59b6", "#8e44ad"], textColor: "#ffffff", levelColor: "#9b59b6", barColor: "#9b59b6" },
    "cosmic": { name: "Cósmico", background: "#1a1a1a", gradient: ["#2c3e50", "#34495e"], textColor: "#ffffff", levelColor: "#3498db", barColor: "#3498db" },
    "dragon": { name: "Dragão", background: "#1a1a1a", gradient: ["#e67e22", "#d35400"], textColor: "#ffffff", levelColor: "#e67e22", barColor: "#e67e22" }
  };
  return cards[cardId] || cards["default"];
}

async function gerarCardRank(user, data, levels, interaction) {
  if (!createCanvas) return null;
  const canvas = createCanvas(934, 282);
  const ctx = canvas.getContext("2d");

  const userCards = await getUserCards(user.id);
  const cardConfig = getCardConfig(userCards.selected);

  ctx.fillStyle = cardConfig.background;
  ctx.fillRect(0, 0, 934, 282);

  if (cardConfig.gradient) {
    const gradient = ctx.createLinearGradient(0, 0, 934, 282);
    gradient.addColorStop(0, cardConfig.gradient[0]);
    gradient.addColorStop(1, cardConfig.gradient[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 934, 282);
  }

  let avatar;
  try { avatar = await loadImage(user.displayAvatarURL({ size: 128, extension: "png" })); } catch (e) {}

  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(80, 80, 50, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 30, 30, 100, 100);
    ctx.restore();
    ctx.strokeStyle = "#4a5568";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(80, 80, 50, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = cardConfig.textColor;
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "left";
  ctx.fillText(user.displayName || user.username, 160, 50);

  ctx.font = "bold 36px Arial";
  ctx.fillStyle = cardConfig.levelColor;
  ctx.fillText(`Nível ${data.level ?? 0}`, 160, 90);

  ctx.font = "20px Arial";
  ctx.fillStyle = cardConfig.textColor;
  ctx.fillText(`${data.totalXp || 0} / ${((data.level ?? 0) + 1) * 1000} XP`, 160, 130);

  const progress = Math.min((data.xp || 0) / 1000, 1);
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.fillRect(160, 160, 200, 8);
  ctx.fillStyle = cardConfig.barColor;
  ctx.fillRect(160, 160, Math.floor(200 * progress), 8);

  ctx.font = "16px Arial";
  ctx.fillStyle = "#b8bfc7";
  ctx.fillText("💬", 160, 190);
  ctx.fillStyle = cardConfig.textColor;
  ctx.fillText(`${data.messages_count || 0} mensagens`, 200, 190);

  ctx.fillText("🎙️", 160, 215);
  ctx.fillStyle = cardConfig.textColor;
  ctx.fillText(`${formatDuration(data.voice_time || 0)} em call`, 200, 215);

  const sortedUsers = Object.entries(levels).filter(([id, d]) => (d.totalXp || 0) > 0).sort((a, b) => (b[1].totalXp || 0) - (a[1].totalXp || 0));
  const userRank = sortedUsers.findIndex(([id]) => id === user.id) + 1;

  ctx.font = "14px Arial";
  ctx.fillStyle = "#95a5a6";
  ctx.fillText(`🏆 Rank #${userRank || 'N/A'}`, 160, 245);

  ctx.font = "12px Arial";
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.textAlign = "right";
  ctx.fillText(cardConfig.name, 924, 272);

  return canvas.toBuffer("image/png");
}

async function getLevelRoleConfig(guildId) {
  const data = await levelRolesStore.load();
  return data[guildId] || {};
}

async function setLevelRole(guildId, nivel, roleId) {
  await levelRolesStore.update(guildId, (roles) => {
    const atual = roles || {};
    if (roleId) atual[String(nivel)] = roleId; else delete atual[String(nivel)];
    return atual;
  });
}

async function applyLevelRoles(member, nivelAnterior, novoNivel) {
  if (!member?.guild) return;
  const config = await getLevelRoleConfig(member.guild.id);
  
  let maxLevel = -1;
  let cargoNovoId = null;

  for (const [levelStr, roleId] of Object.entries(config)) {
    const lvl = parseInt(levelStr, 10);
    if (lvl <= novoNivel && lvl > maxLevel) {
      maxLevel = lvl;
      cargoNovoId = roleId;
    }
  }

  try {
    const rolesToRemove = Object.values(config).filter(rId => member.roles.cache.has(rId) && rId !== cargoNovoId);
    if (rolesToRemove.length) await member.roles.remove(rolesToRemove);
    if (cargoNovoId && !member.roles.cache.has(cargoNovoId)) await member.roles.add(cargoNovoId);
  } catch (err) {}
}

async function addXp(userId, amount = 10) {
  let res = { subiuNivel: false, novoNivel: 0, nivelAnterior: 0 };
  await levelsStore.update(userId, (current) => {
    const data = current || { xp: 0, level: 0, totalXp: 0, messages_count: 0, voice_time: 0 };
    res.nivelAnterior = data.level ?? 0;
    data.totalXp = (data.totalXp || 0) + amount;
    data.level = Math.floor(data.totalXp / 1000);
    data.xp = data.totalXp % 1000;
    if (data.level > res.nivelAnterior) { res.subiuNivel = true; res.novoNivel = data.level; }
    return data;
  });
  return res;
}

async function getLevelConfig(guildId) {
  const data = await levelConfigStore.load();
  return { xpMsgMin: 5, xpMsgMax: 15, xpVoiceMin: 20, xpVoiceMax: 40, immuneRoleIds: [], multiplierRoles: {}, ...(data[guildId] || {}) };
}

async function setLevelConfig(guildId, patch) {
  await levelConfigStore.update(guildId, (curr) => ({ ...(curr || {}), ...patch }));
}

async function addXpForMessage(member) {
  if (!member?.guild) return { subiuNivel: false, novoNivel: 0, nivelAnterior: 0 };
  const now = Date.now();
  if (now - (xpCooldowns.get(member.id) || 0) < 60000) return { subiuNivel: false, novoNivel: 0, nivelAnterior: 0 };

  const config = await getLevelConfig(member.guild.id);
  if (config.immuneRoleIds && config.immuneRoleIds.some((id) => member.roles.cache.has(id))) return { subiuNivel: false, novoNivel: 0, nivelAnterior: 0 };

  let mult = 1;
  if (config.multiplierRoles) {
      for (const [rId, m] of Object.entries(config.multiplierRoles)) if (member.roles.cache.has(rId)) { mult *= m; break; }
  }

  const min = config.xpMsgMin ?? 5;
  const max = config.xpMsgMax ?? 15;
  const xpBase = Math.floor(Math.random() * (max - min + 1)) + min;
  xpCooldowns.set(member.id, now);

  let res = { subiuNivel: false, novoNivel: 0, nivelAnterior: 0 };
  await levelsStore.update(member.id, (current) => {
    const data = current || { xp: 0, level: 0, totalXp: 0, messages_count: 0, voice_time: 0 };
    res.nivelAnterior = data.level ?? 0;
    data.totalXp = (data.totalXp || 0) + Math.floor(xpBase * mult);
    data.xp = data.totalXp % 1000;
    data.level = Math.floor(data.totalXp / 1000);
    data.messages_count = (data.messages_count || 0) + 1;
    if (data.level > res.nivelAnterior) { res.subiuNivel = true; res.novoNivel = data.level; }
    return data;
  });
  return res;
}

async function addXpForVoiceTick(member, minutos = 1) {
  if (!member?.guild) return { subiuNivel: false, novoNivel: 0, nivelAnterior: 0 };
  const config = await getLevelConfig(member.guild.id);
  if (config.immuneRoleIds && config.immuneRoleIds.some((id) => member.roles.cache.has(id))) return { subiuNivel: false, novoNivel: 0, nivelAnterior: 0 };

  let mult = 1;
  if (config.multiplierRoles) {
      for (const [rId, m] of Object.entries(config.multiplierRoles)) if (member.roles.cache.has(rId)) mult = Math.max(mult, Number(m) || 1);
  }

  const min = config.xpVoiceMin ?? 20;
  const max = config.xpVoiceMax ?? 40;
  const xpBase = Math.floor(Math.random() * (max - min + 1)) + min;
  
  const finalXp = Math.max(0, Math.round(xpBase * minutos * mult));
  const res = await addXp(member.id, finalXp);
  
  await levelsStore.update(member.id, (current) => {
    const data = current || { xp: 0, level: 0, totalXp: 0, messages_count: 0, voice_time: 0 };
    data.voice_time = (data.voice_time || 0) + (minutos * 60 * 1000);
    return data;
  });
  return res;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Sistema de níveis")
    .addSubcommand((sub) => sub.setName("view").setDescription("Verifica seu nível e XP").addUserOption((opt) => opt.setName("usuario").setDescription("Usuário")))
    .addSubcommand((sub) => sub.setName("leaderboard").setDescription("Abre o placar de líderes (Atalho)"))
    .addSubcommand((sub) => sub.setName("cards").setDescription("Gerenciar cards de rank")
        .addStringOption((opt) => opt.setName("action").setDescription("Ação").setRequired(true).addChoices({ name: "Ver meus cards", value: "view" }, { name: "Selecionar card", value: "select" }))
        .addStringOption((opt) => opt.setName("card").setDescription("ID do Card"))
    ),

  getLevelRoleConfig, setLevelRole, applyLevelRoles, addXp, addXpForMessage, addXpForVoiceTick, getLevelConfig, setLevelConfig, getUserCards, addUserCard, getCardConfig, formatDuration, getLevelsStore: () => levelsStore,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const levels = await levelsStore.load();

    if (sub === "view") {
      await interaction.deferReply();
      const user = interaction.options.getUser("usuario") || interaction.user;
      const data = levels[user.id] || { xp: 0, level: 0, totalXp: 0, messages_count: 0, voice_time: 0 };
      const buffer = await gerarCardRank(user, data, levels, interaction);
      if (!buffer) return interaction.editReply("Erro ao renderizar imagem.");
      const attachment = new AttachmentBuilder(buffer, { name: "rank.png" });
      return interaction.editReply({ files: [attachment] });
    }

    if (sub === "leaderboard") {
      return interaction.reply({ content: "Use o comando `/leaderboard ver` para ver o ranking de XP!", ephemeral: true });
    }

    if (sub === "cards") {
      const action = interaction.options.getString("action");
      const card = interaction.options.getString("card");
      const userCards = await getUserCards(interaction.user.id);

      if (action === "view") {
        return interaction.reply({ embeds: [createEmbed({ title: "Seus Cards", description: `**Equipado:** ${getCardConfig(userCards.selected).name}\n**Você possui:**\n${userCards.owned.map(c => `- ${getCardConfig(c).name} (${c})`).join("\n")}` })], ephemeral: true });
      }

      if (action === "select") {
        if (!card) return interaction.reply({ embeds: [createErrorEmbed("Especifique um card.")], ephemeral: true });
        if (!userCards.owned.includes(card) && card !== "default") return interaction.reply({ embeds: [createErrorEmbed("Você não possui este card. Compre usando `/leaderboard comprar`.")], ephemeral: true });
        await selectUserCard(interaction.user.id, card);
        return interaction.reply({ embeds: [createSuccessEmbed(`Card **${getCardConfig(card).name}** selecionado com sucesso!`)], ephemeral: true });
      }
    }
  }
};