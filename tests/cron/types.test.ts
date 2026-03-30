import { describe, expect, it } from "vitest";
import { cronJobRequiresDelivery, normalizeCronJobConfig } from "../../src/cron/types.js";

describe("cron/types", () => {
  it("normalizes and deduplicates chat targets", () => {
    const config = normalizeCronJobConfig({
      id: "daily-digest-send",
      schedule: "0 10 * * *",
      message: "发送日报",
      chatId: " oc_team ",
      chatIds: ["ou_owner", "oc_team", " "],
      platform: "feishu",
      enabled: true,
    });

    expect(config.chatId).toBe("ou_owner");
    expect(config.chatIds).toEqual(["ou_owner", "oc_team"]);
  });

  it("does not require delivery for skill-only jobs", () => {
    expect(cronJobRequiresDelivery({
      skillId: "daily-digest",
      direct: false,
      sendSkillOutput: undefined,
    })).toBe(false);
  });

  it("requires delivery for sendSkillOutput and direct jobs", () => {
    expect(cronJobRequiresDelivery({
      skillId: undefined,
      direct: false,
      sendSkillOutput: "daily-digest",
    })).toBe(true);
    expect(cronJobRequiresDelivery({
      skillId: undefined,
      direct: true,
      sendSkillOutput: undefined,
    })).toBe(true);
  });
});
