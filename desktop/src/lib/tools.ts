/**
 * 工具元数据与项目工具探测（FEAT-004）
 *
 * 作为前端"工具"概念的单一真相源：
 *   · AVAILABLE_TOOLS         —— 预定义可连接工具（与 CLI target.name 对齐）
 *   · TOOL_PROJECT_DIR_ALIASES —— 工具名 → 项目根标记目录候选名（含双名兼容）
 *   · TOOL_DISPLAY_NAME       —— 工具名 → 展示名（含双名兼容）
 *   · detectProjectTools      —— 通过 Tauri 命令动态探测当前项目实际关联的工具
 *
 * 双名兼容（D-8）：仓库内对 Claude 工具存在 'claude-internal' / 'claude-code' 两版命名，
 *   本任务保持只读不统一，由 FEAT-005 后续治理。
 */

/** 预定义工具元数据 */
export interface ToolDefinition {
  /** 工具唯一标识，与 CLI target.name 一致 */
  name: string;
  /** UI 展示名 */
  displayName: string;
  /** 用户级目录路径（约定 ~/<base>） */
  userBase: string;
}

/** 预定义可连接工具列表（迁出自 AddToolModal.tsx） */
export const AVAILABLE_TOOLS: ToolDefinition[] = [
  { name: 'codebuddy', displayName: 'CodeBuddy', userBase: '~/.codebuddy' },
  { name: 'workbuddy', displayName: 'WorkBuddy', userBase: '~/.workbuddy' },
  {
    name: 'claude-internal',
    displayName: 'Claude Internal',
    userBase: '~/.claude-internal',
  },
];

/**
 * 工具名 → 项目根目录候选标记目录名（含双名兼容映射）
 *
 * 规则：value 中的目录名带 . 前缀；命中其中任一即认为该工具与项目关联。
 *
 * 双名兼容：claude-internal 与 claude-code 互为 alias，
 *   既识别 .claude-internal/ 也识别 .claude-code/。
 *   FEAT-005 完成统一后可简化为单向映射。
 */
export const TOOL_PROJECT_DIR_ALIASES: Record<string, string[]> = {
  codebuddy: ['.codebuddy'],
  workbuddy: ['.workbuddy'],
  'claude-internal': ['.claude-internal', '.claude-code'],
  'claude-code': ['.claude-code', '.claude-internal'],
};

/**
 * 工具名 → 展示名映射（含双名兼容）
 *
 * 用于：Skills 行 badge 文案、SubscribePopover 副文案、InvalidProjectModal 已连接列表。
 * 任何 raw target.target 字段都能映射出 displayName，未匹配时回退原值。
 */
export const TOOL_DISPLAY_NAME: Record<string, string> = {
  codebuddy: 'CodeBuddy',
  workbuddy: 'WorkBuddy',
  'claude-internal': 'Claude Internal',
  'claude-code': 'Claude Code',
  /* 兼容性：Tools 页历史上还展示过 cursor，本表保留以避免回归 */
  cursor: 'Cursor',
};

/**
 * 获取工具的展示名
 *
 * @param toolName 工具名（如 'codebuddy' / 'claude-code'）
 * @returns 展示名；无映射时回退为 toolName 原值
 */
export function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAME[toolName] ?? toolName;
}

/**
 * 聚合一组工具的"期望存在的标记目录名"集合（去重）
 *
 * @param tools 工具名列表（如 ['codebuddy', 'claude-internal']）
 * @returns 候选目录名列表（如 ['.codebuddy', '.claude-internal', '.claude-code']）
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
