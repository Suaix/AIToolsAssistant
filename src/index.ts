#!/usr/bin/env node

/**
 * aitools CLI 入口文件
 * v0.2.0：支持多资源类型（skills/commands/agents/rules）
 * v0.3.0：新增全局 --json flag（NDJSON 输出），为 GUI 等机器消费方提供稳定数据契约
 * 命令双模式：子命令参数（aitools sync skills）与 --type 简写
 */
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { syncCommand } from './commands/sync.js';
import { listCommand } from './commands/list.js';
import { subscribeCommand } from './commands/subscribe.js';
import { unsubscribeCommand } from './commands/unsubscribe.js';
import { setReporterMode } from './utils/reporter.js';

/** 实例化命令行程序对象 */
const program = new Command();

/** 配置基础应用信息 */
program
  .name('aitools')
  .description('AI Agent 统一配置与资源同步管理工具（skills/commands/agents/rules）')
  .version('0.4.0-alpha');

/**
 * 全局 --json flag
 * 作用：让所有子命令以 NDJSON 格式输出到 stdout（机器可读）
 * 使用：aitools --json list / aitools --json sync skills
 * 说明：init 命令不支持 --json（它本质上是交互式的，GUI 请直接写 ~/.aitools/config.yaml）
 */
program.option(
  '--json',
  '以 NDJSON（每行一个 JSON 对象）格式输出到 stdout，供 GUI 等机器消费方使用',
);

/**
 * 在所有子命令执行前，根据全局 --json 设置 reporter 模式
 * preAction 是 commander 的生命周期钩子，此时 opts() 已完成解析
 */
program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts.json) {
    setReporterMode('json');
  }
});

/** 注册 init 初始化命令（不支持 --json，保持交互式体验） */
program
  .command('init')
  .description(
    '交互式全局初始化：指定/创建源目录、生成资源骨架、选择同步目标',
  )
  .action(initCommand);

/**
 * 注册 sync 同步命令
 * v0.4.0：
 * - 新增第二个位置参数 [name]：`aitools sync skills brand-guidelines`
 * - 移除 --skill 参数（commander 会对未知参数直接报错）
 * - 语义变为"读订阅清单、遍历同步"，不再自动关联到项目
 */
program
  .command('sync')
  .description(
    '按订阅清单同步资源到各 AI 工具。type 可选值: skills | commands | agents | rules | all（默认）；name 可选，仅同步指定资源',
  )
  .argument('[type]', '资源类型: skills/commands/agents/rules/all（默认 all）；或直接给出资源 dirName 作自动消歧')
  .argument('[name]', '资源 dirName（当指定 type 为具体类型时生效，仅同步该资源的所有订阅）')
  .option(
    '--type <type>',
    '资源类型简写（与位置参数等价）: skills/commands/agents/rules/all',
  )
  .option('-t, --target <name>', '指定单个同步目标工具（如 codebuddy、claude-code）')
  .option('--scope <scope>', '订阅落点过滤: user（仅用户级订阅）| project（仅当前项目订阅）')
  .action(syncCommand);

/** 注册 list 列表命令（支持位置参数 [type] 与 --type 简写） */
program
  .command('list')
  .description(
    '列出所有资源及其同步状态。type 可选值: skills | commands | agents | rules | all（默认）',
  )
  .argument('[type]', '资源类型: skills/commands/agents/rules/all（默认 all）')
  .option(
    '--type <type>',
    '资源类型简写（与位置参数等价）: skills/commands/agents/rules/all',
  )
  .action(listCommand);

/**
 * 注册 subscribe 订阅命令（v0.4.0 新增）
 * 语义：把一个资源的同步落点声明到订阅清单
 */
program
  .command('subscribe')
  .description(
    '订阅一个资源到某个落点（用户级 / 当前项目）。scope 默认 user',
  )
  .argument('<type>', '资源类型: skills/commands/agents/rules')
  .argument('<name>', '资源 dirName（源目录中的文件夹名）')
  .option('--scope <scope>', '订阅落点: user（默认） | project', 'user')
  .option('--sync', '订阅后立即同步（仅同步刚订阅的这一条）')
  .action(subscribeCommand);

/**
 * 注册 unsubscribe 取消订阅命令（v0.4.0 新增）
 * 语义：从订阅清单移除一条落点；可选 --prune 清理目标侧文件
 */
program
  .command('unsubscribe')
  .description(
    '取消一个资源的订阅（用户级 / 当前项目）。scope 默认 user',
  )
  .argument('<type>', '资源类型: skills/commands/agents/rules')
  .argument('<name>', '资源 dirName（源目录中的文件夹名）')
  .option('--scope <scope>', '订阅落点: user（默认） | project', 'user')
  .option('--prune', '同时清理该落点下各 target 已同步的资源目录')
  .action(unsubscribeCommand);

/** 执行命令行参数解析 */
program.parse();
