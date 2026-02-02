import { ApplyOptions } from "@sapphire/decorators";
import { Utility } from "@sapphire/plugin-utilities-store";
import type { HexColorString } from "discord.js";
import { bold, EmbedBuilder, inlineCode, time } from "discord.js";
import { getAverageColor } from "fast-average-color-node";

import { config } from "../lib/configs/env";
import type { BeatmapResponse, CustomBeatmapStatusChangeResponse, ScoreResponse, UserResponse, UserStatsResponse } from "../lib/types/api";
import {
  GameMode,
  getBeatmapByIdPp,
  getUserByIdGrades,
  getUserByIdScores,
  ScoreTableType,
} from "../lib/types/api";
import { tryToGetImage } from "../lib/utils/fetch.util";
import getBeatmapStatusIcon, { getScoreRankEmoji } from "../lib/utils/osu/emoji.util";
import { getBeatmapStarRating } from "../lib/utils/osu/star-rating.util";
import { getDuration } from "../lib/utils/text-conversion/get-duration.util";
import { numberWith } from "../lib/utils/text-conversion/number-with.util";
import { secondsToMinutes } from "../lib/utils/text-conversion/seconds-to.util";

@ApplyOptions<Utility.Options>({ name: "embedPresets" })
export class EmbedPresetsUtility extends Utility {
  public getSuccessEmbed(Title: string, message?: string) {
    const createEmbed = new EmbedBuilder()
      .setTitle(Title.slice(0, 255))
      .setDescription(message ?? null)
      .setColor("Green")
      .setTimestamp();
    return createEmbed;
  }

  public getErrorEmbed(Title: string, message?: string) {
    const createEmbed = new EmbedBuilder()
      .setTitle(Title.slice(0, 255))
      .setDescription(message ?? null)
      .setColor("Red")
      .setFooter({ text: "Im sorry! >.<" })
      .setTimestamp();
    return createEmbed;
  }

  public async getUserEmbed(user: UserResponse, stats: UserStatsResponse) {
    const [topScoresResult, userGradesResult] = await Promise.all([
      getUserByIdScores({
        path: { id: user.user_id },
        query: {
          limit: 1,
          mode: stats.gamemode,
          type: ScoreTableType.TOP,
        },
      }),
      getUserByIdGrades({
        path: { id: user.user_id },
        query: { mode: stats.gamemode },
      }),
    ]);

    if (!topScoresResult || topScoresResult.error) {
      throw new Error("EmbedPresetsUtility: Couldn't fetch user's top scores");
    }

    if (!userGradesResult || userGradesResult.error) {
      throw new Error("EmbedPresetsUtility: Couldn't fetch user's grades");
    }

    const firstPlacesCount = topScoresResult.data?.total_count ?? 0;

    const color = await getAverageColor(user.avatar_url);

    const lastOnlineTime = new Date(user.last_online_time);
    const registerTime = new Date(user.register_date);

    const userStatus
      = user.user_status === "Offline"
        ? `🍂 ${bold(`Offline.`)}\n` + `Last time online: ${bold(time(lastOnlineTime, "R"))}`
        : `🌿 ${bold(user.user_status)}`;

    const infoValues = [
      { name: "Status", value: userStatus },
      {
        name: "Registered",
        value: bold(time(registerTime, "R")),
      },
      {
        name: "Current rank",
        value:
          `${bold(`#${stats.rank}`)}`
          + " "
          + `(:flag_${user.country_code.toLowerCase()}: #${stats.country_rank})`,
      },
      {
        name: "Peak rank",
        value:
          `${bold(`#${stats.best_global_rank}`)}`
          + " "
          + `(:flag_${user.country_code.toLowerCase()}: #${stats.best_country_rank})`,
      },
      { name: null, value: "" },
      {
        name: "PP",
        value: inlineCode(numberWith(stats.pp.toFixed(2), ",")),
        newLine: false,
      },
      { name: null, value: " · ", newLine: false },
      {
        name: "Acc",
        value: inlineCode(stats.accuracy.toFixed(2)),
      },
      {
        name: "Playcount",
        value:
          `${inlineCode(numberWith(stats.play_count, ","))
          } `
          + `(${inlineCode(getDuration(stats.play_time / 1000))})`,
      },
      {
        name: "Total score",
        value: inlineCode(numberWith(stats.total_score, ",")),
        newLine: false,
      },
      { name: null, value: " · ", newLine: false },
      {
        name: "Ranked score",
        value: inlineCode(numberWith(stats.ranked_score, ",")),
      },
    ];

    const description = infoValues.reduce((pr, cur) => {
      if (cur.name) {
        // eslint-disable-next-line no-param-reassign -- reasonable here
        pr += `${cur.name}: `;
      }

      // eslint-disable-next-line no-param-reassign  -- reasonable here
      pr += cur.value;

      if (cur.newLine !== false) {
        // eslint-disable-next-line no-param-reassign  -- reasonable here
        pr += "\n";
      }

      return pr;
    }, "");

    const { A, S, SH, X, XH } = this.container.config.json.emojis.ranks;
    const { count_a, count_s, count_sh, count_x, count_xh } = userGradesResult.data;

    const userEmbed = new EmbedBuilder()
      .setAuthor({
        name: `${user.username} · user profile`,
        iconURL: user.avatar_url,
        url: `https://${config.sunrise.uri}/user/${user.user_id}`,
      })
      .setColor(`${color.hex}` as HexColorString)
      .setThumbnail(user.avatar_url)
      .setDescription(description)
      .setFields([
        {
          name: "Grades",
          value: `${XH}${count_xh}${X}${count_x}${SH}${count_sh}${S}${count_s}${A}${count_a}`,
          inline: true,
        },
        {
          name: "First places",
          value: firstPlacesCount.toString(),
          inline: true,
        },
      ])
      .setFooter({
        text: `${stats.gamemode} · GOAT-chan`,
      });

    return userEmbed;
  }

  public async getScoreEmbed(
    score: ScoreResponse,
    beatmap: BeatmapResponse,
    isScoreNew = false,
  ) {
    if (score.mods_int && score.mods_int > 0) {
      const pp = await getBeatmapByIdPp({
        path: {
          id: score.beatmap_id,
        },
        query: {
          mods: score.mods_int as any,
          mode: score.game_mode,
        },
      });

      if (!pp || pp.error) {
        throw new Error("EmbedPresetsUtility: Couldn't fetch beatmaps modded star rating");
      }

      beatmap.star_rating_ctb = Number(pp.data.difficulty.stars.toFixed(2));
      beatmap.star_rating_mania = Number(pp.data.difficulty.stars.toFixed(2));
      beatmap.star_rating_osu = Number(pp.data.difficulty.stars.toFixed(2));
      beatmap.star_rating_taiko = Number(pp.data.difficulty.stars.toFixed(2));
    }

    const beatmapBannerImage = await tryToGetImage(
      `https://assets.ppy.sh/beatmaps/${beatmap.beatmapset_id}/covers/list@2x.jpg`,
    );

    const color = await getAverageColor(beatmapBannerImage);

    const whenPlayedDate = new Date(score.when_played);

    const titleText = isScoreNew ? "new score submission" : "submitted score";

    let hitCounts = null;

    switch (score.game_mode) {
      case GameMode.STANDARD:
        hitCounts = `[${score.count_300}/${score.count_100}/${score.count_50}/${score.count_miss}]`;
        break;
      case GameMode.TAIKO:
        hitCounts = `[${score.count_300}/${score.count_100}/${score.count_miss}]`;
        break;
      case GameMode.CATCH_THE_BEAT:
        hitCounts = `[${score.count_300}/${score.count_100}/${score.count_50}/${score.count_miss}]`;
        break;
      case GameMode.MANIA:
        hitCounts = `[${score.count_geki}/${score.count_300}/${score.count_katu}/${score.count_100}/${score.count_50}/${score.count_miss}]`;
        break;
    }

    const description
      = `${getScoreRankEmoji(score.grade)} ${score.mods}`
        + ` · ${
       numberWith(score.total_score, ",")
       } · `
       + ` ${score.accuracy.toFixed(2)}% ${bold(time(whenPlayedDate, "R"))}`
       + `\n`
       + `${bold(beatmap.is_ranked ? score.performance_points.toFixed(2) : "~ ")}pp`
       + ` · `
       + `${bold(`x${score.max_combo}`)} / ${beatmap.max_combo}`
       + ` · ${
       hitCounts}`;

    const scoreEmbed = new EmbedBuilder()
      .setAuthor({
        name: `${score.user.username} · ${titleText}`,
        iconURL: score.user.avatar_url,
        url: `https://${config.sunrise.uri}/user/${score.user.user_id}`,
      })
      .setColor(`${color.hex}` as HexColorString)
      .setTitle(
        `${beatmap.artist} - ${beatmap.title} [${beatmap.version}] [★${getBeatmapStarRating(
          beatmap,
          score.game_mode,
        )}]`,
      )
      .setThumbnail(beatmapBannerImage)
      .setURL(`https://${config.sunrise.uri}/beatmaps/${score.beatmap_id}`)
      .setFooter({
        text: `${score.game_mode_extended} · played on GOAT-chan`,
      })
      .setDescription(description);

    return scoreEmbed;
  }

  public async getCustomBeatmapStatusChangeEmbed(data: CustomBeatmapStatusChangeResponse) {
    const { bat, beatmap, new_status, old_status } = data;

    const beatmapBannerImage = await tryToGetImage(
      `https://assets.ppy.sh/beatmaps/${beatmap.beatmapset_id}/covers/cover@2x.jpg`,
      "https://osu.ppy.sh/assets/images/default-bg.7594e945.png",
    );

    const color = await getAverageColor(beatmapBannerImage);

    const pp = await getBeatmapByIdPp({
      path: {
        id: beatmap.id,
      },
    });

    if (!pp || pp.error) {
      throw new Error("EmbedPresetsUtility: Couldn't fetch beatmap performance data");
    }

    const ppFields = beatmap.ranked
      ? [
          {
            name: ` `,
            value: ` `,
            inline: false,
          },
          {
            name: `Performance points for ${config.json.emojis.ranks.SH}`,
            value: `**${pp.data.pp.toFixed(2)} pp**`,
            inline: true,
          },
        ]
      : [];

    const scoreEmbed = new EmbedBuilder()
      .setAuthor({
        name: `${bat.username} · beatmap status update`,
        iconURL: bat.avatar_url,
        url: `https://${config.sunrise.uri}/user/${bat.user_id}`,
      })
      .setColor(`${color.hex}` as HexColorString)
      .setTitle(
        `${beatmap.artist} - ${beatmap.title}`
        + " "
        + `[${beatmap.version}] [★${getBeatmapStarRating(beatmap, beatmap.mode)}]`,
      )
      .setImage(beatmapBannerImage)
      .setURL(`https://${config.sunrise.uri}/beatmaps/${beatmap.id}`)
      .setFooter({
        text: `${beatmap.mode} · GOAT-chan`,
      })
      .setFields(
        {
          name: bold("New beatmap status"),
          value: `${getBeatmapStatusIcon(new_status)} ${bold(new_status)}`,
          inline: true,
        },
        {
          name: "Previous beatmap status",
          value: `${getBeatmapStatusIcon(old_status)} ${old_status}`,
          inline: true,
        },
        ...ppFields,
        {
          name: ` `,
          value: ` `,
          inline: false,
        },
        {
          name: "Length",
          value: `${config.json.emojis.totalLengthIcon} ${secondsToMinutes(beatmap.total_length)}`,
          inline: true,
        },
        {
          name: "BPM",
          value: `${config.json.emojis.bpmIcon} ${beatmap.bpm}`,
          inline: true,
        },
        {
          name: ` `,
          value: ` `,
          inline: false,
        },
        {
          name: "Circle Count",
          value: `${config.json.emojis.countCirclesIcon} ${beatmap.count_circles}`,
          inline: true,
        },
        {
          name: "Slider Count",
          value: `${config.json.emojis.countSlidersIcon} ${beatmap.count_sliders}`,
          inline: true,
        },
      );

    return scoreEmbed;
  }
}
