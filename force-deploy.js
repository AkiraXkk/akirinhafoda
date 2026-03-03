const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function deploy() {
    const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
    const CLIENT_ID = process.env.CLIENT_ID;
    const GUILD_ID = "722253176283070506"; // Seu ID fornecido

    // Caminho para a sua pasta de comandos (ajustado para src/commands)
    const commandsPath = path.resolve(__dirname, './src/commands');
    const commands = [];

    console.log(`📂 Lendo comandos em: ${commandsPath}`);

    if (!fs.existsSync(commandsPath)) {
        console.error("❌ ERRO: A pasta src/commands não existe!");
        process.exit(1);
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsPath, file));
            if (command.data) {
                commands.push(command.data.toJSON());
                console.log(`✅ Comando carregado: ${command.data.name}`);
            }
        } catch (e) {
            console.log(`⚠️ Pulando ${file}: erro de leitura.`);
        }
    }

    console.log(`\n🚀 Registrando ${commands.length} comandos no Servidor: ${GUILD_ID}...`);

    try {
        const response = await fetch(`https://discord.com/api/v10/applications/${CLIENT_ID}/guilds/${GUILD_ID}/commands`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bot ${TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(commands),
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`\n✨ SUCESSO! ${data.length} comandos registrados no servidor de teste.`);
            console.log("💡 Os comandos devem aparecer INSTANTANEAMENTE no seu Discord.");
            process.exit(0);
        } else {
            console.error('\n❌ ERRO DO DISCORD:');
            console.dir(data, { depth: null });
            process.exit(1);
        }
    } catch (error) {
        console.error('\n❌ ERRO DE CONEXÃO:', error.message);
        process.exit(1);
    }
}

deploy();

