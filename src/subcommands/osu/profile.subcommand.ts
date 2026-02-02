import type { Subcommand } from "@sapphire/plugin-subcommands";
import type { SlashCommandSubcommandBuilder } from "discord.js";

import type { OsuCommand } from "../../commands/osu.command";
import { ExtendedError } from "../../lib/extended-error";
import { GameMode, getUserByIdByMode, getUserSearch } from "../../lib/types/api";

export function addProfileSubcommand(command: SlashCommandSubcommandBuilder) {
  return command
    .setName("profile")
    .setDescription("Check a user's profile.")
    .addStringOption(o => o.setName("username").setDescription("Target username."))
    .addUserOption(o =>
      o.setName("discord").setDescription("Target discord."),
    )
    .addNumberOption(option => option.setName("id").setDescription("Target user id."))
    .addStringOption(option =>
      option
        .setName("gamemode")
        .setDescription("Select gamemode")
        .setChoices(
          Object.values(GameMode).map(mode => ({
            name: mode.toString(),
            value: mode.toString(),
          })),
        ),
    );
}

export async function chatInputRunProfileSubcommand(
  this: OsuCommand,
  interaction: Subcommand.ChatInputCommandInteraction,
) {
  await interaction.deferReply();

  let userIdOption = interaction.options.getNumber("id");
  let userDefaultGamemode = GameMode.STANDARD;
  const userUsernameOption = interaction.options.getString("username");
  const userDiscordOption = interaction.options.getUser("discord");

  const gamemodeOption = interaction.options.getString("gamemode") as GameMode | null;

  let userResponse = null;

  const { embedPresets } = this.container.utilities;

  if (userUsernameOption) {
    const userSearchResponse = await getUserSearch({
      query: { limit: 1, page: 1, query: userUsernameOption },
    });

    if (userSearchResponse.error || userSearchResponse.data.length <= 0) {
      throw new ExtendedError(
        userSearchResponse?.error?.detail
        || userSearchResponse?.error?.title
        || "❓ I couldn't find user with this username.",
      );
    }

    userIdOption = userSearchResponse.data[0]?.user_id ?? null;
    userDefaultGamemode = userSearchResponse.data[0]?.default_gamemode ?? GameMode.STANDARD;
  }

  if (userIdOption && userResponse == null) {
    userResponse = await getUserByIdByMode({
      path: { id: userIdOption, mode: gamemodeOption ?? userDefaultGamemode },
    });
  }

  if (userResponse == null) {
    const { db } = this.container;

    const row = db.query("SELECT osu_user_id FROM connections WHERE discord_user_id = $1").get({
      $1: userDiscordOption ? userDiscordOption.id : interaction.user.id,
    }) as null | { osu_user_id: number };

    if (!row || !row.osu_user_id) {
      throw new ExtendedError(`❓ Provided user didn't link their GOAT-chan account.`);
    }

    userResponse = await getUserByIdByMode({
      path: { id: row.osu_user_id, mode: gamemodeOption ?? userDefaultGamemode },
    });
  }

  if (!userResponse || userResponse.error) {
    throw new ExtendedError(
      userResponse?.error?.detail || userResponse?.error?.title || "Couldn't fetch requested user!",
    );
  }

  const { user, stats } = userResponse.data;

  const userEmbed = await embedPresets.getUserEmbed(user, stats!);

  await interaction.editReply({ embeds: [userEmbed] });
}
