import type { Subcommand } from "@sapphire/plugin-subcommands";
import type { SlashCommandSubcommandBuilder } from "discord.js";
import { bold } from "discord.js";

import type { OsuCommand } from "../../commands/osu.command";
import { ExtendedError } from "../../lib/extended-error";
import { getUserById, getUserSearch } from "../../lib/types/api";

export function addLinkSubcommand(command: SlashCommandSubcommandBuilder) {
  return command
    .setName("link")
    .setDescription("Link your GOAT-chan profile")
    .addStringOption(o =>
      o
        .setName("username")
        .setDescription("Your username on the server")
        .setRequired(false),
    )
    .addStringOption(o =>
      o
        .setName("id")
        .setDescription("Your account ID on the server")
        .setRequired(false));
}

export async function chatInputRunLinkSubcommand(
  this: OsuCommand,
  interaction: Subcommand.ChatInputCommandInteraction,
) {
  await interaction.deferReply();

  const userUsernameOption = interaction.options.getString("username");
  const userIdOption = interaction.options.getString("id");

  if (!userUsernameOption && !userIdOption) {
    throw new ExtendedError("You must provide either a username or an ID to link your account.");
  }

  let user = null;

  if (userIdOption) {
    const userSearchResponseById = await getUserById({ path: { id: Number.parseInt(userIdOption, 10) } });

    if (userSearchResponseById.error || !userSearchResponseById.data) {
      throw new ExtendedError(
        userSearchResponseById?.error?.detail
        || userSearchResponseById?.error?.title
        || "Couldn't fetch user by ID!",
      );
    }
    user = userSearchResponseById.data;
  }

  if (userUsernameOption && !user) {
    const userSearchResponse = await getUserSearch({
      query: { limit: 1, page: 1, query: userUsernameOption },
    });

    if (userSearchResponse.error || userSearchResponse.data.length <= 0) {
      throw new ExtendedError(
        userSearchResponse?.error?.detail
        || userSearchResponse?.error?.title
        || "Couldn't fetch user!",
      );
    }

    user = userSearchResponse.data[0];
  }

  if (!user) {
    throw new ExtendedError("Couldn't find the specified user!");
  }

  const { db } = this.container;

  const insertConnection = db.prepare(
    "INSERT OR REPLACE INTO connections (discord_user_id, osu_user_id) VALUES ($1, $2);",
  );

  insertConnection.run({
    $1: interaction.user.id,
    $2: user.user_id,
  });

  const { embedPresets } = this.container.utilities;

  return await interaction.editReply({
    embeds: [embedPresets.getSuccessEmbed(`🙂 You are now ${bold(user.username)}!`)],
  });
}
