/**
 * 工具元数据与项目工具探测（FEAT-005 SSOT 接入 / REFACTOR-001 PR-2 统一引用）
 *
 * 职责：
 *   作为前端"工具"概念的薄类型适配层，实际数据全部来自 SSOT（@aitools/shared）。
 *   不再硬编码工具列表 / 显示名 / 项目目录别名。
 *
 * 历史变更：
 *   FEAT-004：本文件维护 AVAILABLE_TOOLS / TOOL_PROJECT_DIR_ALIASES / TOOL_DISPLAY_NAME 三套硬编码
 *   FEAT-005：删除全部硬编码，改为 import @shared/tools.json；下线 TOOL_PROJECT_DIR_ALIASES
 *             双名映射（迁移管线已把 .claude-code 改写为 .claude-internal，无需运行时兼容）
 *   REFACTOR-001 PR-2：@shared/* Vite alias 统一收敛为 @aitools/shared workspace 包引用
 */

import {
  TOOLS,
  type ToolDefinition as SsotToolDefinition,
} from '@aitools/shared';

/* ============================================================
 * 类型适配层（保留前端原有 ToolDefinition 字段命名风格）
 * ============================================================ */

/** 预定义工具元数据（前端形态） */
export interface ToolDefinition {
  /** 工具唯一标识，与 CLI target.name 一致 */
  name: string;
  /** UI 展示名 */
  displayName: string;
  /** 用户级目录路径（约定 ~/<base>） */
  userBase: string;
}

/* ============================================================
 * 强类型 SSOT 引用 + 派生数据
 * ============================================================ */

/**
 * 预定义可连接工具列表
 *
 * 来源：@aitools/shared（tools.json 编译期 inline）
 * 顺序：保持 SSOT 中的声明顺序（影响 GUI AddToolModal 选项顺序）
 */
export const AVAILABLE_TOOLS: ToolDefinition[] = TOOLS.tools.map(
  (t: SsotToolDefinition) => ({
    name: t.name,
    displayName: t.displayName,
    userBase: t.userBase,
  }),
);

/**
 * 工具名 → 项目根目录候选标记目录名映射
 *
 * FEAT-005 简化：每个工具只保留 SSOT 中声明的 projectDirAliases。
 * 删除了 FEAT-004 中的 claude-internal/claude-code 双名兼容（已通过迁移管线统一为 claude-internal）。
 */
export const TOOL_PROJECT_DIR_ALIASES: Record<string, string[]> =
  Object.fromEntries(
    TOOLS.tools.map((t: SsotToolDefinition) => [t.name, t.projectDirAliases]),
  );

/**
 * 工具名 → 展示名映射
 *
 * 用于：Skills 行 badge 文案、SubscribePopover 副文案、InvalidProjectModal 已连接列表。
 * 任何 raw target.target 字段都能映射出 displayName，未匹配时回退原值。
 *
 * FEAT-005：保留 cursor 兜底（不在 SSOT 中但 Tools 页历史展示过）；
 * 其他工具直接来自 SSOT。
 */
export const TOOL_DISPLAY_NAME: Record<string, string> = {
  ...Object.fromEntries(
    TOOLS.tools.map((t: SsotToolDefinition) => [t.name, t.displayName]),
  ),
  /* 兼容性：Tools 页历史上还展示过 cursor，本表保留以避免回归 */
  cursor: 'Cursor',
};

/**
 * 获取工具的展示名
 *
 * @param toolName 工具名（如 'codebuddy' / 'claude-internal'）
 * @returns 展示名；无映射时回退为 toolName 原值
 */
export function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAME[toolName] ?? toolName;
}

/**
 * 聚合一组工具的"期望存在的标记目录名"集合（去重）
 *
 * @param tools 工具名列表（如 ['codebuddy', 'claude-internal']）
 * @returns 候选目录名列表（如 ['.codebuddy', '.claude-internal']）
 */
export function aggregateExpectedDirs(tools: string[]): string[] {
  const set = new Set<string>();
  for (const t of tools) {
    const aliases = TOOL_PROJECT_DIR_ALIASES[t];
    if (!aliases) continue;
    for (const dir of aliases) set.add(dir);
  }
  return Array.from(set);
}

/**
 * 探测当前项目实际关联的工具集合
 *
 * 数据流：
 *   connectedTools → 展开为候选目录名 → 调用 Tauri detect_project_tools
 *   → 反向映射回 tool name 集合（保持 connectedTools 中的顺序，去重）
 *
 * 故意不持久化（Q-1 决策）：每次需要时重新计算，避免脏数据。
 *
 * @param projectDir      项目绝对路径（必须，禁止依赖 process.cwd()）
 * @param connectedTools  全局已连接工具的 target.name 列表
 * @returns 实际关联的工具 name 列表；目录不存在或无任何匹配时返回 []
 */
export async function detectProjectTools(
  projectDir: string,
  connectedTools: string[],
): Promise<string[]> {
  if (!projectDir || connectedTools.length === 0) {
    return [];
  }

  /* Step 1: 展开候选目录名（含 alias） */
  const candidateDirs = aggregateExpectedDirs(connectedTools);
  if (candidateDirs.length === 0) {
    return [];
  }

  /* Step 2: 调用 Tauri 命令做 fs 探测 */
  let existingDirs: string[];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    existingDirs = await invoke<string[]>('detect_project_tools', {
      projectDir,
      candidateDirs,
    });
  } catch {
    /* Tauri 命令失败（如非 Tauri 环境、目录消失）→ 视为无匹配，让上层走兜底分支 */
    return [];
  }

  if (existingDirs.length === 0) {
    return [];
  }

  /* Step 3: 反向映射 —— 任一候选目录命中即认为该工具关联 */
  const existingSet = new Set(existingDirs);
  const result: string[] = [];
  for (const tool of connectedTools) {
    const aliases = TOOL_PROJECT_DIR_ALIASES[tool];
    if (!aliases) continue;
    /* 任一 alias 命中即视作关联 */
    if (aliases.some((dir) => existingSet.has(dir))) {
      if (!result.includes(tool)) {
        result.push(tool);
      }
    }
  }

  return result;
}
