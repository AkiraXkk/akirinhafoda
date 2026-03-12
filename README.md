# 🌸 WDA Bot — Atendimento & Gestão

> *O bot oficial da WDA: fofo por fora, poderoso por dentro.* 💜

Bot de Discord construído com **discord.js v14** e **Node.js 18+** para gerenciar a comunidade WDA com um sistema completo de tickets, recrutamento, moderação, correio anônimo e muito mais.

---

## ✨ Funcionalidades Principais

### 🎫 Sistema de Tickets & Recrutamento com SLA
- Tickets abertos pelo painel (`/ticket`) criam canais privados por categoria (Suporte, Parceria, Denúncia, Sugestão, VIP).
- Chats de recrutamento WDA (`/sejawda painel`) permitem candidatos solicitarem vagas por área ou migrarem de servidor.
- **Monitor de Inatividade automático** verifica a cada 5 minutos:
  - ⏱️ **30 min** → Ping no cargo da área responsável.
  - ⏱️ **90 min** → Ping @everyone de alerta.
  - ⏱️ **2 horas** → Encerramento automático com arquivamento do canal.
- Ao fechar um ticket ou chat, o membro recebe uma **avaliação de NPS por DM**.

### 🛡️ Sistema de Moderação com Apelação por DM
- Comandos `/mod ban`, `/mod mute`, `/mod kick`, `/mod clear`, `/mod lock`, `/mod unlock`, `/mod unmute`.
- Punições de **24 horas ou mais** enviam automaticamente um botão de **Apelação por DM** ao membro punido.
- Hierarquia respeitada: nenhum moderador pode punir alguém de cargo igual ou superior.
- Configurável via **`/mod config`**: define o canal de apelações e o cargo de moderação.

### 💌 Correio Anônimo (Tellonym)
- Envie cartinhas anônimas ou assinadas para membros do servidor.
- Painel interativo com opções **Anônimo** e **Assinado**.
- Todas as mensagens são registradas em log de auditoria para a staff.
- Footer exclusivo: **WDA — Tellonym**.

### 📊 Dashboard & API
- Endpoint Express interno para integração com painéis externos.
- Logs estruturados com **Pino** para monitoramento em tempo real.

### ⭐ Outros Sistemas
- 💰 Economia com loja, moedas e cartões colecionáveis.
- 🎉 Eventos, sorteios e drops interativos.
- 🤝 Parcerias com verificação automática.
- 👥 Sistema de família, níveis e ranking de atividade.
- 💎 VIP com cargos e canais personalizados.
- 📝 Estatísticas de produtividade da Staff.

---

## ⚙️ Configuração Rápida

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure o `.env`

```bash
cp .env.example .env
```

Preencha as variáveis obrigatórias:

| Variável | Descrição |
|----------|-----------|
| `DISCORD_TOKEN` | Token do bot (nunca compartilhe!) |
| `CLIENT_ID` | ID do aplicativo no Discord Developer Portal |
| `GUILD_ID` | ID do servidor (recomendado para desenvolvimento) |
| `MONGO_URI` | URI de conexão com o MongoDB (opcional) |
| `LOG_LEVEL` | Nível de log do Pino (padrão: `info`) |

### 3. Registre os comandos

```bash
npm run deploy-commands
```

### 4. Inicie o bot

```bash
npm start        # produção
npm run dev      # modo watch (desenvolvimento)
```

---

## 🔧 Configuração dos Módulos

### Moderação — `/mod config`

```
/mod config canal_apelacao:#canal cargo_mod:@cargo
```

Define o canal onde as apelações serão recebidas e o cargo de moderação. Somente administradores podem usar este comando.

### Painel Seja WDA — `/sejawda config` e `/sejawda painel`

```
/sejawda config area:Mov Call cargo:@Equipe-MovCall
/sejawda painel [canal:#canal] [categoria:categoria]
```

Configure o cargo pingado para **cada área de recrutamento** separadamente antes de enviar o painel. Isso garante que o responsável certo seja notificado quando um candidato abrir um chat.

**Áreas disponíveis:** Mov Call, Mov Chat, Eventos, Recrutamento, Acolhimento, Design, Pastime, Migração.

---

## 📚 Ajuda In-Bot

- **`/ajuda`** — Menu interativo com todas as categorias e comandos disponíveis.
- **`/helparea`** — Manual exclusivo da Staff WDA com comandos por área de atuação.

---

## 📁 Estrutura do Projeto

```
src/
  commands/       # Um arquivo por comando slash
  events/         # Listeners de eventos Discord
  config/         # Helpers de configuração por servidor
  database/       # Modelos Mongoose e conexão
  services/       # Lógica de negócio compartilhada
  store/          # Stores JSON locais e MongoDB
  utils/          # Utilitários genéricos
  embeds.js       # Factory de embeds (createEmbed)
  index.js        # Entry point do bot
scripts/
  deploy-commands.js  # Registra comandos no Discord
```

---

## 🔒 Segurança

- **Nunca** faça commit do arquivo `.env` ou exponha seu token.
- Se um token vazar, regenere imediatamente no [Discord Developer Portal](https://discord.com/developers/applications).
- Todos os inputs de usuários são validados antes de acessar banco de dados.

---

<div align="center">
  <sub>💜 Feito com carinho para a comunidade WDA • <strong>WDA - Atendimento & Gestão</strong></sub>
</div>

