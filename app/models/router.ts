// app/models/router.ts — app-side routing to the gateway. Slice 1.5/1.6.
//
// Runs in MAIN only — never imported by the renderer. Sends the bearer token
// on every gateway call; the panel never sees the token or the gateway URL,
// only the JSON results these functions return. The BYO provider key is
// accepted per-call and forwarded once via the X-Provider-Key header — never
// stored here.

export interface GatewayClientConfig {
  baseUrl: string; // e.g. http://127.0.0.1:PORT — loopback only
  token: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

async function gatewayFetch(config: GatewayClientConfig, path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(config.baseUrl + path, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      authorization: 'Bearer ' + config.token,
      'content-type': 'application/json',
    },
  });
  return res.json();
}

export async function askAgent(
  config: GatewayClientConfig,
  req: { provider: string; model: string; messages: ChatMessage[] },
  providerKey: string,
): Promise<unknown> {
  return gatewayFetch(config, '/chat', {
    method: 'POST',
    headers: { 'X-Provider-Key': providerKey },
    body: JSON.stringify(req),
  });
}

export async function getGateStatus(config: GatewayClientConfig, provider: string): Promise<unknown> {
  return gatewayFetch(config, '/gate/status?provider=' + encodeURIComponent(provider));
}

export async function getQuiz(config: GatewayClientConfig, provider: string): Promise<unknown> {
  return gatewayFetch(config, '/gate/quiz?provider=' + encodeURIComponent(provider));
}

export async function submitQuiz(
  config: GatewayClientConfig,
  provider: string,
  answers: Record<string, number>,
): Promise<unknown> {
  return gatewayFetch(config, '/gate/submit', {
    method: 'POST',
    body: JSON.stringify({ provider, answers }),
  });
}
