const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  ComponentType
} = require("discord.js");

// Tabela de Hierarquia (Peso dos Cargos)
const HIERARQUIA = {
  "Chefe": 60,
  "Sub-Chefe": 50,
  "Gerente": 40,
  "Coordenador": 30,
  "Supervisores": 20,
  "Equipe Recrutamento": 10, // Recrutador base
  // Áreas e Staff Geral têm peso 5 (qualquer liderança ou recrutador pode gerenciar)
  "Equipe Divulgação": 5, "Equipe Eventos": 5, "Equipe MovCall": 5, "Equipe MovChat": 5, 
  "Equipe Acolhimento": 5, "Equipe Design": 5, "Equipe Pastime": 5, "Staff Geral": 5
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recrutamento")
    .setDescription("Painel hierárquico para contratar, promover ou demitir membros")
    .addUserOption(option => 
      option.setName("membro")
        .setDescription("Selecione o membro que deseja gerenciar")
        .setRequired(true)),

  async execute(interaction) {
    const alvo = interaction.options.getMember("membro");
    const executor = interaction.member;

    if (!alvo) return interaction.reply({ content: "❌ Membro não encontrado no servidor.", ephemeral: true });

    // Calcula o rank máximo de quem usou o comando
    let pesoExecutor = 0;
    executor.roles.cache.forEach(role => {
      if (HIERARQUIA[role.name] && HIERARQUIA[role.name] > pesoExecutor) {
        pesoExecutor = HIERARQUIA[role.name];
      }
    });

    if (pesoExecutor === 0 && !executor.permissions.has("Administrator")) {
      return interaction.reply({ content: "❌ Você não tem permissão para usar este painel.", ephemeral: true });
    }

    // Calcula o rank máximo do alvo
    let pesoAlvo = 0;
    alvo.roles.cache.forEach(role => {
      if (HIERARQUIA[role.name] && HIERARQUIA[role.name] > pesoAlvo) {
        pesoAlvo = HIERARQUIA[role.name];
      }
    });

    // Trava de segurança: Não pode gerenciar alguém do mesmo nível ou superior
    if (pesoAlvo >= pesoExecutor && !executor.permissions.has("Administrator")) {
      return interaction.reply({ content: "❌ **Acesso Negado:** Você não pode gerenciar um membro que possui um cargo de nível igual ou superior ao seu.", ephemeral: true });
    }

    // Função para construir o painel atualizado
    const buildPanel = () => {
      const embed = new EmbedBuilder()
        .setTitle("🫡 Painel de Gestão WDA")
        .setColor("#ff9ff3")
        .setDescription(`Gerenciando: ${alvo.user}\nExecutor: ${executor.user}\n\nSelecione no menu abaixo os cargos que deseja **Adicionar** ou **Remover** deste membro.`)
        .setFooter({ text: "Apenas cargos abaixo da sua hierarquia estão visíveis." });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_roles")
        .setPlaceholder("Selecione um cargo para alternar...")
        .setMinValues(1)
        .setMaxValues(1);

      // Adiciona apenas as opções que o executor tem permissão para dar (Peso menor que o dele)
      let optionsAdded = 0;
      for (const [roleName, peso] of Object.entries(HIERARQUIA)) {
        if (peso < pesoExecutor || executor.permissions.has("Administrator")) {
          const roleNaGuild = interaction.guild.roles.cache.find(r => r.name === roleName);
          if (roleNaGuild) {
            const temCargo = alvo.roles.cache.has(roleNaGuild.id);
            selectMenu.addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel(roleName)
                .setDescription(temCargo ? "🟢 Atualmente possui (Clique para Remover)" : "🔴 Não possui (Clique para Adicionar)")
                .setValue(roleNaGuild.id)
            );
            optionsAdded++;
          }
        }
      }

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return { embeds: [embed], components: optionsAdded > 0 ? [row] : [] };
    };

    const resposta = await interaction.reply({ ...buildPanel(), ephemeral: false, fetchReply: true });

    // Coletor para escutar quando ele escolhe algo no menu
    const collector = resposta.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: "❌ Este painel não é seu.", ephemeral: true });
      }

      const roleId = i.values[0];
      const role = interaction.guild.roles.cache.get(roleId);

      if (alvo.roles.cache.has(roleId)) {
        await alvo.roles.remove(roleId).catch(()=>{});
        await i.reply({ content: `✅ Cargo **${role.name}** removido de ${alvo.user}.`, ephemeral: true });
      } else {
        await alvo.roles.add(roleId).catch(()=>{});
        await i.reply({ content: `✅ Cargo **${role.name}** adicionado a ${alvo.user}.`, ephemeral: true });
      }

      // Atualiza o painel para mostrar a bolinha Verde/Vermelha correta
      await interaction.editReply(buildPanel());
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(()=>{});
    });
  }
};