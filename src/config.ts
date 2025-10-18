/**
 * 配置常量
 */

export const BASE_URL = "https://api.enginelabs.ai";
export const CLERK_BASE = "https://clerk.cto.new";
export const ORIGIN = "https://cto.new";
export const PORT = 8000;
export const VERSION = "1.1.0";

// 鉴权密钥（请在环境变量中设置 ADMIN_KEY，否则使用默认值）
export const ADMIN_KEY = Deno.env.get("ADMIN_KEY") || "your-secret-key-change-me";

