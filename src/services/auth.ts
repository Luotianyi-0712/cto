/**
 * 认证服务
 */

import { decode as jwtDecode } from "djwt";
import { CLERK_BASE, ORIGIN } from "../config.ts";
import { logger } from "./logger.ts";

/**
 * 从 cookie 中提取 session ID
 */
export async function extractSessionFromCookie(
  cookie: string,
): Promise<string | null> {
  // 尝试从 __client JWT 中解码
  const match = cookie.match(/__client=([^;]+)/);
  if (match) {
    try {
      const clientJwt = match[1];
      const [, payload] = jwtDecode(clientJwt);
      if (
        payload && typeof payload === "object" && "rotating_token" in payload
      ) {
        logger.info("🔑 从 __client 中提取到 rotating_token");
      }
    } catch (e) {
      logger.warn(`⚠️ 解析 __client JWT 失败: ${e}`);
    }
  }

  // 尝试获取 sessions
  try {
    const resp = await fetch(`${CLERK_BASE}/v1/client`, {
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
      },
    });

    if (resp.ok) {
      const data = await resp.json();
      const sessions = data?.response?.sessions || [];
      if (sessions.length > 0) {
        const sessionId = sessions[0].id;
        logger.info(`✅ 获取到 session_id: ${sessionId}`);
        return sessionId;
      }
    }
  } catch (e) {
    logger.error(`❌ 获取 session 失败: ${e}`);
  }

  return null;
}

/**
 * 使用 cookie 获取新的 JWT token
 */
export async function getJwtFromCookie(cookie: string): Promise<string> {
  const sessionId = await extractSessionFromCookie(cookie);
  if (!sessionId) {
    throw new Error("无法从 Cookie 中提取 session_id");
  }

  const tokenUrl =
    `${CLERK_BASE}/v1/client/sessions/${sessionId}/tokens?__clerk_api_version=2025-04-10`;

  try {
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
        Referer: `${ORIGIN}/`,
      },
      body: "",
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const jwtToken = data.jwt;
    if (!jwtToken) {
      throw new Error("响应中缺少 jwt 字段");
    }
    logger.info("🎫 成功获取 JWT token");
    return jwtToken;
  } catch (e) {
    logger.error(`❌ 获取 JWT 失败: ${e}`);
    throw new Error(`无法获取 JWT token: ${e}`);
  }
}

/**
 * 从 JWT 中提取用户 ID
 */
export function extractUserIdFromJwt(jwtToken: string): string {
  const [, payload] = jwtDecode(jwtToken);
  if (!payload || typeof payload !== "object" || !("sub" in payload)) {
    throw new Error("JWT 中没有 sub 字段");
  }
  return payload.sub as string;
}

