const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

const SUITS = ["♠", "♥", "♦", "♣"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const QUICK_BETS = [100, 500, 1000];
const FOOTER_TEXT = "WDA - Todos os direitos reservados";

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function createDeck() {
    let deck = [];
    for (const suit of SUITS) {
        for (const value of VALUES) {
            let weight = parseInt(value);
            if (value === "J" || value === "Q" || value === "K") weight = 10;
            if (value === "A") weight = 11;
            deck.push({ value, suit, weight });
        }
    }
    return shuffleDeck(deck);
}

function calculateScore(hand) {
    let score = 0;
    let aces = 0;

    for (const card of hand) {
        score += card.weight;
        if (card.value === "A") aces++;
    }

    while (score > 21 && aces > 0) {
        score -= 10;
        aces--;
    }

    return score;
}

function formatHand(hand, hideSecond = false) {
    if (hideSecond) {
        return `\`${hand[0].value}${hand[0].suit}\`  \`🎴 ??\``;
    }
    return hand.map(c => `\`${c.value}${c.suit}\``).join("  ");
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("blackjack")
        .setDescription("Aposte no Blackjack!")
        .addIntegerOption((opt) =>
            opt
                .setName("aposta")
                .setDescription("Valor da aposta para iniciar direto")
                .setMinValue(1)
                .setRequired(false)
        ),

    async execute(interaction) {
        const { economy: eco } = interaction.client.services;
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const directBet = interaction.options.getInteger("aposta");

        if (directBet) {
            return runGame(interaction, directBet, eco, guildId, userId);
        }

        const mainEmbed = createEmbed({
            title: "🃏 Blackjack",
            description: "Bem-vindo à mesa VIP.\nChegue o mais perto de **21** sem estourar e vença o dealer.",
            color: 0x8e44ad,
            thumbnail: "https://cdn-icons-png.flaticon.com/512/6556/6556073.png",
            fields: [
                { name: "💸 Pagamentos", value: "Vitória: **2x**\nBlackjack natural: **2.5x**\nEmpate: **aposta devolvida**", inline: true },
                { name: "🎮 Como jogar", value: "Use aposta rápida, aposta personalizada ou `/blackjack aposta:valor`", inline: true }
            ],
            footer: { text: FOOTER_TEXT }
        });

        const rowMain = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('bj_play_custom')
                .setLabel('Aposta Personalizada')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎮'),
            new ButtonBuilder()
                .setCustomId('bj_rules_btn')
                .setLabel('Regras')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📜')
        );

        const rowQuick = new ActionRowBuilder().addComponents(
            ...QUICK_BETS.map((value) =>
                new ButtonBuilder()
                    .setCustomId(`bj_quick_${value}`)
                    .setLabel(`${value} 🪙`)
                    .setStyle(ButtonStyle.Primary)
            )
        );

        await interaction.reply({
            embeds: [mainEmbed],
            components: [rowMain, rowQuick],
            ephemeral: true
        });
        const response = await interaction.fetchReply();

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.user.id !== userId) return i.reply({ content: "Não é seu jogo!", ephemeral: true });

            if (i.customId === 'bj_rules_btn') {
                await i.reply({ 
                    content: "**Regras:**\n1. Ás vale 1 ou 11.\n2. Figuras (J,Q,K) valem 10.\n3. Dealer para no 17.\n4. Blackjack paga 3:2.\n5. Dobrar só na primeira mão.", 
                    ephemeral: true 
                });
            }

            if (i.customId.startsWith('bj_quick_')) {
                collector.stop("started");
                const value = parseInt(i.customId.split("_")[2], 10);
                return runGame(i, value, eco, guildId, userId);
            }

            if (i.customId === 'bj_play_custom') {
                const modal = new ModalBuilder()
                    .setCustomId('bj_bet_modal')
                    .setTitle('Apostar no Blackjack');

                const input = new TextInputBuilder()
                    .setCustomId('bj_bet_value')
                    .setLabel('Quanto quer apostar?')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex: 100')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);

                try {
                    const submission = await i.awaitModalSubmit({
                        time: 60000,
                        filter: (m) => m.customId === 'bj_bet_modal' && m.user.id === userId
                    });

                    const value = parseInt(submission.fields.getTextInputValue('bj_bet_value'));
                    if (isNaN(value) || value <= 0) {
                        return submission.reply({ content: "Valor inválido!", ephemeral: true });
                    }

                    collector.stop("started");
                    await runGame(submission, value, eco, guildId, userId);

                } catch (e) {
                    if (!i.replied && !i.deferred) {
                        await i.followUp({ content: "Tempo esgotado para enviar a aposta. Clique em **Jogar Agora** novamente.", ephemeral: true }).catch(() => {});
                    }
                }
            }
        });
    }
};

async function runGame(interaction, bet, eco, guildId, userId) {
    const originalBet = bet;
    const balance = await eco.getBalance(guildId, userId);
    if ((balance.coins || 0) < bet) {
        const insufficient = { embeds: [createErrorEmbed(`Saldo insuficiente! Você tem **${balance.coins || 0}** 🪙`)], ephemeral: true };
        if (interaction.replied || interaction.deferred) return interaction.followUp(insufficient).catch(() => {});
        return interaction.reply(insufficient);
    }

    let totalDebited = 0;
    let gameResolved = false;
    let actionLock = false;

    try {
        await eco.removeCoins(guildId, userId, originalBet);
        totalDebited = bet;

        if (interaction.isButton()) {
            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        } else if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "🎲 Embaralhando cartas...", ephemeral: true });
        }

        let deck = createDeck();
        let playerHand = [deck.pop(), deck.pop()];
        let dealerHand = [deck.pop(), deck.pop()];
        let isDoubled = false;

        let playerScore = calculateScore(playerHand);
        let dealerScore = calculateScore(dealerHand);

        if (playerScore === 21) {
            if (dealerScore === 21) {
                await eco.addCoins(guildId, userId, bet);
                gameResolved = true;
                return interaction.editReply({
                    content: null,
                    embeds: [createEmbed({
                        title: "🤝 PUSH! Ambos com Blackjack",
                        description: "Você e o dealer tiraram Blackjack natural. A aposta foi devolvida.",
                        fields: [
                            { name: "Sua Mão", value: formatHand(playerHand), inline: true },
                            { name: "Mão do Dealer", value: formatHand(dealerHand), inline: true }
                        ],
                        color: 0xf1c40f,
                        thumbnail: "https://cdn-icons-png.flaticon.com/512/6556/6556073.png",
                        footer: { text: FOOTER_TEXT }
                    })],
                    components: []
                });
            }

            const winAmount = Math.ceil(bet * 2.5);
            await eco.addCoins(guildId, userId, winAmount);
            gameResolved = true;
            const embedBJ = createEmbed({
                title: "👑 BLACKJACK NATURAL!",
                description: "Você tirou 21 logo de cara! Parabéns!",
                fields: [
                    { name: "Sua Mão", value: formatHand(playerHand), inline: true },
                    { name: "Lucro", value: `+${Math.ceil(bet * 1.5)} 🪙`, inline: true }
                ],
                color: 0xf1c40f,
                thumbnail: "https://cdn-icons-png.flaticon.com/512/6556/6556073.png",
                footer: { text: FOOTER_TEXT }
            });

            return interaction.editReply({ content: null, embeds: [embedBJ], components: [] });
        }

    // Função para gerar o Embed do jogo
        const getGameEmbed = (status = "playing", resultMsg = "") => {
        const isGameOver = status !== "playing";
        const pScore = calculateScore(playerHand);
        const dScore = isGameOver ? calculateScore(dealerHand) : "?";

        let color = 0x2f3136; 
        if (status === "won") color = 0x2ecc71; 
        if (status === "lost") color = 0xe74c3c; 
        if (status === "push") color = 0xf1c40f; 
        if (status === "surrender") color = 0x95a5a6; 

        const embed = createEmbed({
            title: isGameOver ? resultMsg : "🎰 Mesa de Blackjack",
            color: color,
            fields: [
                { 
                    name: `👤 ${interaction.user.username} • **${pScore}**`, 
                    value: `> ${formatHand(playerHand)}`, 
                    inline: false 
                },
                { 
                    name: `🎩 Dealer • **${dScore}**`, 
                    value: `> ${formatHand(dealerHand, !isGameOver)}`, 
                    inline: false 
                },
                {
                    name: "💰 Aposta",
                    value: `**${bet}** 🪙 ${isDoubled ? "• Dobrada" : ""}`,
                    inline: true
                }
            ],
            thumbnail: isGameOver ? "https://media1.tenor.com/m/Xf7Lp9-3uKAAAAAC/kakegurui-yumeko-jabami.gif" : "https://cdn-icons-png.flaticon.com/512/10603/10603460.png",
            footer: isGameOver ? { text: `Jogo encerrado • ${FOOTER_TEXT}` } : { text: `Sua vez! Escolha uma ação: • ${FOOTER_TEXT}` }
        });
        return embed;
    };

    // Botões de Jogo
    const getButtons = (canDouble = true) => {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('bj_hit').setLabel('Comprar').setStyle(ButtonStyle.Success).setEmoji('🃏'),
                new ButtonBuilder().setCustomId('bj_stand').setLabel('Parar').setStyle(ButtonStyle.Secondary).setEmoji('🛑'),
                new ButtonBuilder().setCustomId('bj_double').setLabel('Dobrar (2x)').setStyle(ButtonStyle.Primary).setEmoji('💰').setDisabled(!canDouble),
                new ButtonBuilder().setCustomId('bj_surrender').setLabel('Desistir').setStyle(ButtonStyle.Danger).setEmoji('🏳️')
            );
        return [row];
    };

    // Atualiza a mensagem inicial para a mesa de jogo
        const msg = await interaction.editReply({
            content: null,
            embeds: [getGameEmbed()],
            components: getButtons(true),
            ephemeral: true
        });

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === userId,
            time: 120000
        });

        collector.on('collect', async i => {
        if (actionLock) {
            return i.reply({ content: "Aguarde a ação atual finalizar.", ephemeral: true });
        }
        actionLock = true;
        try {
        // --- HIT ---
        if (i.customId === 'bj_hit') {
            if (deck.length === 0) deck = createDeck();
            playerHand.push(deck.pop());
            playerScore = calculateScore(playerHand);

            if (playerScore > 21) {
                await endGame(i, "lost", "💥 Você estourou (Bust)!");
            } else if (playerScore === 21) {
                await dealerTurn(i); 
            } else {
                await i.update({ embeds: [getGameEmbed()], components: getButtons(false) });
            }
        }

        // --- STAND ---
        if (i.customId === 'bj_stand') {
            await dealerTurn(i);
        }

        // --- DOUBLE ---
        if (i.customId === 'bj_double') {
            const currentBal = await eco.getBalance(guildId, userId);
            if ((currentBal.coins || 0) < bet) {
                return i.reply({ content: "Saldo insuficiente para dobrar!", ephemeral: true });
            }

            await eco.removeCoins(guildId, userId, bet);
            totalDebited += bet;
            bet *= 2;
            isDoubled = true;

            if (deck.length === 0) deck = createDeck();
            playerHand.push(deck.pop());
            playerScore = calculateScore(playerHand);

            if (playerScore > 21) {
                await endGame(i, "lost", "💥 Você dobrou e estourou!");
            } else {
                await dealerTurn(i);
            }
        }

        // --- SURRENDER ---
        if (i.customId === 'bj_surrender') {
            const refund = Math.floor(bet / 2);
            await eco.addCoins(guildId, userId, refund);
            await endGame(i, "surrender", `🏳️ Você desistiu. Recuperou ${refund} moedas.`);
        }
        } finally {
            actionLock = false;
        }
    });

        collector.on('end', async (_, reason) => {
        if (reason === 'time') {
            if (!gameResolved && totalDebited > 0) {
                await eco.addCoins(guildId, userId, totalDebited);
                gameResolved = true;
            }
            await interaction.editReply({ content: "⏱️ Tempo esgotado! A aposta foi devolvida.", components: [] });
        }
    });

    async function dealerTurn(i) {
        while (calculateScore(dealerHand) < 17) {
            if (deck.length === 0) deck = createDeck();
            dealerHand.push(deck.pop());
        }
        dealerScore = calculateScore(dealerHand);

        let status = "lost";
        let message = "";

        if (dealerScore > 21) {
            status = "won";
            message = "🎉 O Dealer estourou! Você ganhou!";
        } else if (dealerScore > playerScore) {
            status = "lost";
            message = "💸 O Dealer venceu!";
        } else if (dealerScore < playerScore) {
            status = "won";
            message = "🎉 Você venceu o Dealer!";
        } else {
            status = "push";
            message = "🤝 Empate (Push)!";
        }

        await endGame(i, status, message);
    }

    async function endGame(i, status, message) {
        collector.stop("finished");

        if (status === "won") {
            await eco.addCoins(guildId, userId, bet * 2);
        } else if (status === "push") {
            await eco.addCoins(guildId, userId, bet);
        }
        gameResolved = true;

        await i.update({
            content: null,
            embeds: [getGameEmbed(status, message)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("bj_again")
                        .setLabel(`Jogar novamente (${originalBet} 🪙)`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("🔁")
                )
            ]
        });

        const replayCollector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (btn) => btn.user.id === userId && btn.customId === "bj_again",
            time: 60000,
            max: 1
        });

        replayCollector.on("collect", async (btn) => {
            await runGame(btn, originalBet, eco, guildId, userId);
        });

        replayCollector.on("end", async (_, reason) => {
            if (reason === "time") {
                await interaction.editReply({ components: [] }).catch(() => {});
            }
        });
    }
    } catch (error) {
        if (!gameResolved && totalDebited > 0) {
            await eco.addCoins(guildId, userId, totalDebited).catch(() => {});
        }
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: "Ocorreu um erro na mesa. Sua aposta foi devolvida.", embeds: [], components: [] }).catch(() => {});
        } else {
            await interaction.reply({ content: "Ocorreu um erro na mesa. Sua aposta foi devolvida.", ephemeral: true }).catch(() => {});
        }
    }
}
