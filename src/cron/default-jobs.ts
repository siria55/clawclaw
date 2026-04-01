import type { CronJobConfig } from "./types.js";
import { normalizeCronJobConfig } from "./types.js";

const LEGACY_DAILY_DIGEST_JOB_ID = "daily-digest";
const LEGACY_DAILY_DIGEST_MESSAGE = "请搜索今天的科技新闻头条，保存到新闻库，并生成一份简短的日报摘要。";

export const DAILY_DIGEST_GENERATE_JOB_ID = "daily-digest-generate";
export const DAILY_DIGEST_SEND_JOB_ID = "daily-digest-send";

export function buildDefaultDailyDigestCronJobs(defaultChatId: string): CronJobConfig[] {
  const chatId = defaultChatId.trim();
  return [
    normalizeCronJobConfig({
      id: DAILY_DIGEST_GENERATE_JOB_ID,
      schedule: "0 9 * * *",
      message: "执行 daily-digest，生成当天新闻内容。",
      skillId: "daily-digest",
      chatId: "",
      platform: "feishu",
      enabled: true,
    }),
    normalizeCronJobConfig({
      id: DAILY_DIGEST_SEND_JOB_ID,
      schedule: "0 10 * * *",
      message: "发送 daily-digest 当日日报到飞书。",
      sendSkillOutput: "daily-digest",
      chatId,
      platform: "feishu",
      enabled: chatId.length > 0,
    }),
  ];
}

export function ensureDefaultDailyDigestCronJobs(
  configs: CronJobConfig[],
  defaultChatId: string,
): CronJobConfig[] {
  if (configs.length === 0) {
    return buildDefaultDailyDigestCronJobs(defaultChatId);
  }

  if (configs.length === 1 && isLegacyDailyDigestJob(configs[0]!)) {
    const legacy = configs[0]!;
    return buildDefaultDailyDigestCronJobs(legacy.chatId || defaultChatId);
  }

  return configs;
}

function isLegacyDailyDigestJob(config: CronJobConfig): boolean {
  return config.id === LEGACY_DAILY_DIGEST_JOB_ID &&
    config.schedule === "0 9 * * *" &&
    config.message === LEGACY_DAILY_DIGEST_MESSAGE &&
    config.platform === "feishu" &&
    !config.skillId &&
    !config.sendSkillOutput &&
    !config.direct;
}
