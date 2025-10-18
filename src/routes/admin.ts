/**
 * 管理后台路由
 */

import { Router } from "oak";
import {
  getAllCookies,
  getCookie,
  addCookie,
  updateCookie,
  deleteCookie,
  testCookie,
  getSystemStats,
} from "../services/cookie.ts";
import { adminAuthMiddleware } from "../middleware/auth.ts";
import { getRecentLogs, subscribeToLogs, logger, type LogEntry } from "../services/logger.ts";
import { getConversationStats, getAllConversations, deleteConversation } from "../services/conversation.ts";
import { getJwtFromCookie } from "../services/auth.ts";

export const adminRouter = new Router();

/**
 * Favicon 处理（代理 cto.new 的图标）
 */
adminRouter.get("/favicon.ico", async (ctx) => {
  try {
    const response = await fetch("https://cto.new/favicon.ico");
    if (response.ok) {
      const iconData = await response.arrayBuffer();
      ctx.response.headers.set("Content-Type", "image/x-icon");
      ctx.response.headers.set("Cache-Control", "public, max-age=86400"); // 缓存1天
      ctx.response.body = iconData;
    } else {
      ctx.response.status = 404;
    }
  } catch (e) {
    console.error("获取 favicon 失败:", e);
    ctx.response.status = 500;
  }
});

/**
 * 管理后台登录页面（无需鉴权）
 */
adminRouter.get("/admin/login", async (ctx) => {
  try {
    const html = await Deno.readTextFile("./src/views/login.html");
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = html;
  } catch (e) {
    ctx.response.status = 500;
    ctx.response.body = { error: `无法加载登录页面: ${e}` };
  }
});

/**
 * 管理后台首页（页面本身无需鉴权，由前端 JS 控制，API 需要鉴权）
 */
adminRouter.get("/admin", async (ctx) => {
  try {
    const html = await Deno.readTextFile("./src/views/admin.html");
    ctx.response.headers.set("Content-Type", "text/html; charset=utf-8");
    ctx.response.body = html;
  } catch (e) {
    ctx.response.status = 500;
    ctx.response.body = { error: `无法加载管理后台: ${e}` };
  }
});

/**
 * 实时日志推送（Server-Sent Events）
 * 注意：由于 EventSource 不支持自定义 header，使用 URL 参数传递密钥
 * 必须在鉴权中间件之前定义，因为需要自定义鉴权逻辑
 */
adminRouter.get("/admin/api/logs/stream", (ctx) => {
  // 从 URL 参数获取密钥进行验证
  const token = ctx.request.url.searchParams.get("token");
  const ADMIN_KEY = Deno.env.get("ADMIN_KEY") || "your-secret-key-change-me";
  
  if (token !== ADMIN_KEY) {
    ctx.response.status = 401;
    ctx.response.body = { 
      error: "Unauthorized",
      message: "无效的 token 参数" 
    };
    return;
  }

  const target = ctx.sendEvents();
  
  let isConnected = true;
  
  // 发送最近的日志（不记录 SSE 自身的连接日志，避免污染）
  const recentLogs = getRecentLogs();
  
  try {
    recentLogs.forEach((log) => {
      if (isConnected) {
        target.dispatchMessage(log);
      }
    });
  } catch (e) {
    // 不记录日志，避免污染
    isConnected = false;
  }

  // 订阅新日志
  const unsubscribe = subscribeToLogs((log: LogEntry) => {
    if (!isConnected) {
      return; // 已断开，不再推送
    }
    
    try {
      target.dispatchMessage(log);
    } catch (e) {
      // 推送失败，标记为断开并取消订阅
      if (!isConnected) return; // 防止重复处理
      
      // 不记录日志，避免污染
      isConnected = false;
      unsubscribe();
    }
  });

  // 连接关闭时取消订阅
  target.addEventListener("close", () => {
    if (!isConnected) return; // 已经处理过
    
    // 不记录日志，避免污染
    isConnected = false;
    unsubscribe();
  });
});

// 应用鉴权中间件到所有 API 路由（除了 logs/stream）
adminRouter.use("/admin/api", adminAuthMiddleware);

/**
 * 获取系统统计
 */
adminRouter.get("/admin/api/stats", async (ctx) => {
  const stats = await getSystemStats();
  const conversationStats = await getConversationStats();
  
  ctx.response.body = {
    ...stats,
    totalConversations: conversationStats.total,
    activeConversations: conversationStats.active,
  };
});

/**
 * 获取所有 Cookie
 */
adminRouter.get("/admin/api/cookies", async (ctx) => {
  ctx.response.body = await getAllCookies();
});

/**
 * 获取单个 Cookie
 */
adminRouter.get("/admin/api/cookies/:id", async (ctx) => {
  const id = ctx.params.id;
  const cookie = await getCookie(id);
  
  if (!cookie) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Cookie 不存在" };
    return;
  }
  
  ctx.response.body = cookie;
});

/**
 * 添加 Cookie
 */
adminRouter.post("/admin/api/cookies", async (ctx) => {
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { name, cookie } = body;
    
    if (!name || !cookie) {
      ctx.response.status = 400;
      ctx.response.body = { error: "name 和 cookie 字段必填" };
      return;
    }
    
    const newCookie = await addCookie(name, cookie);
    logger.info(`✅ 添加 Cookie: ${name}`);
    ctx.response.body = newCookie;
  } catch (e) {
    logger.error(`❌ 添加 Cookie 失败: ${e}`);
    ctx.response.status = 400;
    ctx.response.body = { error: `添加失败: ${e}` };
  }
});

/**
 * 更新 Cookie
 */
adminRouter.put("/admin/api/cookies/:id", async (ctx) => {
  try {
    const id = ctx.params.id;
    const body = await ctx.request.body({ type: "json" }).value;
    
    const updated = await updateCookie(id, body);
    
    if (!updated) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Cookie 不存在" };
      return;
    }
    
    logger.info(`✏️ 更新 Cookie: ${updated.name} (ID: ${id.slice(0, 8)}...)`);
    ctx.response.body = updated;
  } catch (e) {
    logger.error(`❌ 更新 Cookie 失败: ${e}`);
    ctx.response.status = 400;
    ctx.response.body = { error: `更新失败: ${e}` };
  }
});

/**
 * 删除 Cookie
 */
adminRouter.delete("/admin/api/cookies/:id", async (ctx) => {
  const id = ctx.params.id;
  const cookie = await getCookie(id);
  const success = await deleteCookie(id);
  
  if (!success) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Cookie 不存在" };
    return;
  }
  
  logger.info(`🗑️ 删除 Cookie: ${cookie?.name || id.slice(0, 8) + '...'}`);
  ctx.response.body = { success: true };
});

/**
 * 测试 Cookie
 */
adminRouter.post("/admin/api/cookies/:id/test", async (ctx) => {
  const id = ctx.params.id;
  const cookieData = await getCookie(id);
  
  if (!cookieData) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Cookie 不存在" };
    return;
  }
  
  logger.info(`🧪 测试 Cookie: ${cookieData.name}`);
  const testResult = await testCookie(cookieData.cookie);
  
  if (testResult.valid) {
    logger.info(`✅ Cookie 有效: ${cookieData.name} (Session: ${testResult.sessionId?.slice(0, 8)}...)`);
  } else {
    logger.warn(`❌ Cookie 无效: ${cookieData.name} - ${testResult.error}`);
  }
  
  ctx.response.body = testResult;
});

/**
 * 验证管理密钥（用于登录页）
 */
adminRouter.post("/admin/api/verify-key", (ctx) => {
  // 鉴权中间件会处理实际的密钥验证
  // 如果能到达这里，说明密钥是有效的
  ctx.response.body = { valid: true, message: "密钥有效" };
});

/**
 * 获取所有会话列表
 */
adminRouter.get("/admin/api/conversations", async (ctx) => {
  ctx.response.body = await getAllConversations();
});

/**
 * 删除指定会话
 */
adminRouter.delete("/admin/api/conversations/:id", async (ctx) => {
  const chatHistoryId = ctx.params.id;
  
  // 从 Cookie 池获取任意一个 Cookie 来获取 JWT
  const cookies = await getAllCookies();
  const activeCookie = cookies.find((c) => c.status === "active");
  
  if (!activeCookie) {
    ctx.response.status = 503;
    ctx.response.body = { 
      error: "无可用 Cookie",
      message: "需要至少一个有效的 Cookie 来清理 cto.new 的对话记录" 
    };
    return;
  }
  
  try {
    const jwtToken = await getJwtFromCookie(activeCookie.cookie);
    const result = await deleteConversation(chatHistoryId, jwtToken);
    
    if (result.success) {
      logger.info(`🗑️ 删除会话: ${chatHistoryId}`);
      ctx.response.body = { success: true, message: "会话已删除" };
    } else {
      logger.error(`删除会话失败: ${result.error}`);
      ctx.response.status = 500;
      ctx.response.body = { error: result.error };
    }
  } catch (e) {
    logger.error(`删除会话异常: ${e}`);
    ctx.response.status = 500;
    ctx.response.body = { error: `删除失败: ${e}` };
  }
});
