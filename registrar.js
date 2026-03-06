const { REST, Routes } = require("discord.js");
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Configuração de ambiente
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

const { CLIENT_ID, DISCORD_TOKEN, GUILD_ID } = process.env;

if (!CLIENT_ID || !DISCORD_TOKEN) {
  console.error('❌ Erro: CLIENT_ID e DISCORD_TOKEN não encontrados no .env');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');

// Função recursiva para carregar comandos em subpastas
function loadCommands(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      loadCommands(filePath);
    } else if (file.endsWith('.js')) {
      try {
        const command = require(filePath);
        if (command.data && typeof command.data.toJSON === 'function') {
          commands.push(command.data.toJSON());
          console.log(`✅ Carregado: ${command.data.name}`);
        }
      } catch (error) {
        console.error(`❌ Falha no arquivo ${file}:`, error.message);
      }
    }
  }
}

// Início do processo
if (fs.existsSync(commandsPath)) {
  console.log('🔍 Vasculhando comandos...');
  loadCommands(commandsPath);
} else {
  console.error('❌ Pasta src/commands não existe.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\n🚀 Sincronizando ${commands.length} comandos...`);

    // O método PUT substitui automaticamente a lista antiga, 
    // eliminando a necessidade de limpar o body primeiro.
    let data;
    if (GUILD_ID) {
      console.log(`📡 Modo DEV: Atualizando comandos no servidor ${GUILD_ID}`);
      data = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );
    } else {
      console.log('🌍 Modo PROD: Atualizando comandos globais (pode levar 1h)');
      data = await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
    }

    console.log(`\n🎉 Sucesso! ${data.length} comandos estão ativos.`);
    
    // Lista rápida para conferência
    data.forEach(cmd => console.log(` • /${cmd.name}`));

  } catch (error) {
    console.error('💥 Erro no Deploy:', error);
    
    // Dicas baseadas em erros comuns da API
    if (error.code === 50001) console.error('💡 Verifique se o bot tem permissão "applications.commands".');
    if (error.code === 50035) console.error('💡 Há um erro na estrutura de um dos seus comandos (JSON inválido).');
  }
})();