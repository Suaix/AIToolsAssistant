/**
 * 类型定义模块
 * 定义 aitools-cli 中所有核心数据结构的 TypeScript 类型
 */

/* ============================================================
 * 资源类型抽象（v0.2.0 新增）
 * 用于支持 skills/commands/agents/rules 多种资源类型统一管理
 * ============================================================ */

/**
 * 支持的资源类型枚举
 * 当前仅 skills 完整实现，其他类型预留占位
 */
export type ResourceType = 'skills' | 'commands' | 'agents' | 'rules';

/**
 * 资源层级范围
 * - user：用户级，同步到用户主目录下的 AI 工具目录
 * - project：项目级，同步到当前项目目录下的 AI 工具目录
 *
 * @deprecated v0.4 引入订阅模型后，"层级"不再是资源的属性，而是订阅关系的属性。
 * 本类型将在 v0.4.0 的 PR-2 中正式删除。新代码请直接使用下方的
 * `SubscriptionScope`（含义相同但语义由"资源属性"变为"订阅落点"）。
 */
export type ResourceScope = 'user' | 'project';

/**
 * 单个资源的元数据信息
 * 取代原 SkillInfo，适用于所有资源类型
 */
export interface ResourceInfo {
  /** 资源名称（优先取主文件 frontmatter 中的 name，否则用文件夹名） */
  name: string;
  /** 资源描述（frontmatter 中的 description，无则为 '-'） */
  description: string;
  /** 资源文件夹的绝对路径 */
  path: string;
  /** 资源文件夹名（即目录名） */
  dirName: string;
  /**
   * 资源所属层级（user/project）
   *
   * @deprecated v0.4 订阅模型引入后，资源本身不再有"层级"属性。
   * 该字段将在 PR-2 的扫描逻辑重写中移除。当前保留仅为让 PR-1
   * 可独立编译通过；新代码请勿依赖该字段。
   */
  scope: ResourceScope;
  /** 资源类型 */
  type: ResourceType;
}

/**
 * 资源处理器接口
 * 每种资源类型实现该接口，封装扫描/路径推导/主文件识别等差异化行为
 *
 * v0.4.0：`scan()` 移除 `scope` 参数，从扁平的 `<source>/<resourceDirName>/<name>/` 读取
 */
export interface ResourceHandler {
  /** 资源类型 */
  type: ResourceType;
  /** 是否已实现（false 表示占位，CLI 会统一提示「暂未支持」） */
  implemented: boolean;
  /**
   * 在源目录和目标目录中使用的子目录名
   * 例如 skills → 'skills'；源路径 <source>/skills/<name>/；目标路径 <user_base>/skills/<name>/
   */
  resourceDirName: string;
  /** 资源类型的展示名称（用于日志输出，如 'Skills'） */
  displayName: string;
  /**
   * 扫描源目录下该类型的所有资源
   * v0.4.0：从 `<sourceDir>/<resourceDirName>/` 扁平读取，不再按 scope 分层
   * @param sourceDir 源目录根路径（已展开 ~）
   * @returns 所有有效资源的元数据数组；目录不存在时返回空数组
   */
  scan(sourceDir: string): Promise<ResourceInfo[]>;
}

/* ============================================================
 * 订阅模型（v0.4.0 引入）
 * 定义：一个「订阅」= 把一个资源同步到一个「位置」的声明
 * 详见 docs/rfcs/v0.4.0-subscription-model.md
 * ============================================================ */

/**
 * 订阅落点类型
 * - user：全局用户级（由 `~/.aitools/config.yaml` 的 user_subscriptions 声明）
 * - project：项目级（由 `<project>/.aitools/project.yaml` 声明）
 *
 * 与 v0.2 的 `ResourceScope` 字面值相同，但语义不同：
 * - `ResourceScope` 曾是"资源的物理分层"（挂在源目录结构上）
 * - `SubscriptionScope` 是"订阅关系的落点"（挂在订阅清单里）
 */
export type SubscriptionScope = 'user' | 'project';

/**
 * 用户级订阅清单
 * 存储在 `~/.aitools/config.yaml` 的 `user_subscriptions` 字段
 * 按资源类型分组，记录该类型下"要同步到所有已启用 target 用户级目录"的资源名
 */
export interface UserSubscriptions {
  /** 已订阅到用户级的 skills 资源名（dirName）列表 */
  skills: string[];
  /** 已订阅到用户级的 commands 资源名列表（预留） */
  commands?: string[];
  /** 已订阅到用户级的 agents 资源名列表（预留） */
  agents?: string[];
  /** 已订阅到用户级的 rules 资源名列表（预留） */
  rules?: string[];
}

/**
 * 单个资源在某个目标的单次同步状态
 * 用于"资源视图"中展示"本订阅位置下、各 target 的同步情况"
 */
export interface SubscriptionTargetStatus {
  /** 目标工具名（对应 `Target.name`，如 'codebuddy'） */
  target: string;
  /** 在该目标的同步状态 */
  status: 'synced' | 'changed' | 'not_synced';
  /** 该资源在目标中的绝对路径（不存在时仍给出推导路径） */
  targetPath: string;
}

/**
 * 单个订阅位置的展开状态
 * 对应"一个资源的一条订阅声明"展开后，在所有参与 target 下的同步状态集合
 */
export interface SubscriptionStatus {
  /** 订阅落点类型 */
  scope: SubscriptionScope;
  /**
   * 项目目录的绝对路径
   * 仅 `scope === 'project'` 时有值；`scope === 'user'` 时缺省
   */
  projectDir?: string;
  /** 本订阅位置下、各 target 的同步状态 */
  targets: SubscriptionTargetStatus[];
}

/**
 * 一个资源的完整视图
 * list 命令与 GUI 卡片都以此为单一数据结构
 * 一个资源可以有 0~N 条订阅（`subscriptions.length === 0` 表示"候选未订阅"）
 */
export interface ResourceView {
  /** 资源名称（优先取 frontmatter 中的 name） */
  name: string;
  /** 资源文件夹名 */
  dirName: string;
  /** 资源描述 */
  description: string;
  /** 资源类型 */
  type: ResourceType;
  /** 资源文件夹的绝对路径 */
  path: string;
  /** 资源文件夹的 SHA-256 hash（用于变更检测） */
  sourceHash: string;
  /** 该资源的所有订阅位置；空数组表示源目录中存在但未被任何位置订阅 */
  subscriptions: SubscriptionStatus[];
}

/* ============================================================
 * 全局配置类型（v0.2.0 破坏性变更：user_path → user_base）
 * ============================================================ */

/**
 * 同步目标工具配置
 * 描述一个 AI 工具的同步目标信息
 */
export interface Target {
  /** 目标工具名称，如 'codebuddy' 或 'claude-code' */
  name: string;
  /** 是否启用该目标 */
  enabled: boolean;
  /**
   * 用户级基础目录路径（绝对路径或以 ~ 开头）
   * 实际同步路径 = <user_base>/<resource_dir_name>/
   * 例如 user_base=~/.codebuddy → skills 目录为 ~/.codebuddy/skills/
   */
  user_base: string;
}

/**
 * 同步选项配置
 * 控制同步行为的参数
 */
export interface SyncOptions {
  /** 默认同步范围：user（用户级） */
  default_scope: 'user';
  /** 同步前是否清理目标中不存在于源的资源 */
  clean: boolean;
}

/**
 * 全局配置文件结构
 * 对应 ~/.aitools/config.yaml 的完整结构
 */
export interface Config {
  /** 资源源目录路径（用户初始化时指定，默认 ~/.aitools/） */
  source: string;
  /** 同步目标工具列表 */
  targets: Target[];
  /** 同步选项 */
  sync: SyncOptions;
  /**
   * 用户级订阅清单（v0.4 新增）
   * 记录"要自动同步到所有启用 target 用户级目录"的资源
   */
  user_subscriptions: UserSubscriptions;
}

/* ============================================================
 * 兼容别名：保留 SkillInfo 作为 ResourceInfo 的别名，便于渐进迁移
 * （旧代码若仍引用 SkillInfo，其语义等价于 ResourceInfo）
 * ============================================================ */

/**
 * Skill 元数据信息（旧名称，等价于 ResourceInfo）
 * @deprecated 请使用 ResourceInfo
 */
export type SkillInfo = ResourceInfo;

/* ============================================================
 * 同步结果类型
 * ============================================================ */

/**
 * 单个资源的同步状态（针对单个目标）
 */
export type SkillSyncStatus = 'synced' | 'changed' | 'not_synced';

/**
 * 单个资源对单个目标的同步结果
 */
export interface SkillTargetSyncResult {
  /** 目标工具名称 */
  targetName: string;
  /** 同步动作：created-新增、updated-更新、skipped-跳过 */
  action: 'created' | 'updated' | 'skipped';
}

/**
 * 单个资源的同步结果汇总
 */
export interface SkillSyncResult {
  /** 资源名称 */
  skillName: string;
  /** 各目标的同步结果 */
  targetResults: SkillTargetSyncResult[];
}

/**
 * 完整同步操作的结果摘要
 */
export interface SyncSummary {
  /** 总资源数量 */
  totalSkills: number;
  /** 新增数量 */
  created: number;
  /** 更新数量 */
  updated: number;
  /** 跳过数量（无变更） */
  skipped: number;
  /** 各资源的详细同步结果 */
  results: SkillSyncResult[];
}

/**
 * 单个资源在 list 命令中的展示信息
 */
export interface SkillListItem {
  /** 资源名称 */
  name: string;
  /** 资源描述 */
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

/* ============================================================
 * JSON 输出协议（v0.3.0 新增）
 * --json 模式下通过 stdout 以 NDJSON（每行一个 JSON）方式输出事件
 * 面向 GUI 等机器消费方，保证稳定的数据契约
 * ============================================================ */

/**
 * 单个资源在 list 命令 JSON 输出中的条目
 */
export interface ResourceListItem {
  /** 资源显示名称（frontmatter 中的 name 或文件夹名） */
  name: string;
  /** 资源文件夹名（同步时的 key） */
  dirName: string;
  /** 资源描述（可能为 '-'） */
  description: string;
  /** 资源所属层级 */
  scope: ResourceScope;
  /** 资源文件夹的绝对路径 */
  path: string;
  /** 源目录 hash（SHA-256，完整 64 位；前 8 位用于人类展示） */
  sourceHash: string;
  /** 各目标的同步状态 */
  targets: {
    /** 目标工具名称（如 codebuddy） */
    name: string;
    /** 在该目标中的同步状态 */
    status: SkillSyncStatus;
    /** 目标中的资源目录路径（若不存在则为 null） */
    targetPath: string;
  }[];
}

/**
 * list 命令 JSON 输出的 data 载荷
 *
 * v0.4.0：
 * - 每种资源类型 emit **一条** list 事件（不再按 scope 拆分为 user/project 两条）
 * - `resources` 数组的每一项是完整 `ResourceView`，自带订阅清单
 * - 新增 `version: 2` 字段，供 GUI 做协议版本兼容
 * - 删除 v0.3 的顶层 `scope` 字段（原语义已被 ResourceView.subscriptions 承载）
 *
 * 详见 RFC-001 §3.2
 */
export interface ListEventData {
  /** 事件协议版本（v0.4.0 起为 2） */
  version: 2;
  /** 资源类型 */
  type: ResourceType;
  /** 本类型下的所有资源视图（含订阅与状态） */
  resources: ResourceView[];
  /** 已启用目标名列表（帮助 GUI 建立列头） */
  enabledTargets: string[];
  /**
   * 当前 cwd 对应的项目路径
   * 仅当 `<cwd>/.aitools/project.yaml` 存在时有值；
   * GUI 可据此判断"项目级订阅"一列是否可显示
   */
  projectDir?: string;
}

/**
 * 订阅位置的 JSON 表达
 * v0.4.0：所有 sync 事件用该对象描述订阅落点（取代原有顶层 `scope` 字段）
 */
export interface SyncLocationData {
  /** 落点类型 */
  scope: SubscriptionScope;
  /** 项目绝对路径（scope=project 时有值） */
  projectDir?: string;
}

/**
 * sync 命令流式事件类型枚举
 */
export type SyncEventType = 'start' | 'progress' | 'summary' | 'done' | 'error';

/**
 * start 事件载荷：同步任务开始
 *
 * v0.4.0：删除顶层 `scope` 字段，改用 `location`；新增 `version: 2`
 */
export interface SyncStartData {
  /** 事件协议版本（v0.4.0 起为 2） */
  version: 2;
  /** 资源类型 */
  type: ResourceType;
  /** 订阅落点（同一个资源在不同落点会发多次 start） */
  location: SyncLocationData;
  /** 本次将要处理的资源总数（resource × target 的总次数） */
  total: number;
  /** 参与的目标名列表 */
  targets: string[];
}

/**
 * progress 事件载荷：每完成一个"资源 × 目标"项时触发
 *
 * v0.4.0：`scope` → `location`
 */
export interface SyncProgressData {
  /** 事件协议版本（v0.4.0 起为 2） */
  version: 2;
  /** 资源名（文件夹名） */
  resource: string;
  /** 目标工具名 */
  target: string;
  /** 订阅落点 */
  location: SyncLocationData;
  /** 动作：created / updated / skipped / failed */
  action: 'created' | 'updated' | 'skipped' | 'failed';
  /** 当前进度（1-based） */
  index: number;
  /** 总任务数 */
  total: number;
  /** 若 action === 'failed'，此处给出原因 */
  error?: string;
}

/**
 * summary 事件载荷：一次完整 sync 的汇总结果
 *
 * v0.4.0：`scope` → `location`
 */
export interface SyncSummaryData extends SyncSummary {
  /** 事件协议版本（v0.4.0 起为 2） */
  version: 2;
  /** 资源类型 */
  type: ResourceType;
  /** 订阅落点 */
  location: SyncLocationData;
}

/**
 * done 事件载荷：整个 CLI 调用结束
 */
export interface SyncDoneData {
  /** 进程退出码（0 = 成功） */
  exitCode: number;
}

/**
 * error 事件载荷：CLI 级错误（非单个资源失败）
 */
export interface ErrorEventData {
  /** 错误消息（人类可读） */
  message: string;
  /** 错误码（机器可读，可选） */
  code?: string;
}

/**
 * target.enabled / target.disabled 事件载荷（v0.4.2 新增 / RFC-001.1）
 *
 * 用于向 GUI 通报一次 target 启用/禁用操作的结果；
 * `changed` 字段用于区分"真正发生了翻转"与"幂等跳过"，
 * GUI 可据此决定是否播放刷新动画。
 */
export interface TargetEnabledData {
  /** 被操作的 target 名称（对应 Target.name） */
  name: string;
  /** 是否发生了实际状态翻转（false = 幂等跳过，状态本来就是目标态） */
  changed: boolean;
}

/**
 * 所有 JSON 事件的联合类型
 * 每个事件会作为单行 JSON 写入 stdout
 */
export type JsonEvent =
  | { event: 'list'; data: ListEventData }
  | { event: 'start'; data: SyncStartData }
  | { event: 'progress'; data: SyncProgressData }
  | { event: 'summary'; data: SyncSummaryData }
  | { event: 'done'; data: SyncDoneData }
  | { event: 'error'; data: ErrorEventData }
  /* v0.4.2 / RFC-001.1 新增：target 启用状态管理 */
  | { event: 'target.enabled'; data: TargetEnabledData }
  | { event: 'target.disabled'; data: TargetEnabledData };

/**
 * 同步进度回调
 * 由同步引擎在每完成一个"资源 × 目标"任务时触发
 */
export type SyncProgressCallback = (event: SyncProgressData) => void;

/* ============================================================
 * 项目配置类型（v0.2.0 破坏性变更：按资源类型分组）
 * ============================================================ */

/**
 * 项目级配置文件结构
 * 对应 .aitools/project.yaml
 * 按资源类型分组记录当前项目已关联的资源名称列表
 */
export interface ProjectConfig {
  /** 已关联的 Skills 名称列表 */
  skills: string[];
  /** 已关联的 Commands 名称列表（预留） */
  commands?: string[];
  /** 已关联的 Agents 名称列表（预留） */
  agents?: string[];
  /** 已关联的 Rules 名称列表（预留） */
  rules?: string[];
}
