/**
 * TypeScript 类型定义
 */

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
}

export interface SSEChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { content?: string };
    finish_reason: string | null;
    logprobs: null;
  }>;
}

export interface CompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
    logprobs: null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface CookieData {
  id: string;
  name: string;
  cookie: string;
  status: "active" | "inactive";
  createdAt: string;
  lastUsed?: string;
  requestCount: number;
}

export interface SystemStats {
  totalRequests: number;
  successRequests: number;
  cpuUsage: string;
  memoryUsage: string;
  activeCookies: number;
  totalConversations?: number;  // 总会话数
  activeConversations?: number; // 活跃会话数
}

