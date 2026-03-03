const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const levelsStore = createDataStore("levels.json");
const levelRolesStore = createDataStore("levelRoles.json");
const levelConfigStore = createDataStore("levelConfig.json");

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
    const data = current || { xp: 0, level: 1, totalXp: 0 };
    nivelAnterior = data.level;
    
    // Adicionar ao XP total
    data.totalXp = (data.totalXp || 0) + amount;
    
    // Calcular novo nível baseado no XP total
    const novoNivelCalculado = Math.floor(data.totalXp / 100) + 1;
    
    // Calcular XP para o nível atual
    data.xp = data.totalXp % 100;
    data.level = novoNivelCalculado;
    
    // Verificar se subiu de nível
    if (novoNivelCalculado > nivelAnterior) {
      subiuNivel = true;
      novoNivel = novoNivelCalculado;
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

  const quantidade = Math.max(0, Math.round((config.xpPerMessage || 10) * fator));
  const resultado = await addXp(member.id, quantidade);

  await levelsStore.update(member.id, (current) => {
    const dados = current || { xp: 0, level: 1 };
    dados.messages = (dados.messages || 0) + 1;
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
    const dados = current || { xp: 0, level: 1 };
    dados.voiceMs = (dados.voiceMs || 0) + incrementoMs;
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
          opt.setName("xp_msg").setDescription("XP base por mensagem").setMinValue(0).setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt.setName("xp_voz").setDescription("XP base por minuto em call").setMinValue(0).setRequired(false)
        )
        .addRoleOption((opt) =>
          opt.setName("cargo_imune").setDescription("Cargo que não ganha XP").setRequired(false)
        )
        .addRoleOption((opt) =>
          opt.setName("cargo_multiplicador").setDescription("Cargo com bônus de XP").setRequired(false)
        )
        .addNumberOption((opt) =>
          opt
            .setName("fator")
            .setDescription("Multiplicador de XP para o cargo")
            .setMinValue(0.1)
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
    ),

  getLevelRoleConfig,
  setLevelRole,
  applyLevelRoles,
  addXp,
  addXpForMessage,
  addXpForVoiceTick,
  getLevelConfig,
  setLevelConfig,
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
      const user = interaction.options.getUser("usuario") || interaction.user;
      const data = levels[user.id] || { xp: 0, level: 1, totalXp: 0 };
      const xpNeeded = data.level * 100;
      const progress = Math.min(data.xp / xpNeeded, 1);
      const filled = Math.floor(progress * 10);
      const bar = "🟦".repeat(filled) + "⬜".repeat(10 - filled);
      const totalMensagens = data.messages || 0;
      const totalVoiceMs = data.voiceMs || 0;
      const totalMinutos = Math.floor(totalVoiceMs / 60000);

      return interaction.reply({
        embeds: [
          createEmbed({
            title: `🌟 Nível de ${user.username}`,
            fields: [
              { name: "Nível", value: `${data.level}`, inline: true },
              { name: "XP Total", value: `${data.totalXp || 0}`, inline: true },
              { name: "Progresso", value: `${data.xp}/${xpNeeded} XP\n${bar}` },
              { name: "Mensagens", value: `${totalMensagens}`, inline: true },
              { name: "Tempo em call", value: `${totalMinutos} min`, inline: true },
            ],
            thumbnail: user.displayAvatarURL(),
            color: 0x9b59b6,
          }),
        ],
      });
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
