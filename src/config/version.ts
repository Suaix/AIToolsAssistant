/**
 * 配置 schema 版本号常量（FEAT-005）
 *
 * 设计原因：
 *   v0.4.0 之前，aitools 的 yaml 配置无 version 字段；schema 升级靠 validateConfig 抛错引导用户重建。
 *   FEAT-005 引入版本感知的迁移管线，需要在 yaml 顶层写入 version 字段。
 *
 * 版本号语义（与 npm 发布版本号无直接对应）：
 *   - 1：v0.2.0 之前（已废弃，本任务不支持迁移）
 *   - 2：v0.2.0（user_path → user_base，本任务支持迁移）
 *   - 3 / 4：保留
 *   - 5：v0.4.0（引入 user_subscriptions，本任务支持迁移）
 *   - 6：v0.5.0（FEAT-005：引入 version 字段 + claude 命名统一）—— 当前版本
 *
 * 升级时机：每次 Config / ProjectConfig 结构变更必须递增对应常量，
 * 并在 src/config/migrations/ 下新增对应迁移函数。
 */

/**
 * 当前 Config（~/.aitools/config.yaml）schema 版本号
 *
 * 历史检测约定：
 *   - 文件中无 version 字段 → 视为旧版（< 6）
 *   - 文件含 version 字段 → 按数字大小判断
 */
export const CURRENT_CONFIG_VERSION = 6;

/**
 * 当前 ProjectConfig（<project>/.aitools/project.yaml）schema 版本号
 *
 * 项目级 schema 与全局级独立递增，互不影响。
 */
export const CURRENT_PROJECT_CONFIG_VERSION = 6;

/**
 * 视为"无 version 字段"的旧配置时使用的兜底版本号
 *
 * 当 yaml 文件缺失 version 字段时，迁移调度器将其视为版本 1，
 * 然后逐版本应用迁移函数直到 CURRENT_CONFIG_VERSION。
 */
export const LEGACY_VERSION_PLACEHOLDER = 1;
