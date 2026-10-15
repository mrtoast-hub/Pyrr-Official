
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  Events,
  ActivityType,
  version: discordVersion
} = require("discord.js");

const PREFIX = "P'";
const BOT_NAME = "Pyrr Official";
const TWITCH_URL = "https://www.twitch.tv/noctis_official01";
const COLOR = 0x202127;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message]
});

const startedAt = Date.now();

const categories = [
  {
    label: "Economy",
    value: "economy",
    emoji: "💰",
    description: "Balance, earning and profiles"
  },
  {
    label: "Gambling",
    value: "gambling",
    emoji: "🎮",
    description: "Casual games and challenges"
  },
  {
    label: "Utility",
    value: "utility",
    emoji: "🛠️",
    description: "Useful tools and information"
  },
  {
    label: "Moderation",
    value: "moderation",
    emoji: "🛡️",
    description: "Server moderation tools"
  },
  {
    label: "Automod",
    value: "automod",
    emoji: "🔒",
    description: "Automated moderation"
  },
  {
    label: "System",
    value: "system",
    emoji: "⚙️",
    description: "Tickets, verification and logs"
  },
  {
    label: "Partnership",
    value: "partnership",
    emoji: "🤝",
    description: "Community partnerships"
  }
];

const commandDocs = {
  economy: [
    ["P'daily", "Collect your daily reward."],
    ["P'balance", "View your current balance."],
    ["P'work", "Earn coins by working."]
  ],
  gambling: [
    ["P'rps", "Play rock-paper-scissors."],
    ["P'dice", "Roll a virtual die."]
  ],
  utility: [
    ["P'help", "Open the interactive help menu."],
    ["P'ping", "Check bot API latency."],
    ["P'botinfo", "View bot information."],
    ["P'userinfo", "View user information."],
    ["P'serverinfo", "View server information."],
    ["P'avatar", "View a user's avatar."],
    ["P'uptime", "View the current bot uptime."]
  ],
  moderation: [
    ["P'ban", "Ban a member with permission checks."],
    ["P'kick", "Kick a member with permission checks."],
    ["P'timeout", "Timeout a member with permission checks."]
  ],
  automod: [
    ["P'automod", "Automod configuration is planned."]
  ],
  system: [
    ["P'ticket", "Ticket system is planned."],
    ["P'setwelcome", "Welcome configuration is planned."]
  ],
  partnership: [
    ["P'partner", "Partnership tools are planned."]
  ]
};

function makeEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTimestamp();
}

function makeHomeEmbed() {
  return makeEmbed()
    .setAuthor({
      name: "PYRR OFFICIAL • SUPPORT SYSTEM",
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle("Pyrr Help Center")
    .setDescription(
      "Welcome to **Pyrr Official**.\n" +
      "Your community management assistant.\n\n" +
      "```ansi\n\u001b[1;37mPYRR INFORMATION\u001b[0m\n```\n" +
      "› **7** command categories\n" +
      "› **250+** planned command target\n" +
      "› Prefix: `P'`\n" +
      "› Slash command: `/help`\n\n" +
      "**Select a category below** to explore the command reference."
    )
    .addFields(
      {
        name: "Support",
        value: "Use the category selector below to browse commands.",
        inline: false
      },
      {
        name: "Twitch",
        value: `[Noctis Official](${TWITCH_URL})`,
        inline: true
      },
      {
        name: "Status",
        value: "Help system online",
        inline: true
      }
    )
    .setFooter({
      text: "Pyrr Official • Help Center",
      iconURL: client.user.displayAvatarURL()
    });
}

function makeCategoryEmbed(value) {
  const category = categories.find(
    item => item.value === value
  );

  if (!category) return makeHomeEmbed();

  const docs = commandDocs[value] || [];

  const commandText = docs.length
    ? docs.map(([name, description]) =>
        `\`${name}\` — ${description}`
      ).join("\n")
    : "No commands are listed in this category yet.";

  return makeEmbed()
    .setAuthor({
      name: "PYRR OFFICIAL • COMMAND DIRECTORY",
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle(`${category.emoji} ${category.label}`)
    .setDescription(
      `${category.description}\n\n` +
      "**Command Reference**\n" +
      commandText
    )
    .setFooter({
      text: "Pyrr Official • Select another category below"
    });
}

function makeMenu() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("pyrr_help_category")
    .setPlaceholder("Browse command categories")
    .addOptions(
      categories.map(item => ({
        label: item.label,
        value: item.value,
        description: item.description,
        emoji: item.emoji
      }))
    );

  return new ActionRowBuilder().addComponents(select);
}

async function showHelp(target) {
  return target.reply({
    embeds: [makeHomeEmbed()],
    components: [makeMenu()]
  });
}

client.once(Events.ClientReady, ready => {
  console.log("--------------------------------");
  console.log(`${BOT_NAME} is online`);
  console.log(`Logged in as ${ready.user.tag}`);
  console.log(`Prefix: ${PREFIX}`);
  console.log(`Discord.js: ${discordVersion}`);
  console.log("--------------------------------");

  ready.user.setActivity({
    name: "Noctis Official",
    type: ActivityType.Streaming,
    url: TWITCH_URL
  });
});

// PREFIX COMMANDS

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  if (
    !message.content
      .toLowerCase()
      .startsWith(PREFIX.toLowerCase())
  ) return;

  const input = message.content.slice(PREFIX.length).trim();
  if (!input) return;

  const parts = input.split(/\s+/);
  const command = parts.shift().toLowerCase();

  try {
    if (command === "help") {
      return await showHelp(message);
    }

    if (command === "ping") {
      const sent = await message.reply("Checking latency...");
      return sent.edit(
        `🏓 **Pong!**\nAPI latency: \`${client.ws.ping}ms\``
      );
    }

    if (command === "botinfo") {
      const embed = makeEmbed()
        .setTitle("Pyrr Official")
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription(
          "Professional tools for your Discord community."
        )
        .addFields(
          {
            name: "Servers",
            value: `${client.guilds.cache.size}`,
            inline: true
          },
          {
            name: "Users cached",
            value: `${client.users.cache.size}`,
            inline: true
          },
          {
            name: "Prefix",
            value: "`P'`",
            inline: true
          },
          {
            name: "Discord.js",
            value: discordVersion,
            inline: true
          },
          {
            name: "Twitch",
            value: `[Noctis Official](${TWITCH_URL})`,
            inline: true
          }
        );

      return message.reply({ embeds: [embed] });
    }

    if (command === "uptime") {
      const total = Math.floor(process.uptime());
      const days = Math.floor(total / 86400);
      const hours = Math.floor((total % 86400) / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;

      return message.reply({
        embeds: [
          makeEmbed()
            .setTitle("⏱️ Pyrr Uptime")
            .setDescription(
              `**Online for:** ${days}d ${hours}h ${minutes}m ${seconds}s`
            )
        ]
      });
    }

    if (command === "avatar") {
      const user =
        message.mentions.users.first() || message.author;

      const embed = makeEmbed()
        .setTitle(`${user.username}'s Avatar`)
        .setImage(user.displayAvatarURL({ size: 1024 }))
        .setURL(user.displayAvatarURL({ size: 1024 }));

      return message.reply({ embeds: [embed] });
    }

    if (command === "userinfo") {
      const member =
        message.mentions.members.first() || message.member;

      const embed = makeEmbed()
        .setTitle("User Information")
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
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
            value: member.joinedTimestamp
              ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
              : "Unknown",
            inline: true
          }
        );

      return message.reply({ embeds: [embed] });
    }

    if (command === "serverinfo") {
      const guild = message.guild;

      const embed = makeEmbed()
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          {
            name: "Members",
            value: `${guild.memberCount}`,
            inline: true
          },
          {
            name: "Channels",
            value: `${guild.channels.cache.size}`,
            inline: true
          },
          {
            name: "Created",
            value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
            inline: false
          }
        );

      return message.reply({ embeds: [embed] });
    }

  } catch (error) {
    console.error(`Command ${command} failed:`, error);

    await message.reply(
      "Something went wrong while executing this command."
    ).catch(() => {});
  }
});

// SLASH COMMANDS + HELP MENU

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "help") {
        return await showHelp(interaction);
      }

      if (interaction.commandName === "ping") {
        return interaction.reply({
          embeds: [
            makeEmbed()
              .setTitle("🏓 Pong!")
              .setDescription(
                `API latency: \`${client.ws.ping}ms\``
              )
          ],
          ephemeral: true
        });
      }

      if (interaction.commandName === "botinfo") {
        return interaction.reply({
          embeds: [
            makeEmbed()
              .setTitle("Pyrr Official")
              .setThumbnail(client.user.displayAvatarURL())
              .setDescription(
                `Prefix: \`${PREFIX}\`\n` +
                `[Twitch: Noctis Official](${TWITCH_URL})`
              )
              .addFields(
                {
                  name: "Servers",
                  value: `${client.guilds.cache.size}`,
                  inline: true
                },
                {
                  name: "Discord.js",
                  value: discordVersion,
                  inline: true
                }
              )
          ],
          ephemeral: true
        });
      }

      return;
    }

    if (
      !interaction.isStringSelectMenu() ||
      interaction.customId !== "pyrr_help_category"
    ) return;

    const value = interaction.values[0];

    if (!categories.some(item => item.value === value)) {
      return interaction.reply({
        content: "Invalid category selection.",
        ephemeral: true
      });
    }

    await interaction.update({
      embeds: [makeCategoryEmbed(value)],
      components: [makeMenu()]
    });

  } catch (error) {
    console.error("Interaction error:", error);

    if (!interaction.isRepliable()) return;

    const response = {
      content: "The request failed. Please try again.",
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

// LOGIN

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is missing.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("Bot login failed:", error.message);
  process.exit(1);
});
  
