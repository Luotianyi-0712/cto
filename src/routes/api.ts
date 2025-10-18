/**
 * API 路由
 */

import { Router } from "oak";
import { decode as jwtDecode } from "djwt";
import { getJwtFromCookie, extractUserIdFromJwt } from "../services/auth.ts";
import {
  streamChatGenerator,
  nonStreamChat,
  createCompletionResponse,
} from "../services/chat.ts";
import { recordRequest, getAvailableCookie, recordCookieUsage } from "../services/cookie.ts";

export const apiRouter = new Router();

/**
 * 聊天接口
 */
apiRouter.post("/v1/chat/completions", async (ctx) => {
  // 检查 Authorization header（可选）
  const authorization = ctx.request.headers.get("authorization");
  let clerkCookie: string | null = null;
  let usedCookieId: string | null = null;
  
  // 如果提供了 Authorization，优先使用
  if (authorization && authorization.startsWith("Bearer ")) {
    clerkCookie = authorization.slice(7).replace(/\.\.\.\.\./g, "; ");
  } else {
    // 否则从 Cookie 池中获取可用的 Cookie
    const availableCookie = await getAvailableCookie();
    if (!availableCookie) {
      ctx.response.status = 503;
      ctx.response.body = { 
        error: "服务暂时不可用", 
        message: "没有可用的 Cookie，请在管理后台添加有效的 Cookie" 
      };
      return;
    }
    clerkCookie = availableCookie.cookie;
    usedCookieId = availableCookie.id;
    console.log(`使用 Cookie 池中的 Cookie: ${availableCookie.name} (ID: ${availableCookie.id})`);
  }

  // 解析请求
  let requestData;
  try {
    requestData = await ctx.request.body({ type: "json" }).value;
  } catch (e) {
    ctx.response.status = 400;
    ctx.response.body = { error: `无效的 JSON: ${e}` };
    return;
  }

  const model = requestData.model || "ClaudeSonnet4_5";
  const messages = requestData.messages || [];
  const stream = requestData.stream || false;

  if (!messages || messages.length === 0) {
    ctx.response.status = 400;
    ctx.response.body = { error: "messages 不能为空" };
    return;
  }

  // 将多轮对话转换为单轮对话
  const conversationParts: string[] = [];
  for (const msg of messages) {
    const role = msg.role || "unknown";
    const content = msg.content || "";
    if (content) {
      conversationParts.push(`${role}:\n${content}\n\n`);
    }
  }

  const fullPrompt = conversationParts.join("\n\n");
  console.log(`转换后的单轮 prompt 长度: ${fullPrompt.length}`);

  if (!fullPrompt.trim()) {
    ctx.response.status = 400;
    ctx.response.body = { error: "整合后的消息内容为空" };
    return;
  }

  // 获取 JWT token
  let jwtToken: string;
  try {
    jwtToken = await getJwtFromCookie(clerkCookie);
  } catch (e) {
    recordRequest(false);
    ctx.response.status = 401;
    ctx.response.body = { error: `${e}` };
    return;
  }

  // 解析 JWT 获取 user_id
  let userId: string;
  try {
    userId = extractUserIdFromJwt(jwtToken);
  } catch (e) {
    recordRequest(false);
    ctx.response.status = 401;
    ctx.response.body = { error: `无效的 JWT: ${e}` };
    return;
  }

  // 生成新的聊天历史 ID
  const chatHistoryId = crypto.randomUUID();
  console.log(`生成新的聊天历史 ID: ${chatHistoryId}`);

  const requestId = `chatcmpl-${crypto.randomUUID()}`;

  if (stream) {
    // 流式响应
    ctx.response.headers.set(
      "Content-Type",
      "text/event-stream; charset=utf-8",
    );
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");
    ctx.response.headers.set("X-Accel-Buffering", "no");

    const body = streamChatGenerator(
      requestId,
      model,
      chatHistoryId,
      userId,
      jwtToken,
      fullPrompt,
    );

    ctx.response.body = body;
    recordRequest(true);
    // 记录 Cookie 使用
    if (usedCookieId) {
      await recordCookieUsage(usedCookieId);
    }
  } else {
    // 非流式响应
    try {
      const fullContent = await nonStreamChat(
        requestId,
        model,
        chatHistoryId,
        userId,
        jwtToken,
        fullPrompt,
      );
      ctx.response.body = createCompletionResponse(
        requestId,
        model,
        fullContent,
      );
      recordRequest(true);
      // 记录 Cookie 使用
      if (usedCookieId) {
        await recordCookieUsage(usedCookieId);
      }
    } catch (e) {
      recordRequest(false);
      ctx.response.status = 500;
      ctx.response.body = { error: `处理请求失败: ${e}` };
    }
  }
});

/**
 * 列出模型
 */
apiRouter.get("/v1/models", (ctx) => {
  const models = [
    {
      id: "ClaudeSonnet4_5",
      object: "model",
      created: 1234567890,
      owned_by: "enginelabs",
    },
    {
      id: "GPT5",
      object: "model",
      created: 1234567890,
      owned_by: "enginelabs",
    },
  ];
  ctx.response.body = { object: "list", data: models };
});

/**
 * 健康检查
 */
apiRouter.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    service: "CTO-2api-v1",
    version: "1.1.0",
  };
});

