/**
 * CTO.new API 转换器 - 主入口
 * OpenAI 兼容的 Cto.new API 转换器，带管理后台
 */

import { Application } from "oak";
import { apiRouter } from "./src/routes/api.ts";
import { adminRouter } from "./src/routes/admin.ts";
import { PORT, VERSION } from "./src/config.ts";

// 创建应用
const app = new Application();

// 日志中间件
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
});

// 错误处理中间件
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("错误:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

// CORS 中间件（可选）
app.use(async (ctx, next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  ctx.response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }

  await next();
});

// 注册路由
app.use(adminRouter.routes());
app.use(adminRouter.allowedMethods());
app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());

// 启动服务器
console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🚀 CTO.new API 转换器 v${VERSION}                    ║
║                                                       ║
║   📡 服务地址: http://localhost:${PORT}                 ║
║   🎨 管理后台: http://localhost:${PORT}/admin           ║
║   📚 API 文档: http://localhost:${PORT}/                ║
║                                                       ║
║   ✨ 功能特性:                                         ║
║      • OpenAI 兼容的聊天接口                          ║
║      • 支持流式和非流式响应                            ║
║      • Cookie 管理后台                                ║
║      • 实时系统监控                                    ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);

await app.listen({ port: PORT });

