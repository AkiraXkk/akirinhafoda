const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  ComponentType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { createEmbed } = require("../embeds");

// Ranks de liderança que podem ver o menu de QUALQUER área
const leadership = ["Chefe", "Sub-Chefe", "Gerente", "Coordenador", "Supervisores"];

// Banco de dados interno dos comandos de cada área
const comandosPorArea = {
  divulgacao: {
    nome: "Divulgação", emoji: "🗞️", cor: 0xff4d4d, cargo: "Equipe Divulgação",
    comandos: [
      "**`/divulgacao registrar`**\nRegistra uma parceria ou convite realizado, enviando o print como prova diretamente para o canal da equipe de Divulgação."
    ]
  },
  eventos: {
    nome: "Eventos", emoji: "🎉", cor: 0x2ecc71, cargo: "Equipe Eventos",
    comandos: [
      "**`/evento painel`**\nGera um painel com botão para criar e anunciar eventos oficiais de forma rápida, formatada e marcando everyone.",
      "**`/evento sortear`**\nInicia um sorteio avançado com sistema de participantes, requisitos e tempo personalizado.",
      "**`/evento drop`**\nCria um drop rápido onde o primeiro a clicar ganha o prêmio.",
      "**`/evento reroll`**\nSorteia um novo vencedor para um sorteio já encerrado.",
      "**`/evento cancelar`**\nCancela um sorteio que ainda está em andamento."
    ]
  },
  movcall: {
    nome: "MovCall", emoji: "🎙️", cor: 0x3498db, cargo: "Equipe MovCall",
    comandos: [
      "**`/movcall acao`**\nMuta ou desconecta um membro infrator da sua call de voz atual. Exige que um motivo seja preenchido e gera um log automático de moderação."
    ]
  },
  movchat: {
    nome: "MovChat", emoji: "🗣️", cor: 0x00d2d3, cargo: "Equipe MovChat",
    comandos: [
      "**`/movchat interagir`**\nEnvia um tópico puxa-assunto interativo (games, música, polêmicas) perfeitamente formatado para reviver o chat geral.",
      "**`/movchat advertir`**\nEnvia uma advertência formal diretamente na DM do membro que quebrou regras."
    ]
  },
  acolhimento: {
    nome: "Acolhimento", emoji: "🫂", cor: 0xf1c40f, cargo: "Equipe Acolhimento",
    comandos: [
      "**`/acolhimento assumir`**\nRenomeia o canal do ticket atual para o seu nome e envia uma mensagem padrão e calorosa de boas-vindas ao membro.",
      "**`/acolhimento guia`**\nEnvia um guia explicativo (Cargos, Entrada na Staff ou WDA Coins) já marcando o membro novato.",
      "",
      "**🕐 Sistema de Tickets com Monitor de Inatividade (SLA)**",
      "> Tickets abertos via `/ticket` são monitorados automaticamente:",
      "> • **30 min** — Ping no cargo configurado se o membro estiver esperando resposta da staff.",
      "> • **90 min** — Ping @everyone se o membro ainda aguardar.",
      "> • **2 horas** — Ticket fechado automaticamente por inatividade e arquivado.",
      "> Ao fechar o ticket, o membro recebe uma **avaliação de NPS por DM**."
    ]
  },
  recrutamento: {
    nome: "Recrutamento", emoji: "🫡", cor: 0xff9ff3, cargo: "Equipe Recrutamento",
    comandos: [
      "**`/recrutamento`**\nAbre o painel interativo e hierárquico para adicionar ou remover cargos de um membro. O bot respeita o seu nível e só permite gerenciar cargos menores que o seu.",
      "",
      "**`/sejawda painel`**\nEnvia o painel de recrutamento WDA para o canal configurado. O painel oferece duas opções:",
      "> • **Quero ser WDA** — Abre um chat de recrutamento por área (MovCall, Eventos, etc.).",
      "> • **Migração de Servidor** — Abre um chat para candidatos de outros servidores.",
      "",
      "**`/sejawda config <area> <cargo>`**\nConfigura o **cargo que será pingado** quando um candidato abrir um chat em uma área específica.",
      "> Isso garante que o responsável certo seja notificado automaticamente.",
      "",
      "**🕐 Monitor de Inatividade dos Chats de Recrutamento (SLA)**",
      "> Chats abertos via Seja WDA também são monitorados:",
      "> • **30 min** — Ping no cargo da área se o candidato estiver esperando.",
      "> • **90 min** — Ping @everyone se ainda não houver resposta da staff.",
      "> • **2 horas** — Chat encerrado automaticamente. O candidato recebe NPS por DM."
    ]
  },
  design: {
    nome: "Design", emoji: "🖋️", cor: 0xc8d6e5, cargo: "Equipe Design",
    comandos: [
      "**`/design painel`**\nCria o painel fixo de pedidos onde os membros de outras áreas podem clicar num botão para solicitar artes via formulário."
    ]
  },
  pastime: {
    nome: "Pastime", emoji: "😸", cor: 0x9b59b6, cargo: "Equipe Pastime",
    comandos: [
      "**`/pastime correio`**\nEnvia um recado ou cantada (anônimo ou não) para um membro, em formato de carta.",
      "**`/pastime minigame`**\nLança as regras e a estrutura de um mini-game rápido (Kiss Marry Kill, Complete a Letra, Verdade ou Mentira) no chat de entretenimento."
    ]
  },
  staff: {
    nome: "Staff", emoji: "👮", cor: 0x5865F2, cargo: "Staff Geral",
    comandos: [
      "**`/staffstats`**\nMostra suas estatísticas de produtividade como Staff, incluindo métricas por área (parcerias, mensagens, tempo em call, etc.).",
      "**`/metas`**\n[Somente Admin] Gerencia e anuncia as metas semanais/mensais da equipe Staff com sistema de definição por área.",
      "",
      "**`/mod config <canal_apelacao> [cargo_mod]`**\n[Somente Admin] Configura o canal onde as apelações de ban/mute serão recebidas e o cargo de moderação.",
      "**`/mod ban`, `/mod mute`**\nPunem um membro e enviam automaticamente um **botão de apelação por DM** para punições de 24h ou mais.",
      "**`/mod clear`, `/mod kick`, `/mod lock`, `/mod unlock`, `/mod unmute`**\nFerramentas de moderação do servidor com registro em log."
    ]
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("helparea")
    .setDescription("Manual de Comandos exclusivos da Staff WDA"),

  async execute(interaction) {
    const embedPrincipal = createEmbed({
      title: "📚 Central de Ajuda da Staff WDA",
      color: 0x5865F2,
      description: "Selecione no menu abaixo a sua área de atuação para visualizar a lista de ferramentas e comandos disponíveis para você.",
      footer: { text: "WDA - Atendimento & Gestão" },
      timestamp: true
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("select_helparea")
      .setPlaceholder("Selecione uma área da Staff...")
      .setMinValues(1)
      .setMaxValues(1);

    for (const [key, data] of Object.entries(comandosPorArea)) {
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`Equipe ${data.nome}`)
          .setEmoji(data.emoji)
          .setValue(key)
      );
    }

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const msg = await interaction.reply({ embeds: [embedPrincipal], components: [row], fetchReply: true, flags: MessageFlags.Ephemeral });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120000 });

    collector.on("collect", async (i) => {
      const selectedKey = i.values[0];
      const areaData = comandosPorArea[selectedKey];
      const executor = i.member;

      // VERIFICAÇÃO DE SEGURANÇA: Tem o cargo da área, é da Liderança ou é Admin?
      const isAuthorized = executor.permissions.has(PermissionFlagsBits.Administrator) ||
                           executor.roles.cache.some(r => r.name === areaData.cargo || leadership.includes(r.name));

      if (!isAuthorized) {
        return i.reply({ content: `❌ **Acesso Negado:** Você não faz parte da **${areaData.cargo}** e não possui nível de Liderança para visualizar este manual.`, flags: MessageFlags.Ephemeral });
      }

      const embedAjuda = createEmbed({
        title: `${areaData.emoji} Manual: ${areaData.cargo}`,
        color: areaData.cor,
        description: `Abaixo estão todos os comandos disponíveis para facilitar o seu trabalho na equipe de **${areaData.nome}** da WDA:\n\n` + areaData.comandos.join("\n\n"),
        footer: { text: "WDA - Atendimento & Gestão" },
        timestamp: true
      });

      await i.reply({ embeds: [embedAjuda], flags: MessageFlags.Ephemeral });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(()=>{});
    });
  }
};