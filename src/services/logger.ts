/**
 * 日志服务 - 实时日志推送
 */

export interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
}

// 日志订阅者列表
const logSubscribers: Set<(log: LogEntry) => void> = new Set();

// 保存最近 500 条日志（增加容量，避免重要日志被挤出）
const recentLogs: LogEntry[] = [];
const MAX_LOGS = 500;

/**
 * 添加日志
 */
export function log(level: LogEntry["level"], message: string): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    level,
    message,
  };

  // 保存到历史记录
  recentLogs.push(entry);
  if (recentLogs.length > MAX_LOGS) {
    recentLogs.shift();
  }

  // 推送给所有订阅者
  logSubscribers.forEach((callback) => {
    try {
      callback(entry);
    } catch (e) {
      console.error("日志推送失败:", e);
    }
  });

  // 同时输出到控制台
  const prefix = `[${entry.timestamp}] [${entry.level}]`;
  console.log(`${prefix} ${message}`);
}

/**
 * 便捷方法
 */
export const logger = {
  info: (message: string) => log("INFO", message),
  warn: (message: string) => log("WARN", message),
  error: (message: string) => log("ERROR", message),
};

/**
 * 订阅日志
 */
export function subscribeToLogs(callback: (log: LogEntry) => void): () => void {
  logSubscribers.add(callback);
  
  // 返回取消订阅函数
  return () => {
    logSubscribers.delete(callback);
  };
}

/**
 * 获取最近的日志
 */
export function getRecentLogs(): LogEntry[] {
  return [...recentLogs];
}

