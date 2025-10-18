/**
 * 鉴权中间件
 */

import type { Context } from "oak";
import { ADMIN_KEY } from "../config.ts";

/**
 * 验证 Bearer Token
 */
export function verifyAdminAuth(ctx: Context): boolean {
  const authHeader = ctx.request.headers.get("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  
  const token = authHeader.slice(7);
  return token === ADMIN_KEY;
}

/**
 * 管理后台鉴权中间件
 */
export async function adminAuthMiddleware(
  ctx: Context,
  next: () => Promise<unknown>,
) {
  // 检查 Authorization header
  if (!verifyAdminAuth(ctx)) {
    const pathname = ctx.request.url.pathname;
    
    // 如果是 API 请求，返回 401 JSON
    if (pathname.startsWith("/admin/api/")) {
      ctx.response.status = 401;
      ctx.response.body = { 
        error: "Unauthorized",
        message: "请提供有效的 Authorization: Bearer <ADMIN_KEY>" 
      };
      return;
    }
    
    // 如果是页面请求（如 /admin），重定向到登录页
    ctx.response.redirect("/admin/login");
    return;
  }

  await next();
}

