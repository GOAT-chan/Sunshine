import type { Subcommand } from "@sapphire/plugin-subcommands";
import type { SlashCommandSubcommandBuilder } from "discord.js";

import type { OsuCommand } from "../../commands/osu.command";
import { ExtendedError } from "../../lib/extended-error";

export function addUnlinkSubcommand(command: SlashCommandSubcommandBuilder) {
  return command.setName("unlink").setDescription("Unlink your GOAT-chan profile");
}

export async function chatInputRunUnlinkSubcommand(
  this: OsuCommand,
  interaction: Subcommand.ChatInputCommandInteraction,
) {
  await interaction.deferReply();

  const { db } = this.container;

  const row = db.query("SELECT count(*) FROM connections WHERE discord_user_id = $1").get({
    $1: interaction.user.id,
  }) as { "count(*)": number };

  const { embedPresets } = this.container.utilities;

  if (!row || row["count(*)"] === 0) {
    throw new ExtendedError(`❓ You don't have any linked account`);
  }

  const deleteConnection = db.prepare("DELETE FROM connections WHERE discord_user_id = $1");

  deleteConnection.run({
    $1: interaction.user.id,
  });

  return await interaction.editReply({
    embeds: [embedPresets.getSuccessEmbed(`I successfully unlinked your account!`)],
  });
}
