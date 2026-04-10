/**
 * useDirectlyNotifications
 *
 * Polls the Directly `totalUnread` count every 10 seconds.
 * When the count increases while the panel is closed:
 *  1. Shows a browser Push Notification (requests permission on first trigger)
 *  2. Shows a Sonner in-app toast with sender name + message preview
 *
 * Also polls `listConversations` to get the latest message preview for the toast.
 */

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

interface UseDirectlyNotificationsOptions {
  /** Whether the Directly panel is currently open (suppresses notifications when open) */
  panelOpen: boolean;
  /** Called when user clicks the notification — should open the panel */
  onOpen: () => void;
}

export function useDirectlyNotifications({
  panelOpen,
  onOpen,
}: UseDirectlyNotificationsOptions) {
  const { user } = useAuth();
  const prevUnreadRef = useRef<number | null>(null);
  const permissionRequestedRef = useRef(false);

  // Poll unread count every 10 seconds
  const { data: unreadData } = trpc.directly.totalUnread.useQuery(undefined, {
    refetchInterval: 10_000,
    enabled: !!user,
  });

  // Poll conversations to get the latest message preview
  const { data: conversations } = trpc.directly.listConversations.useQuery(undefined, {
    refetchInterval: 10_000,
    enabled: !!user,
  });

  const requestPermission = useCallback(async () => {
    if (
      typeof Notification === "undefined" ||
      Notification.permission === "granted" ||
      Notification.permission === "denied" ||
      permissionRequestedRef.current
    ) {
      return;
    }
    permissionRequestedRef.current = true;
    await Notification.requestPermission();
  }, []);

  const showBrowserNotification = useCallback(
    (title: string, body: string) => {
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      if (document.visibilityState === "visible" && panelOpen) return;

      try {
        const n = new Notification(title, {
          body,
          icon: "/favicon.ico",
          tag: "directly-message", // collapses multiple rapid notifications
          requireInteraction: false,
        });
        n.onclick = () => {
          window.focus();
          onOpen();
          n.close();
        };
      } catch {
        // Notification API not available in this context
      }
    },
    [panelOpen, onOpen]
  );

  useEffect(() => {
    const currentCount = unreadData?.count ?? 0;

    // First render — just record baseline, don't notify
    if (prevUnreadRef.current === null) {
      prevUnreadRef.current = currentCount;
      return;
    }

    const prevCount = prevUnreadRef.current;
    prevUnreadRef.current = currentCount;

    // No new messages
    if (currentCount <= prevCount) return;

    // Don't notify if the panel is open (user is already reading)
    if (panelOpen) return;

    // Find the most recently updated conversation with unread messages
    const latestConv = conversations
      ?.filter((c) => (c.unreadCount ?? 0) > 0)
      .sort((a, b) => {
        const aTime = a.lastMessage?.createdAt
          ? new Date(a.lastMessage.createdAt).getTime()
          : 0;
        const bTime = b.lastMessage?.createdAt
          ? new Date(b.lastMessage.createdAt).getTime()
          : 0;
        return bTime - aTime;
      })[0];

    const lastMsg = latestConv?.lastMessage as any;
    const senderName =
      lastMsg?.sender?.name ??
      latestConv?.participants?.find((p) => p.userId !== user?.id)?.name ??
      "Someone";

    const preview = lastMsg?.body
      ? (lastMsg.body as string).length > 80
        ? (lastMsg.body as string).slice(0, 80) + "\u2026"
        : (lastMsg.body as string)
      : "Sent you a message";

    const isGopher = lastMsg?.isGopherMessage;
    const notifTitle = isGopher ? "Gopher" : senderName;
    const notifBody = isGopher ? `Gopher: ${preview}` : preview;

    // Request browser permission on first new message
    requestPermission().then(() => {
      showBrowserNotification(`Directly — ${notifTitle}`, notifBody);
    });

    // Always show in-app toast (even if panel is closed on another page)
    toast(notifTitle, {
      description: preview,
      duration: 6000,
      action: {
        label: "Open",
        onClick: onOpen,
      },
    });
  }, [
    unreadData?.count,
    conversations,
    panelOpen,
    user?.id,
    onOpen,
    requestPermission,
    showBrowserNotification,
  ]);
}
