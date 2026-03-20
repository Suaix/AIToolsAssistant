## 1. 工具函数

- [x] 1.1 在 `src/commands/list.ts` 中新增 `getStringWidth()` 函数，计算字符串的实际终端宽度（CJK 字符按 2 宽度、其他按 1 宽度）
- [x] 1.2 在 `src/commands/list.ts` 中新增 `formatTable()` 函数，接收表头和数据行数组，使用 Unicode Box Drawing 字符输出对齐的表格

## 2. 数据采集重构

- [x] 2.1 重构 `listCommand()` 中的数据采集逻辑，为每个 Skill 收集源 hash（完整值）和各目标的独立同步状态（含目标名称和状态码）
- [x] 2.2 新增 hash 短值截取逻辑（前 8 位），用于表格展示

## 3. 表格输出重写

- [x] 3.1 重写 `listCommand()` 的输出部分，将采集的数据组装为表头（Skill 名称 | 源 hash | 各目标列）和数据行，调用 `formatTable()` 输出
- [x] 3.2 更新底部操作提示逻辑，基于各目标独立状态判断是否存在未同步的 Skill

## 4. 验证

- [x] 4.1 编译构建通过，lint 零错误
