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
import { setReporterMode } from './utils/reporter.js';

/** 实例化命令行程序对象 */
const program = new Command();

/** 配置基础应用信息 */
program
  .name('aitools')
  .description('AI Agent 统一配置与资源同步管理工具（skills/commands/agents/rules）')
  .version('0.3.0');

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

/** 注册 sync 同步命令（支持位置参数 [type] 与 --type 简写） */
program
  .command('sync')
  .description(
    '将源目录资源同步到各 AI 工具（用户级/项目级）。type 可选值: skills | commands | agents | rules | all（默认）',
  )
  .argument('[type]', '资源类型: skills/commands/agents/rules/all（默认 all）')
  .option(
    '--type <type>',
    '资源类型简写（与位置参数等价）: skills/commands/agents/rules/all',
  )
  .option('-t, --target <name>', '指定单个同步目标工具（如 codebuddy、claude-code）')
  .option('-s, --skill <name>', '指定资源名称，添加到当前项目并同步（仅支持单一资源类型）')
  .option('--scope <scope>', '同步范围: user（仅用户级）| project（仅项目级）')
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

/** 执行命令行参数解析 */
program.parse();
