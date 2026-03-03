const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const commands = [];
// Garante o caminho correto: volta de /scripts e entra em /src/commands
const foldersPath = path.resolve(__dirname, '../src/commands');

console.log(`🔍 Buscando comandos em: ${foldersPath}`);

if (!fs.existsSync(foldersPath)) {
    console.error("❌ ERRO: A pasta src/commands não foi encontrada!");
    process.exit(1);
}

const commandFiles = fs.readdirSync(foldersPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(foldersPath, file);
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✅ Comando lido: ${command.data.name}`);
        }
    } catch (err) {
        console.error(`❌ Erro ao ler o arquivo ${file}:`, err.message);
    }
}

// Suporta DISCORD_TOKEN ou TOKEN para evitar erros de ambiente
const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
    console.error("❌ ERRO: DISCORD_TOKEN (ou TOKEN) e CLIENT_ID são obrigatórios no .env");
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`\n🚀 Enviando ${commands.length} comandos para o Discord...`);
        console.log(`🤖 Usando CLIENT_ID: ${clientId}`);
        
        // Timeout de 15 segundos para evitar que o terminal fique travado
        const promise = rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Discord API Timeout')), 15000)
        );

        const data = await Promise.race([promise, timeout]);

        console.log(`\n✨ SUCESSO! ${data.length} comandos registrados globalmente.`);
        console.log("💡 Os comandos podem levar alguns minutos para aparecer no seu Discord.");
        process.exit(0);
    } catch (error) {
        console.error('\n❌ ERRO NO REGISTRO:');
        if (error.message === 'Discord API Timeout') {
            console.error('O Discord demorou demais para responder. Verifique seu CLIENT_ID e sua conexão.');
        } else if (error.status === 401) {
            console.error('Token Inválido! Verifique o DISCORD_TOKEN no seu .env');
        } else {
            console.error(error);
        }
        process.exit(1);
    }
})();
