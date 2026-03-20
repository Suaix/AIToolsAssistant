/**
 * 类型定义模块
 * 定义 aitools-cli 中所有核心数据结构的 TypeScript 类型
 */

/**
 * 同步目标工具配置
 * 描述一个 AI 工具的同步目标信息
 */
export interface Target {
  /** 目标工具名称，如 'codebuddy' 或 'claude-code' */
  name: string;
  /** 是否启用该目标 */
  enabled: boolean;
  /** 用户级 Skills 目录路径（绝对路径或以 ~ 开头） */
  user_path: string;
}

/**
 * 同步选项配置
 * 控制同步行为的参数
 */
export interface SyncOptions {
  /** 默认同步范围：user（用户级） */
  default_scope: 'user';
  /** 同步前是否清理目标中不存在于源的 Skill */
  clean: boolean;
}

/**
 * 全局配置文件结构
 * 对应 ~/.aitools/config.yaml 的完整结构
 */
export interface Config {
  /** Skills 源目录路径（用户初始化时指定） */
  source: string;
  /** 同步目标工具列表 */
  targets: Target[];
  /** 同步选项 */
  sync: SyncOptions;
}

/**
 * Skill 元数据信息
 * 从 SKILL.md frontmatter 中解析出的元信息
 */
export interface SkillInfo {
  /** Skill 名称（优先取 frontmatter 中的 name，否则用文件夹名） */
  name: string;
  /** Skill 描述（取 frontmatter 中的 description，无则为 '-'） */
  description: string;
  /** Skill 文件夹在源目录中的绝对路径 */
  path: string;
  /** Skill 文件夹名（即目录名） */
  dirName: string;
}

/**
 * 单个 Skill 的同步状态（针对单个目标）
 */
export type SkillSyncStatus = 'synced' | 'changed' | 'not_synced';

/**
 * 单个 Skill 对单个目标的同步结果
 */
export interface SkillTargetSyncResult {
  /** 目标工具名称 */
  targetName: string;
  /** 同步动作：created-新增、updated-更新、skipped-跳过 */
  action: 'created' | 'updated' | 'skipped';
}

/**
 * 单个 Skill 的同步结果汇总
 */
export interface SkillSyncResult {
  /** Skill 名称 */
  skillName: string;
  /** 各目标的同步结果 */
  targetResults: SkillTargetSyncResult[];
}

/**
 * 完整同步操作的结果摘要
 */
export interface SyncSummary {
  /** 总 Skill 数量 */
  totalSkills: number;
  /** 新增数量 */
  created: number;
  /** 更新数量 */
  updated: number;
  /** 跳过数量（无变更） */
  skipped: number;
  /** 各 Skill 的详细同步结果 */
  results: SkillSyncResult[];
}

/**
 * 单个 Skill 在 list 命令中的展示信息
 */
export interface SkillListItem {
  /** Skill 名称 */
  name: string;
  /** Skill 描述 */
  description: string;
  /** 综合同步状态 */
  status: SkillSyncStatus;
  /** 各目标的详细同步状态 */
  targetStatuses: {
    /** 目标工具名称 */
    targetName: string;
    /** 该目标的同步状态 */
    status: SkillSyncStatus;
  }[];
}
