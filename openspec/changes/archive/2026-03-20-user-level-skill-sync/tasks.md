## 1. 基础模块搭建

- [x] 1.1 创建 `src/types/index.ts`，定义所有 TypeScript 类型（Config、Target、SkillInfo、SyncResult 等）
- [x] 1.2 创建 `src/config/manager.ts`，实现配置文件的读取、写入和校验（~/.aitools/config.yaml）

## 2. 核心引擎实现

- [x] 2.1 创建 `src/core/hasher.ts`，实现文件和目录的 SHA-256 hash 计算
- [x] 2.2 创建 `src/core/scanner.ts`，实现 Skill 目录扫描和 SKILL.md frontmatter 解析
- [x] 2.3 创建 `src/core/syncer.ts`，实现基于 hash 对比的文件夹全量拷贝同步引擎

## 3. 命令实现

- [x] 3.1 重写 `src/commands/init.ts`，实现交互式全局初始化（指定源目录、选择目标工具、生成配置文件）
- [x] 3.2 创建 `src/commands/sync.ts`，实现用户级 Skills 同步命令（支持 --target 参数）
- [x] 3.3 创建 `src/commands/list.ts`，实现 Skills 列表展示命令（含同步状态标记）

## 4. CLI 入口集成

- [x] 4.1 更新 `src/index.ts`，注册 sync 和 list 命令，完成 CLI 入口集成
