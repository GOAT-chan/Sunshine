import { Command } from "@sapphire/framework";

export class MeowCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(builder => builder.setName("meow").setDescription("meow?"));
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    return interaction.reply("Meow! 😺");
  }
}
