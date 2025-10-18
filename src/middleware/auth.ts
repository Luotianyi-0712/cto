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
  // 如果是管理后台登录页面，允许访问
  if (ctx.request.url.pathname === "/admin/login") {
    await next();
    return;
  }

  // 检查 Authorization header
  if (!verifyAdminAuth(ctx)) {
    ctx.response.status = 401;
    ctx.response.body = { 
      error: "Unauthorized",
      message: "请提供有效的 Authorization: Bearer <ADMIN_KEY>" 
    };
    return;
  }

  await next();
}

