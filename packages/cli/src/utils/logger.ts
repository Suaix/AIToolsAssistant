import pc from 'picocolors';

/**
 * 终端日志输出工具
 * 封装带颜色的控制台打印，统一终端提示风格
 */
export const logger = {
  /**
   * 打印普通信息（蓝色）
   * @param msg 消息内容
   */
  info: (msg: string) => console.log(pc.blue('ℹ'), msg),
  
  /**
   * 打印成功信息（绿色）
   * @param msg 消息内容
   */
  success: (msg: string) => console.log(pc.green('✔'), msg),
  
  /**
   * 打印警告信息（黄色）
   * @param msg 消息内容
   */
  warn: (msg: string) => console.log(pc.yellow('⚠'), msg),
  
  /**
   * 打印错误信息（红色）
   * @param msg 消息内容
   */
  error: (msg: string) => console.log(pc.red('✖'), msg),
};
