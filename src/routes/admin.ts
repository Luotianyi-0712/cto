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
import { getRecentLogs, subscribeToLogs, type LogEntry } from "../services/logger.ts";

export const adminRouter = new Router();

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

// 应用鉴权中间件到所有 API 路由
adminRouter.use("/admin/api", adminAuthMiddleware);

/**
 * 获取系统统计
 */
adminRouter.get("/admin/api/stats", async (ctx) => {
  ctx.response.body = await getSystemStats();
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
    ctx.response.body = newCookie;
  } catch (e) {
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
    
    ctx.response.body = updated;
  } catch (e) {
    ctx.response.status = 400;
    ctx.response.body = { error: `更新失败: ${e}` };
  }
});

/**
 * 删除 Cookie
 */
adminRouter.delete("/admin/api/cookies/:id", async (ctx) => {
  const id = ctx.params.id;
  const success = await deleteCookie(id);
  
  if (!success) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Cookie 不存在" };
    return;
  }
  
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
  
  const valid = await testCookie(cookieData.cookie);
  ctx.response.body = { valid };
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
 * 实时日志推送（Server-Sent Events）
 */
adminRouter.get("/admin/api/logs/stream", (ctx) => {
  const target = ctx.sendEvents();
  
  // 发送最近的日志
  const recentLogs = getRecentLogs();
  recentLogs.forEach((log) => {
    target.dispatchMessage(log);
  });

  // 订阅新日志
  const unsubscribe = subscribeToLogs((log: LogEntry) => {
    target.dispatchMessage(log);
  });

  // 连接关闭时取消订阅
  target.addEventListener("close", () => {
    unsubscribe();
  });
});
