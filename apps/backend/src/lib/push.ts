/**
 * Notificação push via Expo Push API — funciona pro entregador (Android)
 * assim que o projeto tiver credenciais FCM configuradas na EAS; até lá,
 * a Expo simplesmente recusa o envio e isto vira um no-op silencioso (o
 * app continua funcionando via polling normal).
 */
export async function sendExpoPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: pushToken, title, body, data, priority: "high", sound: "default" }),
    });
  } catch {
    // notificação é best-effort — nunca deve derrubar o fluxo de dispatch.
  }
}
