const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { CLIENT_ID, DISCORD_TOKEN, GUILD_ID } = process.env;

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');

function load(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) load(fullPath);
        else if (file.endsWith('.js')) {
            try {
                const cmd = require(fullPath);
                if (cmd.data) {
                    const json = cmd.data.toJSON();
                    
                    // Validação Sênior: Verifica campos obrigatórios do Discord
                    if (!json.name || !json.description) {
                        console.error(`⚠️ O comando em ${file} está sem nome ou descrição!`);
                    } else if (json.name !== json.name.toLowerCase()) {
                        console.error(`⚠️ O comando "${json.name}" em ${file} tem letras MAIÚSCULAS (não permitido).`);
                    } else {
                        commands.push(json);
                        console.log(`✅ Comando validado: /${json.name}`);
                    }
                }
            } catch (e) {
                console.error(`❌ Erro ao carregar ${file}:`, e.message);
            }
        }
    });
}

console.log("🔍 Analisando arquivos de comando...");
load(commandsPath);

if (commands.length === 0) {
    console.error("❌ Nenhum comando válido encontrado para enviar.");
    process.exit(1);
}

const payload = JSON.stringify(commands);

const options = {
    hostname: 'discord.com',
    port: 443,
    path: `/api/v10/applications/${CLIENT_ID}/guilds/${GUILD_ID}/commands`,
    method: 'PUT',
    headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

console.log(`\n🚀 Enviando ${commands.length} comandos para a API...`);

const req = https.request(options, (res) => {
    let responseBody = '';
    res.on('data', (chunk) => responseBody += chunk);
    res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log("✅ SUCESSO: Todos os comandos foram registrados!");
        } else {
            console.error(`❌ Erro ${res.statusCode} da API do Discord:`);
            console.error(JSON.stringify(JSON.parse(responseBody), null, 2));
        }
        process.exit();
    });
});

req.on('error', (err) => {
    console.error("💥 Erro de rede:", err.message);
    process.exit(1);
});

req.write(payload);
req.end();