const { SlashCommandBuilder, version: djsVersion } = require("discord.js");
const { createEmbed } = require("../embeds");
const mongoose = require("mongoose");
const os = require("os");

function formatUptime(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Diagnóstico avançado do sistema e latências"),
  async execute(interaction) {
    await interaction.deferReply();

    // 1. Latências de Conexão
    const wsPing = interaction.client.ws.ping;
    const roundtrip = Date.now() - interaction.createdTimestamp;
    
    // 2. Latência Real do MongoDB
    const dbStart = Date.now();
    let dbPing = "N/A";
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().ping();
        dbPing = `${Date.now() - dbStart}ms`;
    }

    // 3. Informações de Hardware & AWS
    const usedRam = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    const cpuLoad = os.loadavg()[0].toFixed(2);
    const uptime = formatUptime(interaction.client.uptime);

    // 4. Estatísticas de Escopo
    const totalGuilds = interaction.client.guilds.cache.size;
    const totalUsers = interaction.client.users.cache.size;
    const clusterId = interaction.client.cluster?.id ?? (interaction.client.shard?.ids[0] ?? "0");

    const embed = createEmbed({
      title: "📡 Painel de Monitoramento - WDA",
      fields: [
        { name: "🌐 Conexões", value: `**API:** \`${wsPing}ms\`\n**Latência:** \`${roundtrip}ms\`\n**Database:** \`${dbPing}\``, inline: true },
        { name: "⏱️ Atividade", value: `**Uptime:** \`${uptime}\`\n**Cluster:** \`#${clusterId}\`\n**Shard:** \`#${interaction.guild.shardId}\``, inline: true },
        { name: "📊 Estatísticas", value: `**Guilds:** \`${totalGuilds}\`\n**Users:** \`${totalUsers}\`\n**D.js:** \`v${djsVersion}\``, inline: true },
        { name: "🧠 Recursos (AWS)", value: `**RAM:** \`${usedRam}MB / ${totalRam}GB\`\n**CPU:** \`${cpuLoad}%\`\n**Node:** \`${process.version}\``, inline: true },
        { name: "⚙️ Sistema Host", value: `**OS:** \`${os.type()}\`\n**Arch:** \`${os.arch()}\`\n**Plataforma:** \`${os.platform()}\``, inline: true },
      ],
      color: 0x2b2d31,
      footer: { text: `Solicitado por ${interaction.user.tag}`, icon_url: interaction.user.displayAvatarURL() }
    });

    await interaction.editReply({ embeds: [embed] });
  },
};