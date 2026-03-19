import { z } from "zod";
import { defineTool } from "./types.js";
import type { Tool } from "./types.js";
import type {
  FeishuDepartment,
  FeishuDepartmentUser,
  FeishuDepartmentUserPage,
  FeishuPlatform,
} from "../platform/feishu.js";

const departmentSchema = z.object({
  department: z.string().min(1).describe("部门 open_department_id，或用于搜索的部门名称关键词"),
});

const departmentUsersSchema = z.object({
  department: z.string().min(1).describe("部门 open_department_id，或用于搜索的部门名称关键词"),
  limit: z.number().int().min(1).max(100).optional().describe("最多返回多少位直属成员，默认 20"),
});

/**
 * Create Feishu org-read tools backed by the active Feishu platform instance.
 *
 * These tools only work when the configured Feishu app has Contact/Department read scopes.
 */
export function createFeishuOrgTools(getFeishu: () => FeishuPlatform | undefined): Tool[] {
  const departmentInfoTool = defineTool({
    name: "feishu_department_info",
    description: "查询飞书部门信息，可回答部门人数、部门 ID、上级部门等问题",
    schema: departmentSchema,
    execute: async (input) => runWithFeishu(getFeishu, async (feishu) => {
      const resolved = await resolveDepartment(feishu, input.department);
      if ("error" in resolved) return { error: resolved.error };
      return { output: formatDepartment(resolved.department) };
    }),
  });

  const departmentUsersTool = defineTool({
    name: "feishu_department_users",
    description: "查询飞书部门的直属成员列表，可用于回答部门成员、人数等问题",
    schema: departmentUsersSchema,
    execute: async (input) => runWithFeishu(getFeishu, async (feishu) => {
      const resolved = await resolveDepartment(feishu, input.department);
      if ("error" in resolved) return { error: resolved.error };

      const limit = input.limit ?? 20;
      const listed = await listDepartmentUsers(feishu, resolved.department.open_department_id, limit);
      return {
        output: formatDepartmentUsers(resolved.department, listed.items, limit, listed.hasMore),
      };
    }),
  });

  return [departmentInfoTool, departmentUsersTool];
}

async function runWithFeishu(
  getFeishu: () => FeishuPlatform | undefined,
  execute: (feishu: FeishuPlatform) => Promise<{ output?: string; error?: string }>,
): Promise<{ output?: string; error?: string }> {
  const feishu = getFeishu();
  if (!feishu) {
    return { error: "飞书未配置，无法读取通讯录；请先在设置中填写飞书应用凭证并开通通讯录读取权限。" };
  }

  try {
    return await execute(feishu);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `飞书通讯录查询失败：${message}。请检查应用是否已开通通讯录 / 部门读取权限。` };
  }
}

async function resolveDepartment(
  feishu: FeishuPlatform,
  query: string,
): Promise<{ department: FeishuDepartment } | { error: string }> {
  if (looksLikeDepartmentId(query)) {
    return { department: await feishu.getDepartment(query.trim()) };
  }

  const matches = await feishu.findDepartmentsByName(query);
  if (matches.length === 0) {
    return { error: `未找到匹配部门：${query}` };
  }
  if (matches.length > 1) {
    return { error: buildAmbiguousDepartmentError(query, matches) };
  }
  const [department] = matches;
  if (!department) {
    return { error: `未找到匹配部门：${query}` };
  }
  return { department };
}

async function listDepartmentUsers(
  feishu: FeishuPlatform,
  departmentId: string,
  limit: number,
): Promise<FeishuDepartmentUserPage> {
  const items: FeishuDepartmentUser[] = [];
  let pageToken: string | undefined;
  let hasMore = false;

  do {
    const page = await feishu.listDepartmentUsers(departmentId, {
      pageSize: Math.min(limit - items.length, 50),
      ...(pageToken ? { pageToken } : {}),
    });
    items.push(...page.items);
    hasMore = page.hasMore;
    pageToken = page.hasMore && items.length < limit ? page.pageToken : undefined;
  } while (pageToken && items.length < limit);

  return {
    items: items.slice(0, limit),
    hasMore: hasMore || items.length > limit,
    ...(pageToken ? { pageToken } : {}),
  };
}

function buildAmbiguousDepartmentError(query: string, matches: FeishuDepartment[]): string {
  const candidates = matches
    .slice(0, 5)
    .map((department) => `${department.name} (${department.open_department_id})`)
    .join("\n");
  return `找到多个匹配部门：${query}\n${candidates}\n请改用 open_department_id 重新查询。`;
}

function formatDepartment(department: FeishuDepartment): string {
  const lines = [
    `部门名称：${department.name}`,
    `open_department_id：${department.open_department_id}`,
    `上级部门：${department.parent_department_id ?? "-"}`,
    `部门人数：${department.member_count ?? "未返回"}`,
  ];

  if (department.leader_user_id) {
    lines.push(`负责人 open_id：${department.leader_user_id}`);
  }

  return lines.join("\n");
}

function formatDepartmentUsers(
  department: FeishuDepartment,
  users: FeishuDepartmentUser[],
  limit: number,
  hasMore: boolean,
): string {
  const header = [
    `部门名称：${department.name}`,
    `open_department_id：${department.open_department_id}`,
    `直属成员返回数：${users.length}`,
  ];

  if (users.length === 0) {
    header.push("直属成员：空");
    return header.join("\n");
  }

  const lines = users.map((user, index) => `${index + 1}. ${formatUser(user)}`);
  if (hasMore || (department.member_count ?? 0) > limit) {
    lines.push(`已按 limit=${limit} 截断结果。`);
  }

  return [...header, ...lines].join("\n");
}

function formatUser(user: FeishuDepartmentUser): string {
  const parts = [user.name];
  if (user.open_id) parts.push(`open_id=${user.open_id}`);
  if (user.email) parts.push(`email=${user.email}`);
  if (user.mobile) parts.push(`mobile=${user.mobile}`);
  if (user.employee_no) parts.push(`employee_no=${user.employee_no}`);
  return parts.join(" | ");
}

function looksLikeDepartmentId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "0" || /^od[-_]/.test(trimmed);
}
