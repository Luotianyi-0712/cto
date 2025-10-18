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
 * 此中间件仅用于 API 路由（/admin/api/*）
 */
export async function adminAuthMiddleware(
  ctx: Context,
  next: () => Promise<unknown>,
) {
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

