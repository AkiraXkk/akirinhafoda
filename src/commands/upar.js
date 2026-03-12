const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");

// Tabela Estrita de Ranks e Pesos (Do maior pro menor)
const RANK_HIERARQUIA = {
  "Chefe": 60,
  "Sub-Chefe": 50,
  "Gerente": 40,
  "Coordenador": 30,
  "Supervisores": 20,
  "Aspirante": 10
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("upar")
    .setDescription("Painel de promoção de Ranks e Liderança")
    .addUserOption(option => 
      option.setName("membro")
        .setDescription("Membro que será promovido ou rebaixado")
        .setRequired(true)),

  async execute(interaction) {
    const alvo = interaction.options.getMember("membro");
    const executor = interaction.member;

    if (!alvo) return interaction.reply({ content: "❌ Membro não encontrado.", flags: MessageFlags.Ephemeral });

    // Calcula o rank máximo do Executor
    let pesoExecutor = 0;
    executor.roles.cache.forEach(role => {
      if (RANK_HIERARQUIA[role.name] && RANK_HIERARQUIA[role.name] > pesoExecutor) {
        pesoExecutor = RANK_HIERARQUIA[role.name];
      }
    });

    if (pesoExecutor === 0 && !executor.permissions.has("Administrator")) {
      return interaction.reply({ content: "❌ **Acesso Negado:** Apenas membros da Liderança podem promover staffs.", flags: MessageFlags.Ephemeral });
    }

    // Calcula o rank máximo do Alvo
    let pesoAlvo = 0;
    alvo.roles.cache.forEach(role => {
      if (RANK_HIERARQUIA[role.name] && RANK_HIERARQUIA[role.name] > pesoAlvo) {
        pesoAlvo = RANK_HIERARQUIA[role.name];
      }
    });

    if (pesoAlvo >= pesoExecutor && !executor.permissions.has("Administrator")) {
      return interaction.reply({ content: "❌ **Hierarquia:** Você não pode alterar o rank de alguém que está no mesmo nível ou acima de você.", flags: MessageFlags.Ephemeral });
    }

    const buildRankPanel = () => {
      const embed = new EmbedBuilder()
        .setTitle("🏆 Promoção de Ranks WDA")
        .setColor("#ffd700")
        .setDescription(`Staff: ${alvo.user}\nAutoridade: ${executor.user}\n\nUtilize o menu abaixo para promover (ou rebaixar) este membro na hierarquia do servidor.`)
        .setFooter({ text: "O sistema bloqueia ranks superiores ao seu nível atual." });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_rank_upar")
        .setPlaceholder("Selecione a patente...")
        .setMinValues(1)
        .setMaxValues(1);

      let optionsAdded = 0;
      for (const [rankName, peso] of Object.entries(RANK_HIERARQUIA)) {
        // Regra de Ouro: Só pode dar ranks estritamente MENORES que o do executor
        if (peso < pesoExecutor || executor.permissions.has("Administrator")) {
          const roleNaGuild = interaction.guild.roles.cache.find(r => r.name === rankName || (rankName === "Aspirante" && r.id === "1097700110126809140"));
          
          if (roleNaGuild) {
            const temCargo = alvo.roles.cache.has(roleNaGuild.id);
            selectMenu.addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel(rankName)
                .setDescription(temCargo ? "🟢 Cargo Atual (Clique para Remover)" : "⬆️ Promover para este Rank")
                .setValue(roleNaGuild.id)
            );
            optionsAdded++;
          }
        }
      }

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return { embeds: [embed], components: optionsAdded > 0 ? [row] : [] };
    };

    const msg = await interaction.reply({ ...buildRankPanel(), fetchReply: true });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ Você não tem permissão para usar isso.", flags: MessageFlags.Ephemeral });

      const roleId = i.values[0];
      const role = interaction.guild.roles.cache.get(roleId);

      if (alvo.roles.cache.has(roleId)) {
        await alvo.roles.remove(roleId).catch(()=>{});
        await i.reply({ content: `✅ Rank **${role.name}** removido de ${alvo.user}.`, flags: MessageFlags.Ephemeral });
      } else {
        // DICA: Você poderia colocar uma lógica aqui para remover os ranks antigos se quisesse,
        // mas o sistema de adicionar/remover dá mais controle ao gerente!
        await alvo.roles.add(roleId).catch(()=>{});
        await i.reply({ content: `🎉 Sucesso! ${alvo.user} acaba de ser promovido(a) ao rank de **${role.name}**!`, flags: MessageFlags.Ephemeral });
      }

      await interaction.editReply(buildRankPanel());
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(()=>{});
    });
  }
};
