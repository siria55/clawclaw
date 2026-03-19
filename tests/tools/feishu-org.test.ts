import { describe, expect, it, vi } from "vitest";
import { createFeishuOrgTools } from "../../src/tools/feishu-org.js";
import type { FeishuPlatform } from "../../src/platform/feishu.js";

describe("createFeishuOrgTools", () => {
  it("returns configuration error when Feishu is unavailable", async () => {
    const tools = createFeishuOrgTools(() => undefined);
    const tool = tools.find((item) => item.name === "feishu_department_info");

    const result = await tool!.execute({ department: "研发部" });
    expect(result.error).toContain("飞书未配置");
  });

  it("resolves a unique department by name", async () => {
    const feishu = createFeishuStub({
      findDepartmentsByName: vi.fn().mockResolvedValue([
        {
          name: "研发部",
          open_department_id: "od_rnd",
          parent_department_id: "od_root",
          member_count: 18,
        },
      ]),
    });
    const tools = createFeishuOrgTools(() => feishu);
    const tool = tools.find((item) => item.name === "feishu_department_info");

    const result = await tool!.execute({ department: "研发部" });

    expect(result.output).toContain("部门名称：研发部");
    expect(result.output).toContain("部门人数：18");
  });

  it("returns candidate ids when department name is ambiguous", async () => {
    const feishu = createFeishuStub({
      findDepartmentsByName: vi.fn().mockResolvedValue([
        { name: "销售部", open_department_id: "od_sales" },
        { name: "销售部华北", open_department_id: "od_sales_north" },
      ]),
    });
    const tools = createFeishuOrgTools(() => feishu);
    const tool = tools.find((item) => item.name === "feishu_department_info");

    const result = await tool!.execute({ department: "销售部" });

    expect(result.error).toContain("找到多个匹配部门");
    expect(result.error).toContain("od_sales");
    expect(result.error).toContain("od_sales_north");
  });

  it("lists direct department users and marks truncated output", async () => {
    const getDepartment = vi.fn().mockResolvedValue({
      name: "研发部",
      open_department_id: "od_rnd",
      member_count: 8,
    });
    const listDepartmentUsers = vi.fn().mockResolvedValue({
      items: [
        { name: "张三", open_id: "ou_1", email: "zhangsan@example.com" },
        { name: "李四", open_id: "ou_2" },
      ],
      hasMore: true,
      pageToken: "next-token",
    });
    const feishu = createFeishuStub({ getDepartment, listDepartmentUsers });
    const tools = createFeishuOrgTools(() => feishu);
    const tool = tools.find((item) => item.name === "feishu_department_users");

    const result = await tool!.execute({ department: "od_rnd", limit: 2 });

    expect(getDepartment).toHaveBeenCalledWith("od_rnd");
    expect(listDepartmentUsers).toHaveBeenCalledWith("od_rnd", { pageSize: 2, pageToken: undefined });
    expect(result.output).toContain("1. 张三 | open_id=ou_1 | email=zhangsan@example.com");
    expect(result.output).toContain("已按 limit=2 截断结果");
  });
});

function createFeishuStub(
  overrides: Partial<{
    getDepartment: FeishuPlatform["getDepartment"];
    findDepartmentsByName: FeishuPlatform["findDepartmentsByName"];
    listDepartmentUsers: FeishuPlatform["listDepartmentUsers"];
  }> = {},
): FeishuPlatform {
  return {
    getDepartment: overrides.getDepartment ?? vi.fn(),
    findDepartmentsByName: overrides.findDepartmentsByName ?? vi.fn().mockResolvedValue([]),
    listDepartmentUsers: overrides.listDepartmentUsers ?? vi.fn().mockResolvedValue({
      items: [],
      hasMore: false,
      pageToken: undefined,
    }),
  } as unknown as FeishuPlatform;
}
