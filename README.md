# Bot de Discord (básico)

Base pronta para evoluir com comandos, embeds e clean code.

## Requisitos

- Node.js 18+
- Um app criado no Discord Developer Portal com um bot

## Configuração

1. Instale as dependências:

```bash
npm install
```

2. Crie seu `.env`:

```bash
copy .env.example .env
```

3. Preencha no `.env`:

- `DISCORD_TOKEN`: token do bot
- `CLIENT_ID`: client id do app
- `GUILD_ID` (opcional): id do servidor para registrar comandos só nele (recomendado para desenvolvimento)

Importante: nunca compartilhe seu token. Se ele vazar, regenere no Discord Developer Portal.

## Convidar o bot

Abra (substitua `CLIENT_ID`):

`https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=0`

## Registrar comandos

```bash
npm run deploy-commands
```

## Rodar

```bash
npm start
```

Ou em modo watch:

```bash
npm run dev
```

## Comandos

- `/ping`
- `/ajuda`
- `/vipsetup config [cargo_vip] [categoria_vip]` (Admin: configura o sistema VIP no servidor)
- `/vipsetup info` (Mostra a configuração atual)
- `/vip status [usuario]`
- `/vip add usuario`
- `/vip remove usuario`
- `/vip list`
- `/myvip role create [nome] [cor]` (Cria/Edita cargo personalizado)
- `/myvip role delete` (Deleta cargo personalizado)
- `/myvip room create` (Cria canais de texto/voz privados)
- `/myvip room delete` (Deleta canais privados)

### VIP

- O bot considera VIP quando o usuário está no arquivo `VIP_STORE_PATH` ou tem o cargo VIP configurado via `/vipsetup`.
- Para gerenciar VIPs e configurações, o usuário precisa de permissão `Gerenciar servidor`.
