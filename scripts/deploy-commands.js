const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const commands = [];
const commandsPath = path.resolve(__dirname, '../src/commands');

console.log(`🔍 Buscando comandos em: ${commandsPath}`);

// Lógica de leitura para arquivos diretos ou pastas
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✅ Comando carregado: ${file}`);
        } else {
            console.log(`⚠️  [AVISO] O comando em ${file} está faltando "data" ou "execute".`);
        }
    } catch (error) {
        console.error(`❌ Erro ao ler o arquivo ${file}:`, error.message);
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`🚀 Iniciando atualização de ${commands.length} comandos (/)`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log(`✨ Sucesso! ${data.length} comandos registrados.`);
    } catch (error) {
        console.error('💥 Erro fatal no deploy:', error);
    }
})();
