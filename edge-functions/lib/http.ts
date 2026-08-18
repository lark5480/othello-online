/** 统一的 JSON 响应与错误响应构造器（V8 运行时可用，无第三方依赖） */

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function error(message: string, status: number): Response {
  return json({ error: message }, status);
}
