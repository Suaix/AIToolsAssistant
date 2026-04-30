/**
 * target 命令族处理模块（v0.4.2 新增 / RFC-001.1）
 *
 * 提供启用/禁用同步目标工具的能力，填补 RFC-001 留下的空缺：
 * 在 v0.4.2 之前，`config.yaml` 里 `targets[].enabled` 字段只能手改。
 *
 * 本模块导出两个命令入口：
 *   - targetEnableCommand(name)  对应 `aitools target enable <name>`
 *   - targetDisableCommand(name) 对应 `aitools target disable <name>`
 *
 * 两个命令都是幂等的：重复调用不报错、不产生额外副作用（不会重写已是目标态的 yaml）。
 *
 * JSON 模式下会发射 `target.enabled` / `target.disabled` 事件，
 * 其 `changed` 字段表示是否发生了真正的状态翻转（见 §3.5 of RFC-001.1）。
 *
 * 参见：docs/rfcs/v0.4.2-target-enable-disable.md
 */
import { loadConfig, saveConfig } from '../config/manager.js';
import { reporter, isJsonMode, emitJson } from '../utils/reporter.js';

/**
 * 错误码：指定名称的 target 在配置中不存在
 * 用于 JSON 模式下 error 事件的 `code` 字段，供 GUI 程序化消费
 */
const ERR_CODE_TARGET_NOT_FOUND = 'TARGET_NOT_FOUND';

/**
 * 内部统一入口：将指定 target 的 `enabled` 字段设置到目标状态
 *
 * 语义：
 *   1. 配置缺失 → 走 loadConfig 既有的报错通道 + exitCode=1
 *   2. target 名不存在 → error 事件（code=TARGET_NOT_FOUND）+ exitCode=1，
 *      并在 human 模式下提示可用 target 清单
 *   3. 已处于目标状态 → 幂等跳过，不落盘；emit `target.{enabled,disabled}`（changed=false）
 *   4. 需要翻转 → 修改 config 并落盘；emit `target.{enabled,disabled}`（changed=true）
 *
 * @param name target 名称（对应 Target.name，如 'codebuddy'）
 * @param desired 期望的 enabled 状态（true=启用，false=禁用）
 */
async function setTargetEnabled(
  name: string,
  desired: boolean,
): Promise<void> {
  /* 1) 读配置；不存在或解析失败时 loadConfig 内部已 reporter.error/logger.error */
  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  /* 2) 查找目标 target；不存在时给出可用清单引导 */
  const target = config.targets.find((t) => t.name === name);
  if (!target) {
    const available = config.targets.map((t) => t.name).join(', ');
    reporter.error(`未知的 target: ${name}`, ERR_CODE_TARGET_NOT_FOUND);
    reporter.info(`   可用 target: ${available}`);
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  /* 3) 幂等分支：已经是目标状态，跳过写盘，但仍 emit 一个 changed=false 事件 */
  if (target.enabled === desired) {
    const verb = desired ? '启用' : '禁用';
    reporter.info(`target "${name}" 已处于${verb}状态（无变更）`);
    if (isJsonMode()) {
      emitJson({
        event: desired ? 'target.enabled' : 'target.disabled',
        data: { name, changed: false },
      });
      emitJson({ event: 'done', data: { exitCode: 0 } });
    }
    return;
  }

  /* 4) 翻转并落盘；保留 config 其他字段不动（yaml 序列化由 saveConfig 统一处理） */
  target.enabled = desired;
  await saveConfig(config);

  const verb = desired ? '已启用' : '已禁用';
  reporter.success(`target "${name}" ${verb}`);
  if (isJsonMode()) {
    emitJson({
      event: desired ? 'target.enabled' : 'target.disabled',
      data: { name, changed: true },
    });
    emitJson({ event: 'done', data: { exitCode: 0 } });
  }
}

/**
 * `aitools target enable <name>` 命令入口
 *
 * 将指定 target 的 enabled 置为 true；幂等。
 *
 * @param name 位置参数：target 名称（如 'codebuddy'、'claude-code'）
 */
export async function targetEnableCommand(name: string): Promise<void> {
  await setTargetEnabled(name, true);
}

/**
 * `aitools target disable <name>` 命令入口
 *
 * 将指定 target 的 enabled 置为 false；幂等。
 * 注意：禁用不会清理已同步目录（见 RFC-001.1 §5.1）。
 *
 * @param name 位置参数：target 名称
 */
export async function targetDisableCommand(name: string): Promise<void> {
  await setTargetEnabled(name, false);
}

/* ============================================================
 * 预定义工具列表（FEAT-003 新增）
 * ============================================================ */

/** 预定义支持的工具及其 user_base 目录 */
const AVAILABLE_TOOLS: { name: string; user_base: string }[] = [
  { name: 'codebuddy', user_base: '~/.codebuddy' },
  { name: 'workbuddy', user_base: '~/.workbuddy' },
  { name: 'claude-internal', user_base: '~/.claude-internal' },
];

/* ============================================================
 * target add 命令（FEAT-003 新增）
 * ============================================================ */

/**
 * `aitools target add <name>` 命令入口
 *
 * 从预定义列表中查找工具并追加到 config.targets。
 * 默认 enabled: true。幂等：已存在则跳过。
 *
 * @param name 工具名（如 'codebuddy'、'workbuddy'、'claude-internal'）
 */
export async function targetAddCommand(name: string): Promise<void> {
  /* 校验 name 是否在预定义列表中 */
  const toolDef = AVAILABLE_TOOLS.find((t) => t.name === name);
  if (!toolDef) {
    const available = AVAILABLE_TOOLS.map((t) => t.name).join(', ');
    reporter.error(`未知的工具: ${name}`);
    reporter.info(`   可用工具: ${available}`);
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  /* 读配置 */
  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  /* 幂等：已存在则跳过 */
  const existing = config.targets.find((t) => t.name === name);
  if (existing) {
    reporter.info(`target "${name}" 已存在（无变更）`);
    if (isJsonMode()) {
      emitJson({ event: 'target.added', data: { name, user_base: existing.user_base, changed: false } });
      emitJson({ event: 'done', data: { exitCode: 0 } });
    }
    return;
  }

  /* 追加新 target */
  config.targets.push({
    name: toolDef.name,
    enabled: true,
    user_base: toolDef.user_base,
  });
  await saveConfig(config);

  reporter.success(`target "${name}" 已添加（已启用）`);
  if (isJsonMode()) {
    emitJson({ event: 'target.added', data: { name, user_base: toolDef.user_base, changed: true } });
    emitJson({ event: 'done', data: { exitCode: 0 } });
  }
}

/* ============================================================
 * target remove 命令（FEAT-003 新增）
 * ============================================================ */

/**
 * `aitools target remove <name>` 命令入口
 *
 * 从 config.targets 中删除匹配的 target。不清理已同步文件。
 *
 * @param name 工具名
 */
export async function targetRemoveCommand(name: string): Promise<void> {
  /* 读配置 */
  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  /* 查找 target */
  const index = config.targets.findIndex((t) => t.name === name);
  if (index === -1) {
    const available = config.targets.map((t) => t.name).join(', ');
    reporter.error(`未找到 target: ${name}`);
    reporter.info(`   当前 targets: ${available}`);
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  /* 移除 */
  config.targets.splice(index, 1);
  await saveConfig(config);

  reporter.success(`target "${name}" 已移除`);
  if (isJsonMode()) {
    emitJson({ event: 'target.removed', data: { name } });
    emitJson({ event: 'done', data: { exitCode: 0 } });
  }
}
