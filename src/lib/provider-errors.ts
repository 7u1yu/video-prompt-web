export function formatProviderError(err: unknown) {
  const status = typeof err === "object" && err && "status" in err ? Number(err.status) : undefined;
  const message = err instanceof Error ? err.message : "模型供应商请求失败";
  const lowerMessage = message.toLowerCase();

  if (
    status === 429 ||
    lowerMessage.includes("quota") ||
    lowerMessage.includes("billing") ||
    lowerMessage.includes("rate limit")
  ) {
    return "模型供应商返回 429：当前 API Key 额度不足、账单未启用或请求频率超限。请在 API 设置中更换可用 Key，检查供应商账单/额度，或切换到其他模型供应商。";
  }

  if (status === 401 || lowerMessage.includes("invalid api key") || lowerMessage.includes("incorrect api key")) {
    return "模型供应商认证失败：请检查 API Key 是否正确，或确认当前 Key 有权限访问所选模型。";
  }

  if (status === 404 || lowerMessage.includes("model") && lowerMessage.includes("not found")) {
    return "模型不可用：请检查模型名是否正确，或切换到该供应商支持的模型。";
  }

  return message;
}
