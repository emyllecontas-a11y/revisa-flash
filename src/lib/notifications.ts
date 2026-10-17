// src/lib/notifications.ts
// Avisos do navegador (notificações nativas). Reaproveitado pelo Pomodoro
// e pelo Desafio do Dia.
//
// Importante: os navegadores exigem que o usuário autorize. A gente só pede
// quando a pessoa liga a opção nas Ajustes — nunca do nada.

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

// Pede permissão. Só chame depois de um clique do usuário.
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

// Dispara uma notificação. Não faz nada se não tiver permissão.
export function notify(title: string, body?: string): void {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, silent: false });
  } catch {
    // iOS Safari não permite new Notification() fora de um Service Worker.
    // Falha silenciosa aqui — o alarme sonoro continua funcionando.
  }
}