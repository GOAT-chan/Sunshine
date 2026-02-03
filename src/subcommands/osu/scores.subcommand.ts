import type { Subcommand } from "@sapphire/plugin-subcommands";
import type { HexColorString, SlashCommandSubcommandBuilder } from "discord.js";
import {
  bold,
  EmbedBuilder,
  hyperlink,
  time,
} from "discord.js";
import { getAverageColor } from "fast-average-color-node";

import type { OsuCommand } from "../../commands/osu.command";
import { ExtendedError } from "../../lib/extended-error";
import {
  GameMode,
  getBeatmapById,
  getUserByIdScores,
  getUserSearch,
  ScoreTableType,
} from "../../lib/types/api";
import { getScoreRankEmoji } from "../../lib/utils/osu/emoji.util";
import { getBeatmapStarRating } from "../../lib/utils/osu/star-rating.util";

export function addScoresSubcommand(command: SlashCommandSubcommandBuilder) {
  return command
    .setName("scores")
    .setDescription("Show user's scores.")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Select score type.")
        .setRequired(true)
        .setChoices(
          Object.values(ScoreTableType).map(mode => ({
            name: mode.toString(),
            value: mode.toString(),
          })),
        ),
    )
    .addStringOption(option =>
      option
        .setName("gamemode")
        .setDescription("Select gamemode.")
        .setChoices(
          Object.values(GameMode).map(mode => ({
            name: mode.toString(),
            value: mode.toString(),
          })),
        ),
    )
    .addStringOption(o => o.setName("username").setDescription("User's username"))
    .addUserOption(o =>
      o.setName("discord").setDescription("Show profile of this user if linked"),
    )
    .addNumberOption(option => option.setName("id").setDescription("User's id"));
}

export async function chatInputRunScoresSubcommand(
  this: OsuCommand,
  interaction: Subcommand.ChatInputCommandInteraction,
) {
  await interaction.deferReply();

  let userDefaultGamemode = GameMode.STANDARD;
  const userUsernameOption = interaction.options.getString("username");
  const userDiscordOption = interaction.options.getUser("discord");

  const gamemodeOption = interaction.options.getString("gamemode") as GameMode;
  const scoresTypeOption = interaction.options.getString("type") as ScoreTableType;

  let userId: number | null = null;

  if (userUsernameOption) {
    const userSearchResponse = await getUserSearch({
      query: { limit: 1, page: 1, query: userUsernameOption },
    });

    if (userSearchResponse.error || userSearchResponse.data.length <= 0) {
      throw new ExtendedError(
        userSearchResponse?.error?.detail
        || userSearchResponse?.error?.title
        || "❓ I couldn't find user with such username",
      );
    }

    userDefaultGamemode = userSearchResponse.data[0]?.default_gamemode ?? GameMode.STANDARD;
    userId = userSearchResponse.data[0]!.user_id;
  }

  if (userId == null) {
    const { db } = this.container;

    const row = db.query("SELECT osu_user_id FROM connections WHERE discord_user_id = $1").get({
      $1: userDiscordOption ? userDiscordOption.id : interaction.user.id,
    }) as null | { osu_user_id: number };

    if (!row || !row.osu_user_id) {
      throw new ExtendedError(`❓ Provided user didn't link their GOAT-chan account`);
    }

    userId = row.osu_user_id;
  }

  const { pagination } = this.container.utilities;

  if (userId === null) {
    throw new ExtendedError(`❓ Couldn't fetch requested user`);
  }

  const handlePagination = createHandleForScoresPagination.call(
    this,
    userId,
    gamemodeOption ?? userDefaultGamemode,
    scoresTypeOption,
  );

  await pagination.createPaginationHandler(interaction, handlePagination, {
    pageSize: 10,
    currentPage: 1,
    totalPages: 0,
  });
}

function createHandleForScoresPagination(
  this: OsuCommand,
  userId: number,
  gamemode: GameMode,
  type: ScoreTableType,
) {
  const { embedPresets } = this.container.utilities;
  const { config } = this.container;
  const missIcon = this.container.config.json.emojis.ranks.F;

  return async function handleUserScoresPagination(state: {
    pageSize: number;
    totalPages: number;
    currentPage: number;
  }) {
    const scoresResponse = await getUserByIdScores({
      path: {
        id: userId,
      },
      query: {
        mode: gamemode,
        type,
        page: state.currentPage,
        limit: state.pageSize,
      },
    });

    if (!scoresResponse || scoresResponse.error) {
      return embedPresets.getErrorEmbed(
        scoresResponse?.error?.detail
        || scoresResponse?.error?.title
        || "Couldn't fetch requested user's scores!",
      );
    }

    const uniqueBeatmapIds = [...new Set(scoresResponse.data.scores.flatMap(s => s.beatmap_id))];

    const beatmapsResponses = await Promise.all(
      uniqueBeatmapIds.map(id => getBeatmapById({ path: { id } })),
    );

    if (beatmapsResponses.some(b => b.error)) {
      return embedPresets.getErrorEmbed("Coudln't fetch all beatmaps for the scores!");
    }

    const beatmaps = beatmapsResponses.map(r => r.data);

    if (scoresResponse.data.scores.length <= 0) {
      return new EmbedBuilder().setDescription(`No scores to show...`);
    }

    const description = scoresResponse.data.scores.reduce((prev, curr, i) => {
      const currentScorePlacement = i + (state.currentPage - 1) * state.pageSize + 1;
      const whenPlayedDate = new Date(curr.when_played);

      const beatmap = beatmaps.find(b => curr.beatmap_id === b?.id)!;

      const result
        = `${bold(`#${currentScorePlacement}`)} ${hyperlink(
          `${beatmap.artist} - ${beatmap?.title} [${beatmap?.version}]`,
          `https://${config.sunrise.uri}/beatmaps/${beatmap.id}`,
        )} [★${getBeatmapStarRating(beatmap, curr.game_mode)}]\n`
        + `${getScoreRankEmoji(curr.grade)} ${bold(
          beatmap.is_ranked ? curr.performance_points.toFixed(2) : "~ ",
        )}pp (${curr.accuracy.toFixed(2)}%) [${bold(`x${curr.max_combo}`)} / ${
          beatmap.max_combo
        }] ${curr.count_miss}${missIcon} ${curr.mods ? bold(curr.mods) : ""}  ${bold(
          time(whenPlayedDate, "R"),
        )}`;

      return `${prev}\n${result}`;
    }, "");

    state.totalPages = Math.ceil(scoresResponse.data.total_count / state.pageSize);

    const { user } = scoresResponse.data.scores[0]!;
    const color = await getAverageColor(user.avatar_url);

    return new EmbedBuilder()
      .setTitle(`${type} Scores of ${user.username} in ${gamemode}`)
      .setColor(`${color.hex}` as HexColorString)
      .setURL(`https://${config.sunrise.uri}/user/${user.user_id}`)
      .setThumbnail(user.avatar_url ?? "")
      .setDescription(description)
      .setFooter({
        text: `Page ${state.currentPage}/${state.totalPages} · submitted on GOAT-chan`,
      });
  };
}
