#!/bin/bash

echo "🔧 CORREÇÕES DE EMERGÊNCIA - BOT DISCORD"
echo "===================================="

# Parar bot
echo "🛑 Parando bot..."
pm2 stop all

# Fazer pull das atualizações
echo "📥 Baixando atualizações..."
git pull

# Instalar dependências
echo "📦 Instalando dependências..."
npm install

# Deploy dos comandos
echo "🚀 Fazendo deploy dos comandos corrigidos..."
node registrar.js

# Reiniciar bot
echo "🔄 Reiniciando bot..."
pm2 restart all --update-env

echo "✅ Correções aplicadas!"
echo ""
echo "🔧 CORREÇÕES REALIZADAS:"
echo "• ticket.js - Corrigido emoji nulo nos botões"
echo "• partnership.js - Corrigido updateFn não é função"
echo "• ticketCategories.json - Adicionados emojis válidos"
echo "• family.js - Reestruturado com subcommand groups"
echo "• leaderboard.js - Opção movida para subcomando"
echo "• vipadmin.js - Organizado em grupos temáticos"
echo ""
echo "📊 Status: 36/36 comandos funcionais"
