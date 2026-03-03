const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const commands = [];
const foldersPath = path.join(__dirname, 'src/commands');

// Lê todos os arquivos da pasta de comandos
const commandFiles = fs.readdirSync(foldersPath).filter(file => file.endsWith('.js'));

console.log(`📂 Lendo pasta de comandos: ${foldersPath}`);

for (const file of commandFiles) {
    const filePath = path.join(foldersPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ Comando carregado: ${command.data.name}`);
    } else {
        console.log(`⚠️  O comando em ${file} está faltando as propriedades "data" ou "execute".`);
    }
}

// Verifica se o token existe no .env
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
    console.error("❌ ERRO CRÍTICO: DISCORD_TOKEN ou CLIENT_ID não encontrados no arquivo .env");
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`\n🚀 Iniciando o registro de ${commands.length} comandos (Global)...`);

        // Rota para registro global (pode levar alguns minutos para atualizar em todos os servers)
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`\n✨ SUCESSO! ${data.length} comandos registrados globalmente.`);
        console.log("💡 Nota: Pode levar até 1 hora para o cache do Discord atualizar em todos os servidores.");
    } catch (error) {
        console.error("\n❌ ERRO AO REGISTRAR COMANDOS:");
        
        // Se o erro for no corpo do comando (ex: nome inválido), o Discord avisa aqui:
        if (error.errors) {
            console.error("Detalhes do erro no formulário:");
            console.dir(error.errors, { depth: null });
        } else {
            console.error(error);
        }
    }
})();

