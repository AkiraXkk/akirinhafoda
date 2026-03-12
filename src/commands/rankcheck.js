const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  MessageFlags, } = require("discord.js");
const { createDataStore } = require("../store/dataStore");

const levelRolesStore = createDataStore("levelRoles.json");
const levelsStore = createDataStore("levels.json"); // Precisamos ler o XP dos membros também

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rankcheck")
    .setDescription("Ferramentas de verificação do sistema de níveis (Apenas Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("cargos")
         .setDescription("Verifica se os cargos configurados ainda existem no servidor")
    )
    .addSubcommand(sub =>
      sub.setName("membros")
         .setDescription("Sincroniza todos os membros: dá ou tira cargos de acordo com o XP real deles")
    ),

  async execute(interaction) {
    // Como a checagem pode demorar para ler todos os membros, damos um "defer"
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // Carrega o banco de dados de cargos
    const dataRoles = await levelRolesStore.load();
    const guildConfig = dataRoles[guildId] || {};
    const levels = Object.keys(guildConfig).map(Number).sort((a, b) => a - b);

    // ========================================================
    // OPÇÃO 1: APENAS VERIFICAR OS CARGOS (O que te mandei antes)
    // ========================================================
    if (sub === "cargos") {
      if (levels.length === 0) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("🔍 Verificação de Cargos de XP")
              .setColor(0xffcc00)
              .setDescription("⚠️ **Nenhum cargo de nível foi configurado neste servidor.**\nUse o comando `/rank config` para atrelar cargos aos níveis.")
          ]
        });
      }

      let validos = [];
      let invalidos = [];

      // Força a atualização do cache de cargos do servidor
      await interaction.guild.roles.fetch();

      for (const nivel of levels) {
        const roleId = guildConfig[nivel];
        const role = interaction.guild.roles.cache.get(roleId);

        if (role) {
          validos.push(`**Nível ${nivel}:** ${role} (\`${role.id}\`)`);
        } else {
          invalidos.push(`**Nível ${nivel}:** ⚠️ *Cargo não encontrado/Deletado* (\`${roleId}\`)`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("🔍 Relatório de Cargos de XP")
        .setColor(invalidos.length > 0 ? 0xff3333 : 0x57f287)
        .setDescription("Abaixo está o status atual dos cargos atrelados aos níveis de XP no seu servidor:");

      if (validos.length > 0) embed.addFields({ name: "✅ Cargos Ativos e Funcionais", value: validos.join("\n") });
      if (invalidos.length > 0) embed.addFields({ name: "❌ Cargos Inexistentes (Corrija)", value: invalidos.join("\n") + "\n\n*O bot não conseguirá entregar estes.*" });

      return interaction.editReply({ embeds: [embed] });
    }

    // ========================================================
    // OPÇÃO 2: SINCRONIZAR O SERVIDOR INTEIRO (XP x Cargos)
    // ========================================================
    if (sub === "membros") {
      if (levels.length === 0) {
        return interaction.editReply("❌ Nenhum cargo configurado para níveis neste servidor. Use `/rank config` primeiro.");
      }

      // Carrega o banco de XP de todos e puxa todos os membros reais do Discord
      const allLevels = await levelsStore.load();
      await interaction.guild.members.fetch(); 

      let atualizados = 0;
      let corretos = 0;
      let falhas = 0;

      const todosCargosConfigurados = Object.values(guildConfig);

      // Varre membro por membro
      for (const member of interaction.guild.members.cache.values()) {
        if (member.user.bot) continue;

        const userData = allLevels[member.id];
        // Pega o nível atual da pessoa (se não tiver dados, é nível 0)
        const userLevel = userData ? (userData.level ?? 0) : 0;

        // Descobre qual é o ÚNICO cargo que a pessoa DEVE ter baseado no nível atual
        let cargoEsperadoId = null;
        let maiorNivelAlcancado = -1;

        for (const [lvlStr, roleId] of Object.entries(guildConfig)) {
          const lvl = parseInt(lvlStr, 10);
          if (lvl <= userLevel && lvl > maiorNivelAlcancado) {
            maiorNivelAlcancado = lvl;
            cargoEsperadoId = roleId;
          }
        }

        let precisaAtualizar = false;
        const cargosParaRemover = [];
        const cargosParaAdicionar = [];

        // 1. Verifica se ele NÃO TEM o cargo que deveria ter
        if (cargoEsperadoId && !member.roles.cache.has(cargoEsperadoId)) {
          cargosParaAdicionar.push(cargoEsperadoId);
          precisaAtualizar = true;
        }

        // 2. Verifica se ele TEM cargos de outros níveis que já passou ou que ainda não alcançou
        for (const roleId of todosCargosConfigurados) {
          if (roleId !== cargoEsperadoId && member.roles.cache.has(roleId)) {
            cargosParaRemover.push(roleId);
            precisaAtualizar = true;
          }
        }

        // 3. Aplica as mudanças no Discord
        if (precisaAtualizar) {
          try {
            if (cargosParaRemover.length > 0) await member.roles.remove(cargosParaRemover);
            if (cargosParaAdicionar.length > 0) await member.roles.add(cargosParaAdicionar);
            atualizados++;
          } catch (e) {
            // Pode falhar se o membro for dono do servidor ou tiver cargo acima do bot
            falhas++;
          }
        } else {
          // Se o usuário tem algum dado de XP, conta como "já estava correto"
          if (userData) corretos++;
        }
      }

      // Monta o relatório final
      const embed = new EmbedBuilder()
        .setTitle("🔄 Sincronização de Membros Concluída")
        .setColor(0x57f287)
        .setDescription(`A varredura completa no servidor foi finalizada! O bot arrumou todos os cargos baseado na matemática nova.`)
        .addFields(
          { name: "✅ Membros Atualizados", value: `${atualizados} membro(s) receberam ou perderam cargos.`, inline: false },
          { name: "👌 Já estavam corretos", value: `${corretos} membro(s) já estavam perfeitos.`, inline: false }
        );

      if (falhas > 0) {
        embed.addFields({ name: "⚠️ Falhas de Permissão", value: `O bot não conseguiu alterar os cargos de ${falhas} membro(s) (provavelmente são donos ou tem cargos acima do bot).`, inline: false });
      }

      return interaction.editReply({ embeds: [embed] });
    }
  }
};