const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { CLIENT_ID, DISCORD_TOKEN, GUILD_ID } = process.env;

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');

// Carregar comandos de forma simples
function load(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) load(fullPath);
        else if (file.endsWith('.js')) {
            const cmd = require(fullPath);
            if (cmd.data) commands.push(cmd.data.toJSON());
        }
    });
}

load(commandsPath);

console.log(`📦 Preparados ${commands.length} comandos.`);

const data = JSON.stringify(commands);

const options = {
    hostname: 'discord.com',
    port: 443,
    path: `/api/v10/applications/${CLIENT_ID}/guilds/${GUILD_ID}/commands`,
    method: 'PUT',
    headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
    },
    timeout: 30000 // 30 segundos
};

console.log("🚀 Enviando requisição direta para a API do Discord...");

const req = https.request(options, (res) => {
    let responseBody = '';
    console.log(`📡 Status: ${res.statusCode}`);
    
    res.on('data', (chunk) => responseBody += chunk);
    
    res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log("✅ Sucesso! Comandos atualizados.");
        } else {
            console.error("❌ Erro da API:", responseBody);
        }
        process.exit();
    });
});

req.on('error', (err) => {
    console.error("💥 Erro de Rede:", err.message);
    process.exit(1);
});

req.on('timeout', () => {
    console.error("⏰ Timeout: A API não respondeu a tempo.");
    req.destroy();
    process.exit(1);
});

req.write(data);
req.end();
