const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

const VIP_PRICE_PER_DAY = 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Loja do servidor")
    .addSubcommand((sub) =>
      sub
        .setName("vip")
        .setDescription("Ver preços e comprar VIP")
    )
    .addSubcommand((sub) =>
        sub.setName("buy_vip").setDescription("Comprar dias de VIP").addIntegerOption(opt => opt.setName("dias").setDescription("Quantos dias?").setMinValue(1).setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const economyService = interaction.client.services.economy;
    const vipService = interaction.client.services.vip;
    const vipRoleManager = interaction.client.services.vipRole;

    if (sub === "vip") {
        await interaction.reply({
            embeds: [createEmbed({
                title: "💎 Loja VIP",
                description: "Compre acesso VIP e ganhe benefícios exclusivos!",
                fields: [
                    { name: "Preço", value: `${VIP_PRICE_PER_DAY} 🪙 por dia`, inline: true },
                    { name: "Benefícios", value: "• Cargo Exclusivo\n• Sala Privada (Voz/Texto)\n• Comandos de Família" }
                ],
                color: 0x9B59B6,
                footer: "Use /shop buy_vip [dias] para comprar"
            })]
        });
    }

    if (sub === "buy_vip") {
        const days = interaction.options.getInteger("dias");
        const cost = days * VIP_PRICE_PER_DAY;
        const userId = interaction.user.id;

        const balance = await economyService.getBalance(userId);
        if ((balance.coins || 0) < cost) {
            return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente! Você precisa de **${cost} 🪙** (Tem: ${balance.coins || 0}).`)], ephemeral: true });
        }

        // Desconta moedas
        await economyService.removeCoins(userId, cost);

        // Adiciona VIP
        // Se já for VIP, estende. Se não, cria.
        // Tier: Usa o padrão ou mantém o atual se já tiver.
        // Para novos, vamos deixar sem tier específico (null) ou pegar um default se existir lógica pra isso.
        // O addVip lida com extensão.
        
        const result = await vipService.addVip(userId, { days });
        
        // Garante cargo
        if (vipRoleManager) {
            await vipRoleManager.ensurePersonalRole(userId, { guildId: interaction.guildId });
        }

        // Log
        if (interaction.client.services.log) {
            await interaction.client.services.log.log(interaction.guild, {
                title: "🛒 Compra na Loja",
                description: `${interaction.user} comprou **${days} dias de VIP** por **${cost} 🪙**.`,
                color: 0xF1C40F,
                user: interaction.user
            });
        }

        await interaction.reply({ embeds: [createSuccessEmbed(`Você comprou **${days} dias** de VIP por **${cost} 🪙**!`)] });
    }
  }
};
