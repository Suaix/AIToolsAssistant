/**
 * 桌面应用路由定义
 *
 * 设计决策（遵循 L2 原则 4 克制）：
 * - MVP-01 阶段只有 5 个页面，不引入 react-router
 * - 用简单的联合类型 + useState 手动切换
 * - 未来页面数超过 7 个时再升级到 react-router
 *
 * 页面清单锚定 L3 信息架构的"首版页面清单"
 */

/** 可用页面路由 */
export type RouteName =
  | 'dashboard' //  P1 工作台（默认首页）
  | 'skills' //     P2 Skills 列表
  | 'skill-detail' // P3 Skill 详情
  | 'tools' //      P4 已连接工具
  | 'settings'; //  P5 设置

/** 路由的显示标题（用于 app header） */
export const ROUTE_TITLES: Record<RouteName, string> = {
  dashboard: '工作台',
  skills: 'Skills',
  'skill-detail': 'Skill 详情',
  tools: '已连接工具',
  settings: '设置',
};
