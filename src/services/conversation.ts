/**
 * 会话管理服务 - 实现上下文保持
 * 参考 1.js 的会话保持机制，使用 Deno KV 持久化
 */

import type { ChatMessage } from "../types.ts";

export interface ConversationState {
  chatHistoryId: string;  // cto.new 的对话 ID
  model: string;          // 使用的模型
  lastUpdated: number;    // 最后更新时间戳
}

// 使用 Deno KV 持久化存储
const kv = await Deno.openKv();

// 会话有效期：1 小时
const CONVERSATION_TTL_MS = 1000 * 60 * 60;

/**
 * 标准化消息（只保留 role 和 content）
 */
function normalizeMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages
    .filter((msg) => typeof msg?.role === "string" && typeof msg?.content === "string")
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
}

/**
 * 生成历史键（基于消息历史的 JSON 序列化）
 */
function createHistoryKey(messages: Array<{ role: string; content: string }>): string {
  return JSON.stringify(messages);
}

/**
 * 获取 KV 存储键
 */
function getKvKey(historyKey: string): string[] {
  // 使用 SHA-256 哈希避免键过长
  const hash = Array.from(
    new Uint8Array(
      // 简单哈希：使用字符串的字符码累加
      historyKey.split("").reduce((acc, char) => {
        acc.push(char.charCodeAt(0) % 256);
        return acc;
      }, [] as number[])
    )
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 32); // 取前 32 位

  return ["conversations", hash];
}

/**
 * 查找已有会话
 * @param messages 完整的消息历史
 * @param model 当前使用的模型
 * @returns 如果找到匹配的会话，返回 chatHistoryId，否则返回 null
 */
export async function findExistingConversation(
  messages: ChatMessage[],
  model: string,
): Promise<string | null> {
  // 清理过期会话
  await cleanupExpiredConversations();

  const normalized = normalizeMessages(messages);
  
  // 找到最后一个用户消息的位置
  const lastUserIndex = normalized
    .map((msg, idx) => (msg.role === "user" ? idx : -1))
    .filter((idx) => idx >= 0)
    .pop();

  if (lastUserIndex === undefined || lastUserIndex === -1) {
    return null;
  }

  // 提取当前用户消息之前的历史
  const historyBeforeUser = normalized.slice(0, lastUserIndex);
  const historyKey = createHistoryKey(historyBeforeUser);
  const kvKey = getKvKey(historyKey);

  // 从 KV 中查找
  const result = await kv.get<ConversationState>(kvKey);
  
  if (!result.value) {
    return null;
  }

  const state = result.value;
  const now = Date.now();

  // 检查是否过期
  if (now - state.lastUpdated > CONVERSATION_TTL_MS) {
    await kv.delete(kvKey);
    return null;
  }

  // 检查模型是否匹配
  if (state.model !== model) {
    return null;
  }

  return state.chatHistoryId;
}

/**
 * 注册新的会话状态
 * @param messages 完整的消息历史（包括最新的 assistant 回复）
 * @param model 使用的模型
 * @param chatHistoryId cto.new 的对话 ID
 */
export async function registerConversation(
  messages: ChatMessage[],
  model: string,
  chatHistoryId: string,
): Promise<void> {
  const normalized = normalizeMessages(messages);
  const historyKey = createHistoryKey(normalized);
  const kvKey = getKvKey(historyKey);

  const state: ConversationState = {
    chatHistoryId,
    model,
    lastUpdated: Date.now(),
  };

  // 保存到 KV，设置过期时间（秒）
  await kv.set(kvKey, state, {
    expireIn: CONVERSATION_TTL_MS,
  });
}

/**
 * 清理过期的会话
 */
export async function cleanupExpiredConversations(): Promise<void> {
  const now = Date.now();
  const entries = kv.list<ConversationState>({ prefix: ["conversations"] });

  for await (const entry of entries) {
    if (now - entry.value.lastUpdated > CONVERSATION_TTL_MS) {
      await kv.delete(entry.key);
    }
  }
}

/**
 * 获取会话统计信息
 */
export async function getConversationStats(): Promise<{
  total: number;
  active: number;
}> {
  let total = 0;
  let active = 0;
  const now = Date.now();

  const entries = kv.list<ConversationState>({ prefix: ["conversations"] });

  for await (const entry of entries) {
    total++;
    if (now - entry.value.lastUpdated <= CONVERSATION_TTL_MS) {
      active++;
    }
  }

  return { total, active };
}

/**
 * 删除单个会话（同时清理 cto.new 的记录）
 */
export async function deleteConversation(
  chatHistoryId: string,
  jwtToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. 从 cto.new 删除对话历史
    const deleteUrl = `https://api.enginelabs.ai/engine-agent/chat-histories/${chatHistoryId}`;
    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        Origin: "https://cto.new",
        Referer: `https://cto.new/${chatHistoryId}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      // 404 表示已经不存在，也算成功
      return {
        success: false,
        error: `cto.new API 返回错误: ${response.status}`,
      };
    }

    // 2. 从 KV 中删除会话记录
    const entries = kv.list<ConversationState>({ prefix: ["conversations"] });
    for await (const entry of entries) {
      if (entry.value.chatHistoryId === chatHistoryId) {
        await kv.delete(entry.key);
      }
    }

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: `删除失败: ${e}`,
    };
  }
}

/**
 * 清空所有会话（用于测试或重置）
 */
export async function clearAllConversations(): Promise<void> {
  const entries = kv.list({ prefix: ["conversations"] });
  
  for await (const entry of entries) {
    await kv.delete(entry.key);
  }
}

/**
 * 获取所有会话列表
 */
export async function getAllConversations(): Promise<Array<{
  chatHistoryId: string;
  model: string;
  lastUpdated: string;
}>> {
  const conversations: Array<{
    chatHistoryId: string;
    model: string;
    lastUpdated: string;
  }> = [];

  const entries = kv.list<ConversationState>({ prefix: ["conversations"] });

  for await (const entry of entries) {
    conversations.push({
      chatHistoryId: entry.value.chatHistoryId,
      model: entry.value.model,
      lastUpdated: new Date(entry.value.lastUpdated).toISOString(),
    });
  }

  // 按时间倒序排序
  conversations.sort((a, b) => 
    new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );

  return conversations;
}

