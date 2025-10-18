/**
 * 聊天服务
 */

import { BASE_URL, ORIGIN } from "../config.ts";
import type { SSEChunk } from "../types.ts";

/**
 * 创建 SSE 格式的响应块
 */
export function createSSEChunk(
  requestId: string,
  model: string,
  content: string,
  finishReason: string | null = null,
): string {
  const chunk: SSEChunk = {
    id: requestId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finishReason,
        logprobs: null,
      },
    ],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * 创建非流式响应
 */
export function createCompletionResponse(
  requestId: string,
  model: string,
  content: string,
) {
  return {
    id: requestId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/**
 * WebSocket 消息迭代器
 */
async function* wsMessageIterator(
  ws: WebSocket,
): AsyncGenerator<
  { type: "message"; data: string } | { type: "close" } | {
    type: "error";
    error: Event;
  }
> {
  const queue: Array<{ type: string; data?: string; error?: Event }> = [];
  let resolver: (() => void) | null = null;

  ws.onmessage = (event) => {
    queue.push({ type: "message", data: event.data });
    resolver?.();
  };

  ws.onclose = () => {
    queue.push({ type: "close" });
    resolver?.();
  };

  ws.onerror = (error) => {
    queue.push({ type: "error", error });
    resolver?.();
  };

  while (true) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        resolver = resolve;
      });
    }

    const item = queue.shift();
    if (!item) continue;

    if (item.type === "close") {
      yield { type: "close" };
      break;
    }

    if (item.type === "error") {
      yield { type: "error", error: item.error! };
      break;
    }

    if (item.type === "message") {
      yield { type: "message", data: item.data! };
    }
  }
}

/**
 * 流式聊天生成器
 */
export async function* streamChatGenerator(
  requestId: string,
  model: string,
  chatHistoryId: string,
  userId: string,
  jwtToken: string,
  fullPrompt: string,
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const wsUrl =
    `wss://api.enginelabs.ai/engine-agent/chat-histories/${chatHistoryId}/buffer/stream?token=${userId}`;

  // 立即发送一个空增量
  yield encoder.encode(createSSEChunk(requestId, model, ""));

  let receivedUpdate = false;
  let lastBufferType: string | null = null;
  let inThinkingBlock = false;
  const modeByType: Record<string, "snapshot" | "delta"> = {};
  const prevContentByType: Record<string, string> = {};

  try {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    // 等待连接打开
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        console.log(`WebSocket 已连接: ${chatHistoryId}`);
        resolve();
      };
      ws.onerror = (e) => reject(e);
    });

    // 触发聊天
    const triggerChat = async () => {
      const payload = {
        prompt: fullPrompt,
        chatHistoryId,
        adapterName: model,
      };
      const headers = {
        Authorization: `Bearer ${jwtToken}`,
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Referer: `${ORIGIN}/${chatHistoryId}`,
      };

      try {
        const resp = await fetch(`${BASE_URL}/engine-agent/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const text = await resp.text();
          console.warn(`触发消息失败: ${resp.status} ${text.slice(0, 200)}`);
        }
      } catch (e) {
        console.error(`触发消息异常: ${e}`);
      }
    };

    // 启动触发任务
    triggerChat();

    // 处理 WebSocket 消息
    for await (const event of wsMessageIterator(ws)) {
      if (event.type === "close") break;
      if (event.type === "error") {
        console.error("WebSocket 错误:", event.error);
        break;
      }

      try {
        const data = JSON.parse(event.data);
        const msgType = data.type;

        if (msgType === "update") {
          receivedUpdate = true;
          const bufferStr = data.buffer || "{}";
          try {
            const bufferData = JSON.parse(bufferStr);
            const bufferType = bufferData.type;

            if (bufferType === "chat" || bufferType === "thinking") {
              const content = bufferData.chat?.content || "";
              if (content) {
                // 检测类型切换
                if (bufferType !== lastBufferType) {
                  // 如果之前在 thinking 块中，先关闭标签
                  if (inThinkingBlock) {
                    yield encoder.encode(
                      createSSEChunk(requestId, model, "</think>"),
                    );
                    inThinkingBlock = false;
                  }

                  // 如果切换到 thinking，打开标签
                  if (bufferType === "thinking") {
                    yield encoder.encode(
                      createSSEChunk(requestId, model, "<think>"),
                    );
                    inThinkingBlock = true;
                  }

                  lastBufferType = bufferType;
                }

                // 仅发送增量
                const prev = prevContentByType[bufferType] ?? "";
                let mode = modeByType[bufferType];
                let delta = "";
                if (!mode && prev) {
                  if (content.startsWith(prev)) {
                    mode = "snapshot";
                    modeByType[bufferType] = mode;
                  } else {
                    mode = "delta";
                    modeByType[bufferType] = mode;
                  }
                }
                if (mode === "snapshot") {
                  delta = content.slice(prev.length);
                  prevContentByType[bufferType] = content;
                } else if (mode === "delta") {
                  delta = content;
                  prevContentByType[bufferType] = prev + content;
                } else {
                  // 首次收到该类型：按增量输出并记录
                  delta = content;
                  prevContentByType[bufferType] = content;
                }
                if (delta) {
                  yield encoder.encode(createSSEChunk(requestId, model, delta));
                }
              }
            }
          } catch (e) {
            // JSON 解析失败，忽略
          }
        } else if (msgType === "state") {
          const state = data.state || {};
          if (!state.inProgress && receivedUpdate) {
            // 结束前，如果还在 thinking 块中，关闭标签
            if (inThinkingBlock) {
              yield encoder.encode(
                createSSEChunk(requestId, model, "</think>"),
              );
              inThinkingBlock = false;
            }
            break;
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    ws.close();

    // 发送结束标记
    yield encoder.encode(createSSEChunk(requestId, model, "", "stop"));
    yield encoder.encode("data: [DONE]\n\n");
  } catch (e) {
    console.error(`流式处理异常: ${e}`);
    yield encoder.encode(
      createSSEChunk(requestId, model, `错误: ${e}`, "stop"),
    );
    yield encoder.encode("data: [DONE]\n\n");
  }
}

/**
 * 非流式聊天
 */
export async function nonStreamChat(
  requestId: string,
  model: string,
  chatHistoryId: string,
  userId: string,
  jwtToken: string,
  fullPrompt: string,
): Promise<string> {
  const wsUrl =
    `wss://api.enginelabs.ai/engine-agent/chat-histories/${chatHistoryId}/buffer/stream?token=${userId}`;
  let fullContent = "";

  try {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    // 等待连接打开
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        console.log(`WebSocket 已连接 (非流式): ${chatHistoryId}`);
        resolve();
      };
      ws.onerror = (e) => reject(e);
    });

    // 发送 prompt
    const payload = {
      prompt: fullPrompt,
      chatHistoryId,
      adapterName: model,
    };
    const headers = {
      Authorization: `Bearer ${jwtToken}`,
      "Content-Type": "application/json",
      Origin: ORIGIN,
      Referer: `${ORIGIN}/${chatHistoryId}`,
    };

    const resp = await fetch(`${BASE_URL}/engine-agent/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    console.log(`POST /engine-agent/chat 状态: ${resp.status}`);

    // 接收所有消息
    let receivedUpdate = false;
    let lastBufferType: string | null = null;
    let inThinkingBlock = false;
    const modeByType: Record<string, "snapshot" | "delta"> = {};
    const prevContentByType: Record<string, string> = {};

    for await (const event of wsMessageIterator(ws)) {
      if (event.type === "close") break;
      if (event.type === "error") {
        console.error("WebSocket 错误:", event.error);
        break;
      }

      try {
        const data = JSON.parse(event.data);
        const msgType = data.type;

        if (msgType === "update") {
          receivedUpdate = true;
          const bufferStr = data.buffer || "{}";
          try {
            const bufferData = JSON.parse(bufferStr);
            const bufferType = bufferData.type;

            if (bufferType === "chat" || bufferType === "thinking") {
              const content = bufferData.chat?.content;
              if (content) {
                console.log(
                  `提取到内容 (非流式, ${bufferType})，长度: ${content.length}`,
                );

                // 检测类型切换
                if (bufferType !== lastBufferType) {
                  // 如果之前在 thinking 块中，先关闭标签
                  if (inThinkingBlock) {
                    fullContent += "</think>";
                    inThinkingBlock = false;
                  }

                  // 如果切换到 thinking，打开标签
                  if (bufferType === "thinking") {
                    fullContent += "<think>";
                    inThinkingBlock = true;
                  }

                  lastBufferType = bufferType;
                }

                // 非流式模式直接使用完整内容
                const prev = prevContentByType[bufferType] ?? "";
                let mode = modeByType[bufferType];
                let delta = "";
                if (!mode && prev) {
                  if (content.startsWith(prev)) {
                    mode = "snapshot";
                    modeByType[bufferType] = mode;
                  } else {
                    mode = "delta";
                    modeByType[bufferType] = mode;
                  }
                }
                if (mode === "snapshot") {
                  delta = content.slice(prev.length);
                  prevContentByType[bufferType] = content;
                } else if (mode === "delta") {
                  delta = content;
                  prevContentByType[bufferType] = prev + content;
                } else {
                  delta = content;
                  prevContentByType[bufferType] = content;
                }

                if (delta) {
                  fullContent += delta;
                }
              }
            }
          } catch (e) {
            console.warn(`解析 buffer 失败 (非流式): ${e}`);
          }
        } else if (msgType === "state") {
          const state = data.state || {};
          console.log(
            `收到 state 消息 (非流式): inProgress=${state.inProgress}`,
          );
          if (!state.inProgress) {
            if (receivedUpdate) {
              // 结束前，如果还在 thinking 块中，关闭标签
              if (inThinkingBlock) {
                fullContent += "</think>";
                inThinkingBlock = false;
              }
              console.log("已收到 update 消息，任务完成 (非流式)");
              break;
            } else {
              console.log("尚未收到 update 消息 (非流式)，继续等待...");
            }
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    ws.close();
    return fullContent;
  } catch (e) {
    console.error(`非流式处理错误: ${e}`);
    throw new Error(`处理请求失败: ${e}`);
  }
}

