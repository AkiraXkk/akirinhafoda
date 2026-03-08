const fs = require('fs');
const path = require('path');

const commands = [
  'ajuda', 'bicho', 'blackjack', 'boost', 'botadmin', 'config', 'configsugestao',
  'dama', 'devil', 'economy', 'enquete', 'family', 'fun', 'jogar', 'leaderboard',
  'leveladmin', 'levels', 'logs', 'maintenance', 'moderation', 'partnerconfig',
  'partnership', 'ping', 'presence', 'rankcheck', 'resetconfig', 'roleta',
  'sejawda', 'serverbpost', 'setupcards', 'shop', 'shopadmin', 'social',
  'sugerir', 'tagroleadmin', 'ticket', 'utility', 'velha', 'verify', 'vip',
  'vipadmin', 'vipbuy', 'vipservice', 'welcome'
];

console.log('🔍 Testando estrutura dos comandos...\n');

for (let i = 0; i < commands.length; i++) {
  const cmd = commands[i];
  try {
    const command = require(path.join(__dirname, 'src', 'commands', cmd + '.js'));
    
    // Testar se o comando tem estrutura válida
    if (!command.data) {
      console.log(`❌ ${i}. ${cmd}: Sem 'data'`);
      continue;
    }
    
    if (!command.execute) {
      console.log(`❌ ${i}. ${cmd}: Sem 'execute'`);
      continue;
    }
    
    // Testar serialização JSON
    const jsonData = command.data.toJSON();
    
    // Verificar se há problemas conhecidos
    const options = jsonData.options || [];
    let hasSubCommand = false;
    let hasOtherOption = false;
    
    for (const option of options) {
      if (option.type === 1) { // SUB_COMMAND
        hasSubCommand = true;
      } else if (option.type !== 1) {
        hasOtherOption = true;
      }
    }
    
    if (hasSubCommand && hasOtherOption) {
      console.log(`❌ ${i}. ${cmd}: CONFLITO - Sub-comandos e outros tipos misturados`);
    } else {
      console.log(`✅ ${i}. ${cmd}: OK (${options.length} opções)`);
    }
    
  } catch (error) {
    console.log(`❌ ${i}. ${cmd}: ERRO - ${error.message}`);
  }
}

console.log('\n🔍 Verificação concluída!');
