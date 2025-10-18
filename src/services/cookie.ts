/**
 * Cookie 管理服务
 */

import type { CookieData, SystemStats } from "../types.ts";

// 内存存储（生产环境可替换为数据库）
const cookies: Map<string, CookieData> = new Map();
let totalRequests = 0;
let successRequests = 0;

/**
 * 获取所有 Cookie
 */
export function getAllCookies(): CookieData[] {
  return Array.from(cookies.values());
}

/**
 * 获取单个 Cookie
 */
export function getCookie(id: string): CookieData | undefined {
  return cookies.get(id);
}

/**
 * 添加 Cookie
 */
export function addCookie(name: string, cookie: string): CookieData {
  const id = crypto.randomUUID();
  const cookieData: CookieData = {
    id,
    name,
    cookie,
    status: "active",
    createdAt: new Date().toISOString(),
    requestCount: 0,
  };
  cookies.set(id, cookieData);
  return cookieData;
}

/**
 * 更新 Cookie
 */
export function updateCookie(
  id: string,
  updates: Partial<CookieData>,
): CookieData | null {
  const cookie = cookies.get(id);
  if (!cookie) return null;

  const updated = { ...cookie, ...updates };
  cookies.set(id, updated);
  return updated;
}

/**
 * 删除 Cookie
 */
export function deleteCookie(id: string): boolean {
  return cookies.delete(id);
}

/**
 * 测试 Cookie 是否有效
 */
export async function testCookie(cookie: string): Promise<boolean> {
  try {
    const resp = await fetch("https://clerk.cto.new/v1/client", {
      headers: {
        Cookie: cookie,
        Origin: "https://cto.new",
      },
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * 获取可用的 Cookie（轮询）
 */
export function getAvailableCookie(): CookieData | null {
  const activeCookies = Array.from(cookies.values()).filter(
    (c) => c.status === "active",
  );
  if (activeCookies.length === 0) return null;

  // 简单轮询：返回使用次数最少的
  activeCookies.sort((a, b) => a.requestCount - b.requestCount);
  return activeCookies[0];
}

/**
 * 记录 Cookie 使用
 */
export function recordCookieUsage(id: string): void {
  const cookie = cookies.get(id);
  if (cookie) {
    cookie.requestCount++;
    cookie.lastUsed = new Date().toISOString();
    cookies.set(id, cookie);
  }
}

/**
 * 记录请求统计
 */
export function recordRequest(success: boolean): void {
  totalRequests++;
  if (success) successRequests++;
}

/**
 * 获取系统统计
 */
export function getSystemStats(): SystemStats {
  const activeCookies = Array.from(cookies.values()).filter(
    (c) => c.status === "active",
  ).length;

  return {
    totalRequests,
    successRequests,
    cpuUsage: "0%", // Deno Deploy 不提供 CPU 信息
    memoryUsage: "0%", // Deno Deploy 不提供内存信息
    activeCookies,
  };
}

