import { describe, expect, it } from "vitest";
import {
  DAILY_DIGEST_GENERATE_JOB_ID,
  DAILY_DIGEST_SEND_JOB_ID,
  buildDefaultDailyDigestCronJobs,
  ensureDefaultDailyDigestCronJobs,
} from "../../src/cron/default-jobs.js";

describe("cron/default-jobs", () => {
  it("builds generate and send jobs with 9am/10am schedules", () => {
    const jobs = buildDefaultDailyDigestCronJobs("oc_team");

    expect(jobs).toEqual([
      expect.objectContaining({
        id: DAILY_DIGEST_GENERATE_JOB_ID,
        schedule: "0 9 * * *",
        skillId: "daily-digest",
        enabled: true,
        chatId: "",
      }),
      expect.objectContaining({
        id: DAILY_DIGEST_SEND_JOB_ID,
        schedule: "0 10 * * *",
        sendSkillOutput: "daily-digest",
        chatId: "oc_team",
        enabled: true,
      }),
    ]);
  });

  it("disables the send job when no default target is available", () => {
    const jobs = buildDefaultDailyDigestCronJobs("");
    expect(jobs[1]).toEqual(expect.objectContaining({
      id: DAILY_DIGEST_SEND_JOB_ID,
      chatId: "",
      enabled: false,
    }));
  });

  it("upgrades the legacy single seeded job into the new pair", () => {
    const jobs = ensureDefaultDailyDigestCronJobs([{
      id: "daily-digest",
      schedule: "0 9 * * *",
      message: "请搜索今天的科技新闻头条，保存到新闻库，并生成一份简短的日报摘要。",
      chatId: "oc_legacy",
      platform: "feishu",
      enabled: true,
    }], "");

    expect(jobs.map((job) => job.id)).toEqual([
      DAILY_DIGEST_GENERATE_JOB_ID,
      DAILY_DIGEST_SEND_JOB_ID,
    ]);
    expect(jobs[1]).toEqual(expect.objectContaining({
      chatId: "oc_legacy",
      enabled: true,
    }));
  });
});
