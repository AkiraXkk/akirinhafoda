const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType,
  MessageFlags, } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName("bicho")
        .setDescription("Aposte no Jogo do Bicho!"),

    async execute(interaction) {
        const { economy: eco } = interaction.client.services;
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        
        // --- MODO INTERATIVO ---
        const mainEmbed = createEmbed({
            title: "🎰 Banca do Jogo do Bicho",
            description: "Bem-vindo à banca mais confiável do servidor! 🦁\n\nEscolha uma opção abaixo para começar.",
            fields: [
                { name: "💰 Prêmios", value: "• **Cabeça (1º)**: 18x o valor\n• **Cercado (2º-5º)**: 3x o valor", inline: false }
            ],
            color: 0xF1C40F, // Gold
            user: interaction.user
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('bicho_apostar')
                .setLabel('Fazer Aposta')
                .setEmoji('🎲')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('bicho_saldo')
                .setLabel('Meu Saldo')
                .setEmoji('💰')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('bicho_tabela')
                .setLabel('Tabela de Bichos')
                .setEmoji('📜')
                .setStyle(ButtonStyle.Primary)
        );

        const response = await interaction.reply({ 
            embeds: [mainEmbed], 
            components: [row],
            flags: MessageFlags.Ephemeral
        });

        // Collector para botões
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: 120000 
        });

        collector.on('collect', async i => {
            if (i.user.id !== userId) {
                return i.reply({ content: "Esse painel não é para você!", flags: MessageFlags.Ephemeral });
            }

            if (i.customId === 'bicho_saldo') {
                const bal = await eco.getBalance(guildId, userId);
                await i.reply({ content: `💰 Seu saldo atual: **${bal.coins || 0}** moedas`, flags: MessageFlags.Ephemeral });
            }

            if (i.customId === 'bicho_tabela') {
                const tabelaEmbed = createEmbed({
                    title: "📜 Tabela do Bicho",
                    description: animals.map(a => `**${a.id}**. ${a.emoji} ${a.name}`).join('\n'),
                    color: 0x3498db
                });
                await i.reply({ embeds: [tabelaEmbed], flags: MessageFlags.Ephemeral });
            }

            if (i.customId === 'bicho_apostar') {
                // Criar Select Menu
                const selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('bicho_select')
                        .setPlaceholder('Escolha o animal para apostar...')
                        .addOptions(
                            animals.map(a => ({
                                label: `${a.id}. ${a.name}`,
                                value: a.id.toString(),
                                emoji: a.emoji,
                                description: `Grupo ${a.id}`
                            }))
                        )
                );

                const selectMsg = await i.reply({ 
                    content: "Selecione o bicho em que deseja apostar:", 
                    components: [selectRow], 
                    flags: MessageFlags.Ephemeral,
                    fetchReply: true
                });

                // Collector para Select Menu (dentro do botão)
                const selectCollector = selectMsg.createMessageComponentCollector({
                    componentType: ComponentType.StringSelect,
                    time: 60000,
                    max: 1
                });

                selectCollector.on('collect', async s => {
                    if (s.user.id !== userId) return;

                    const animalId = parseInt(s.values[0]);
                    const animal = animals.find(a => a.id === animalId);

                    // Modal para valor
                    const modal = new ModalBuilder()
                        .setCustomId(`bicho_modal_${animalId}`)
                        .setTitle(`Apostar no ${animal.name}`);

                    const valorInput = new TextInputBuilder()
                        .setCustomId('valor_aposta')
                        .setLabel("Valor da aposta")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder("Ex: 100")
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(10);

                    const modalRow = new ActionRowBuilder().addComponents(valorInput);
                    modal.addComponents(modalRow);

                    await s.showModal(modal);

                    // O modal é tratado via interactionCreate global normalmente, mas
                    // como estamos num comando isolado, precisamos de um listener ou esperar
                    // que o usuário envie. O Discord.js não tem "awaitModalSubmit" direto no collector.
                    // Vamos usar interaction.awaitModalSubmit no contexto da interação original se possível,
                    // ou aguardar o evento. A melhor forma aqui é usar s.awaitModalSubmit.
                    
                    try {
                        const modalSubmission = await s.awaitModalSubmit({
                            time: 60000,
                            filter: (m) => m.customId === `bicho_modal_${animalId}` && m.user.id === userId
                        });

                        const valorRaw = modalSubmission.fields.getTextInputValue('valor_aposta');
                        const valor = parseInt(valorRaw);

                        if (isNaN(valor) || valor <= 0) {
                            return modalSubmission.reply({ content: "❌ Valor inválido! Digite um número inteiro positivo.", flags: MessageFlags.Ephemeral });
                        }

                        // Executar o jogo
                        await runGame(modalSubmission, animalId, valor, eco, guildId, userId);

                    } catch (err) {
                        // Timeout ou erro
                    }
                });
            }
        });
    }
};

// Função auxiliar para rodar a lógica do jogo (usada tanto no slash quanto no modal)
async function runGame(interaction, grupoAposta, valorAposta, eco, guildId, userId) {
    // Verificar saldo
    const balance = await eco.getBalance(guildId, userId);
    if ((balance.coins || 0) < valorAposta) {
        const errorEmbed = createErrorEmbed(`Você não tem moedas suficientes! Seu saldo: **${balance.coins || 0}** 🪙`);
        if (interaction.isRepliable() && !interaction.replied) {
            return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        } else {
            return interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }

    // Se for modal, precisamos responder ao defer ou reply
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
    }

    // Animação de suspense
    const suspenseEmbed = createEmbed({
        title: "🎰 Sorteando...",
        description: "A roleta está girando! 🎲",
        color: 0xF1C40F
    });
    
    const msg = await interaction.editReply({ embeds: [suspenseEmbed], components: [] }); // Remove componentes se houver

    // Delay dramático (2 segundos)
    await new Promise(r => setTimeout(r, 2000));

    // Remover moedas da aposta
    await eco.removeCoins(guildId, userId, valorAposta);

    // Sortear 5 números
    const resultados = [];
    for (let i = 0; i < 5; i++) {
        const numero = Math.floor(Math.random() * 10000); // 0000 a 9999
        const grupo = getGroup(numero);
        const animal = animals.find(a => a.id === grupo);
        resultados.push({ numero, grupo, animal });
    }

    // Verificar vitória
    let premio = 0;
    let mensagemResultado = "";
    let ganhou = false;

    const primeiroResultado = resultados[0];
    
    if (primeiroResultado.grupo === grupoAposta) {
        premio = valorAposta * 18;
        ganhou = true;
        mensagemResultado = `🎉 **PARABÉNS!** Deu **${primeiroResultado.animal.name}** na cabeça!`;
    } else {
        const acertouCercado = resultados.slice(1).some(r => r.grupo === grupoAposta);
        if (acertouCercado) {
            premio = valorAposta * 3;
            ganhou = true;
            mensagemResultado = `👍 Você acertou no cercado (2º ao 5º prêmio)!`;
        } else {
            mensagemResultado = "😢 Não foi dessa vez. Tente novamente!";
        }
    }

    if (ganhou && premio > 0) {
        await eco.addCoins(guildId, userId, premio);
    }

    const animalApostado = animals.find(a => a.id === grupoAposta);
    
    const resultEmbed = createEmbed({
        title: "🎰 Jogo do Bicho - Resultado",
        description: `Você apostou **${valorAposta} 🪙** no grupo **${grupoAposta} - ${animalApostado.emoji} ${animalApostado.name}**\n\n${mensagemResultado}`,
        color: ganhou ? 0x2ecc71 : 0xe74c3c,
        fields: [
            { name: "1º Prêmio (Cabeça)", value: `\`${resultados[0].numero.toString().padStart(4, '0')}\` - ${resultados[0].animal.emoji} **${resultados[0].animal.name}**` },
            { name: "2º Prêmio", value: `\`${resultados[1].numero.toString().padStart(4, '0')}\` - ${resultados[1].animal.emoji} ${resultados[1].animal.name}`, inline: true },
            { name: "3º Prêmio", value: `\`${resultados[2].numero.toString().padStart(4, '0')}\` - ${resultados[2].animal.emoji} ${resultados[2].animal.name}`, inline: true },
            { name: "4º Prêmio", value: `\`${resultados[3].numero.toString().padStart(4, '0')}\` - ${resultados[3].animal.emoji} ${resultados[3].animal.name}`, inline: true },
            { name: "5º Prêmio", value: `\`${resultados[4].numero.toString().padStart(4, '0')}\` - ${resultados[4].animal.emoji} ${resultados[4].animal.name}`, inline: true },
        ],
        footer: ganhou ? `Você ganhou ${premio} moedas!` : "Boa sorte na próxima!",
        user: interaction.user
    });

    await interaction.editReply({ embeds: [resultEmbed] });
}
