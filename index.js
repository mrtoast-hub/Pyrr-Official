
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  Events,
  ActivityType
} = require("discord.js");

// ==========================================
// PYRR OFFICIAL — CONFIGURATION
// ==========================================

const PREFIX = "P'";
const BOT_NAME = "Pyrr Official";
const TWITCH_URL = "https://www.twitch.tv/noctis_official01";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

// ==========================================
// HELP CATEGORIES
// ==========================================

const CATEGORIES = [
  {
    label: "Economy",
    value: "economy",
    description: "Earning, balance, profile and shop",
    emoji: "💰"
  },
  {
    label: "Gambling",
    value: "gambling",
    description: "Casual games and minigames",
    emoji: "🎮"
  },
  {
    label: "Utility",
    value: "utility",
    description: "Useful tools and information",
    emoji: "🛠️"
  },
  {
    label: "Moderation",
    value: "moderation",
    description: "Server moderation commands",
    emoji: "🛡️"
  },
  {
    label: "Automod",
    value: "automod",
    description: "Automated moderation",
    emoji: "🔒"
  },
  {
    label: "System",
    value: "system",
    description: "Tickets, verification and logs",
    emoji: "⚙️"
  },
  {
    label: "Partnership",
    value: "partnership",
    description: "Partnership tools and applications",
    emoji: "🤝"
  }
];

// ==========================================
// HELP EMBED
// ==========================================

function makeHelpEmbed(category = null) {
  const embed = new EmbedBuilder()
    .setColor(0x242424)
    .setTitle("Pyrr Help")
    .setDescription(
      "All Pyrr Official commands can be found here.\n\n" +
      "**Pyrr Information:**\n" +
      "> **7** Help Command Categories\n" +
      "> **20** Planned System Help Sections\n" +
      "> **250+** Target Commands\n\n" +
      "**Choose a category:**\n" +
      "Select an option from the menu below."
    )
    .setFooter({
      text: "Pyrr Official • Support Bot"
    });

  if (!category) return embed;

  const selected = CATEGORIES.find(
    item => item.value === category
  );

  if (!selected) return embed;

  const descriptions = {
    economy:
      "**Earning**\n" +
      "`P'daily` `P'work` `P'balance`\n\n" +
      "**Account**\n" +
      "`P'deposit` `P'withdraw` `P'profile`\n\n" +
      "**Shop**\n" +
      "`P'shop` `P'buy` `P'inventory`",

    gambling:
      "**Casual Games**\n" +
      "`P'dice` `P'rps` `P'ttt`\n\n" +
      "**Trivia & Challenges**\n" +
      "`P'trivia` `P'guess` `P'leaderboard`\n\n" +
      "Casual minigames without real-money betting.",

    utility:
      "**General**\n" +
      "`P'help` `P'ping` `P'uptime`\n\n" +
      "**Information**\n" +
      "`P'userinfo` `P'serverinfo` `P'avatar`\n\n" +
      "**Tools**\n" +
      "`P'calculate` `P'poll` `P'botinfo`",

    moderation:
      "**Moderation**\n" +
      "`P'ban` `P'kick` `P'timeout`\n\n" +
      "**Management**\n" +
      "`P'warn` `P'purge` `P'lock` `P'unlock`\n\n" +
      "**Roles**\n" +
      "`P'role` `P'roleinfo` `P'rolelist`",

    automod:
      "**Protection**\n" +
      "`P'antispam` `P'antilink`\n\n" +
      "**Filters**\n" +
      "`P'filter` `P'badwords` `P'automodlogs`\n\n" +
      "Automod configuration requires appropriate permissions.",

    system:
      "**Support Systems**\n" +
      "`P'ticket` `P'verify`\n\n" +
      "**Configuration**\n" +
      "`P'setwelcome` `P'setlogs`\n\n" +
      "**Bot Information**\n" +
      "`P'botinfo` `P'uptime`",

    partnership:
      "**Partnership**\n" +
      "`P'partner` `P'partnerinfo`\n\n" +
      "**Applications**\n" +
      "`P'partnerapply` `P'partnerlist`\n\n" +
      "**Management**\n" +
      "`P'partneraccept` `P'partnerdeny`"
  };

  embed
    .setTitle(`Pyrr Help • ${selected.label}`)
    .setDescription(
      `${selected.emoji} **${selected.label}**\n\n` +
      selected.description +
      "\n\n" +
      descriptions[category]
    );

  return embed;
}

// ==========================================
// CATEGORY SELECT MENU
// ==========================================

function makeCategoryRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("pyrr_help_category")
    .setPlaceholder("Choose a command category")
    .addOptions(
      CATEGORIES.map(category => ({
        label: category.label,
        value: category.value,
        description: category.description,
        emoji: category.emoji
      }))
    );

  return new ActionRowBuilder().addComponents(menu);
}

// ==========================================
// BOT READY + TWITCH STREAMING STATUS
// ==========================================

client.once(Events.ClientReady, readyClient => {
  console.log("================================");
  console.log(`${BOT_NAME} is online!`);
  console.log(`Logged in as: ${readyClient.user.tag}`);
  console.log(`Prefix: ${PREFIX}`);
  console.log(`Twitch: ${TWITCH_URL}`);
  console.log("================================");

  readyClient.user.setActivity({
    name: "Noctis Official",
    type: ActivityType.Streaming,
    url: TWITCH_URL
  });
});

// ==========================================
// PREFIX COMMAND HANDLER
// ==========================================

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (
    !message.content
      .toLowerCase()
      .startsWith(PREFIX.toLowerCase())
  ) {
    return;
  }

  const input = message.content
    .slice(PREFIX.length)
    .trim();

  if (!input) return;

  const args = input.split(/\s+/);
  const command = args.shift().toLowerCase();

  try {
    // HELP
    if (command === "help") {
      return message.reply({
        embeds: [makeHelpEmbed()],
        components: [makeCategoryRow()]
      });
    }

    // PING
    if (command === "ping") {
      const sent = await message.reply(
        "🏓 Checking latency..."
      );

      return sent.edit(
        `🏓 Pong! API latency: ${client.ws.ping} ms`
      );
    }

    // BOT INFO
    if (command === "botinfo") {
      const embed = new EmbedBuilder()
        .setColor(0x242424)
        .setTitle(BOT_NAME)
        .setDescription(
          "Official Pyrr support bot information."
        )
        .addFields(
          {
            name: "Servers",
            value: String(client.guilds.cache.size),
            inline: true
          },
          {
            name: "Users Cached",
            value: String(client.users.cache.size),
            inline: true
          },
          {
            name: "Prefix",
            value: "`P'`",
            inline: true
          },
          {
            name: "Twitch",
            value: `[Noctis Official](${TWITCH_URL})`
          }
        )
        .setTimestamp();

      return message.reply({
        embeds: [embed]
      });
    }

    // USER INFO
    if (command === "userinfo") {
      const member =
        message.mentions.members.first() ||
        message.member;

      const embed = new EmbedBuilder()
        .setColor(0x242424)
        .setTitle("User Information")
        .setThumbnail(
          member.user.displayAvatarURL({
            size: 256
          })
        )
        .addFields(
          {
            name: "Username",
            value: member.user.tag,
            inline: true
          },
          {
            name: "User ID",
            value: member.id,
            inline: true
          },
          {
            name: "Joined Server",
            value: member.joinedAt
              ? `<t:${Math.floor(
                  member.joinedAt.getTime() / 1000
                )}:R>`
              : "Unknown"
          }
        );

      return message.reply({
        embeds: [embed]
      });
    }

    // SERVER INFO
    if (command === "serverinfo") {
      const guild = message.guild;

      const embed = new EmbedBuilder()
        .setColor(0x242424)
        .setTitle(guild.name)
        .setThumbnail(
          guild.iconURL({ size: 256 })
        )
        .addFields(
          {
            name: "Server ID",
            value: guild.id
          },
          {
            name: "Members",
            value: String(guild.memberCount),
            inline: true
          },
          {
            name: "Channels",
            value: String(
              guild.channels.cache.size
            ),
            inline: true
          },
          {
            name: "Created",
            value: `<t:${Math.floor(
              guild.createdTimestamp / 1000
            )}:D>`
          }
        );

      return message.reply({
        embeds: [embed]
      });
    }

    // AVATAR
    if (command === "avatar") {
      const user =
        message.mentions.users.first() ||
        message.author;

      const embed = new EmbedBuilder()
        .setColor(0x242424)
        .setTitle(`${user.username}'s Avatar`)
        .setImage(
          user.displayAvatarURL({
            size: 1024
          })
        );

      return message.reply({
        embeds: [embed]
      });
    }

    // UPTIME
    if (command === "uptime") {
      const total = Math.floor(
        client.uptime / 1000
      );

      const days = Math.floor(total / 86400);
      const hours = Math.floor(
        (total % 86400) / 3600
      );
      const minutes = Math.floor(
        (total % 3600) / 60
      );
      const seconds = total % 60;

      return message.reply(
        `⏱️ Uptime: ${days}d ${hours}h ${minutes}m ${seconds}s`
      );
    }

  } catch (error) {
    console.error(
      `Command error (${command}):`,
      error
    );

    await message.reply(
      "An error occurred while running this command."
    ).catch(() => {});
  }
});

// ==========================================
// HELP CATEGORY INTERACTIONS
// ==========================================

client.on(
  Events.InteractionCreate,
  async interaction => {
    if (!interaction.isStringSelectMenu()) {
      return;
    }

    if (
      interaction.customId !==
      "pyrr_help_category"
    ) {
      return;
    }

    const category = interaction.values[0];

    if (
      !CATEGORIES.some(
        item => item.value === category
      )
    ) {
      return interaction.reply({
        content: "Invalid help category.",
        ephemeral: true
      });
    }

    try {
      await interaction.update({
        embeds: [makeHelpEmbed(category)],
        components: [makeCategoryRow()]
      });
    } catch (error) {
      console.error(
        "Help menu interaction error:",
        error
      );
    }
  }
);

// ==========================================
// LOGIN
// ==========================================

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "Missing DISCORD_TOKEN environment variable."
  );
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(
  error => {
    console.error(
      "Login failed. Check the token and bot configuration."
    );
    console.error(error.message);
    process.exit(1);
  }
);
      
