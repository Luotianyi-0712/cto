/**
 * TypeScript 类型定义
 */

// 多模态内容项（OpenAI API 规范）
export interface ContentItem {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface ChatMessage {
  role: string;
  content: string | ContentItem[]; // 支持字符串或多模态数组
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

