/**
 * Cookie 管理服务
 */

import type { CookieData, SystemStats } from "../types.ts";

// 使用 Deno KV 持久化存储
const kv = await Deno.openKv();

// 统计数据的 KV 键
const STATS_KEY = ["stats", "requests"];

/**
 * 获取统计数据（从 KV）
 */
async function getStats(): Promise<{ total: number; success: number }> {
  const result = await kv.get<{ total: number; success: number }>(STATS_KEY);
  return result.value || { total: 0, success: 0 };
}

/**
 * 更新统计数据（到 KV）
 */
async function updateStats(total: number, success: number): Promise<void> {
  await kv.set(STATS_KEY, { total, success });
}

/**
 * 获取所有 Cookie
 */
export async function getAllCookies(): Promise<CookieData[]> {
  const cookies: CookieData[] = [];
  const entries = kv.list<CookieData>({ prefix: ["cookies"] });
  for await (const entry of entries) {
    cookies.push(entry.value);
  }
  return cookies;
}

/**
 * 获取单个 Cookie
 */
export async function getCookie(id: string): Promise<CookieData | null> {
  const result = await kv.get<CookieData>(["cookies", id]);
  return result.value;
}

/**
 * 添加 Cookie
 */
export async function addCookie(name: string, cookie: string): Promise<CookieData> {
  const id = crypto.randomUUID();
  const cookieData: CookieData = {
    id,
    name,
    cookie,
    status: "active",
    createdAt: new Date().toISOString(),
    requestCount: 0,
  };
  await kv.set(["cookies", id], cookieData);
  return cookieData;
}

/**
 * 更新 Cookie
 */
export async function updateCookie(
  id: string,
  updates: Partial<CookieData>,
): Promise<CookieData | null> {
  const cookie = await getCookie(id);
  if (!cookie) return null;

  const updated = { ...cookie, ...updates };
  await kv.set(["cookies", id], updated);
  return updated;
}

/**
 * 删除 Cookie
 */
export async function deleteCookie(id: string): Promise<boolean> {
  await kv.delete(["cookies", id]);
  return true;
}

/**
 * 测试 Cookie 是否有效
 */
export async function testCookie(cookie: string): Promise<{
  valid: boolean;
  error?: string;
  sessionId?: string;
}> {
  try {
    const resp = await fetch("https://clerk.cto.new/v1/client", {
      headers: {
        Cookie: cookie,
        Origin: "https://cto.new",
      },
    });
    
    if (!resp.ok) {
      return { 
        valid: false, 
        error: `HTTP ${resp.status}: ${resp.statusText}` 
      };
    }

    const data = await resp.json();
    const sessions = data?.response?.sessions || [];
    
    if (sessions.length === 0) {
      return { 
        valid: false, 
        error: "Cookie 中没有有效的 session（可能已过期）" 
      };
    }

    return { 
      valid: true, 
      sessionId: sessions[0].id 
    };
  } catch (e) {
    return { 
      valid: false, 
      error: `网络错误: ${e}` 
    };
  }
}

/**
 * 获取可用的 Cookie（轮询）
 */
export async function getAvailableCookie(): Promise<CookieData | null> {
  const allCookies = await getAllCookies();
  const activeCookies = allCookies.filter((c) => c.status === "active");
  if (activeCookies.length === 0) return null;

  // 简单轮询：返回使用次数最少的
  activeCookies.sort((a, b) => a.requestCount - b.requestCount);
  return activeCookies[0];
}

/**
 * 记录 Cookie 使用
 */
export async function recordCookieUsage(id: string): Promise<void> {
  const cookie = await getCookie(id);
  if (cookie) {
    cookie.requestCount++;
    cookie.lastUsed = new Date().toISOString();
    await kv.set(["cookies", id], cookie);
  }
}

/**
 * 记录请求统计（持久化到 KV）
 */
export async function recordRequest(success: boolean): Promise<void> {
  const stats = await getStats();
  stats.total++;
  if (success) stats.success++;
  await updateStats(stats.total, stats.success);
}

/**
 * 获取系统统计（从 KV 读取）
 */
export async function getSystemStats(): Promise<SystemStats> {
  const allCookies = await getAllCookies();
  const activeCookies = allCookies.filter((c) => c.status === "active").length;
  const stats = await getStats();

  return {
    totalRequests: stats.total,
    successRequests: stats.success,
    cpuUsage: "0%", // Deno Deploy 不提供 CPU 信息
    memoryUsage: "0%", // Deno Deploy 不提供内存信息
    activeCookies,
  };
}

