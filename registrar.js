const { REST, Routes } = require("discord.js");
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Carregar .env com caminho absoluto
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

// Configurações
const { CLIENT_ID, DISCORD_TOKEN, GUILD_ID } = process.env;

if (!CLIENT_ID || !DISCORD_TOKEN) {
  console.error('❌ CLIENT_ID e DISCORD_TOKEN são obrigatórios no .env');
  process.exit(1);
}

const commands = [];

// Função para carregar comandos recursivamente
function loadCommands(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      loadCommands(filePath); // Recursão para subpastas
    } else if (file.endsWith('.js')) {
      try {
        const command = require(filePath);
        if (command.data && typeof command.data.toJSON === 'function') {
          commands.push(command.data.toJSON());
          console.log(`✅ Comando carregado: ${command.data.name}`);
        } else {
          console.warn(`⚠️ Arquivo ignorado (não é um comando válido): ${file}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao carregar comando ${file}:`, error.message);
      }
    }
  }
}

// Carregar todos os comandos da pasta src/commands
const commandsPath = path.join(__dirname, 'src', 'commands');
if (!fs.existsSync(commandsPath)) {
  console.error('❌ Pasta src/commands não encontrada');
  process.exit(1);
}

console.log('🔍 Carregando comandos...');
loadCommands(commandsPath);

console.log(`\n📊 Total de comandos carregados: ${commands.length}`);

if (commands.length === 0) {
  console.log('⚠️ Nenhum comando para registrar. Verifique se os arquivos de comandos estão corretos.');
  process.exit(0);
}

// Inicializar REST
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// Função para registrar comandos
async function deployCommands() {
  try {
    console.log('\n🚀 Iniciando registro dos comandos de application...');

    // Primeiro, limpa todos os comandos existentes para evitar duplicação
    console.log('🧹 Limpando comandos antigos...');
    let data;
    
    if (GUILD_ID) {
      // Limpa comandos do servidor específico
      data = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: [] }
      );
      console.log(`✅ Limpos ${data.length} comandos antigos do servidor ${GUILD_ID}`);
    } else {
      // Limpa comandos globais
      data = await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: [] }
      );
      console.log(`✅ Limpos ${data.length} comandos antigos globais`);
    }

    // Aguarda um momento para o Discord processar a limpeza
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Agora registra os novos comandos
    console.log('\n📝 Registrando novos comandos...');
    if (GUILD_ID) {
      // Registrar para um servidor específico (desenvolvimento)
      console.log(`📡 Registrando comandos para o servidor ${GUILD_ID}...`);
      data = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands },
      );
      console.log(`✅ Comandos registrados com sucesso no servidor!`);
    } else {
      // Registrar globalmente (produção)
      console.log('🌍 Registrando comandos globalmente...');
      data = await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands },
      );
      console.log(`✅ Comandos registrados com sucesso globalmente!`);
    }

    console.log(`📈 Total de comandos registrados: ${data.length}`);

    // Listar comandos registrados
    console.log('\n📋 Comandos registrados:');
    data.forEach(cmd => {
      console.log(`  • ${cmd.name} - ${cmd.description}`);
    });

  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
    
    if (error.code === 50001) {
      console.error('💡 Dica: Verifique se o bot tem a permissão "applications.commands" no servidor.');
    } else if (error.code === 10013) {
      console.error('💡 Dica: Verifique se o CLIENT_ID está correto.');
    } else if (error.code === 50035) {
      console.error('💡 Dica: Verifique se há erros na definição dos comandos (nomes duplicados, etc.).');
    }
    
    process.exit(1);
  }
}

// Executar registro
deployCommands().then(() => {
  console.log('\n🎉 Processo concluído com sucesso!');
  process.exit(0);
}).catch(error => {
  console.error('\n💥 Falha no processo:', error);
  process.exit(1);
});
