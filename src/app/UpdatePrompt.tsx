import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button, useToast } from "../ui";

const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Service worker registration. New versions download in the background (checked hourly and
 * when the app returns to the foreground); the reload waits for the lifter to tap it, so an
 * update never interrupts a set.
 */
export function UpdatePrompt() {
  const toast = useToast();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine && !registration.installing) void registration.update();
      };
      window.setInterval(check, CHECK_EVERY_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    toast.show({ message: "Ready to work offline." });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady, toast]);

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <p className="update-banner__text">A new version is ready. Your log is saved; reloading takes a second.</p>
      <div className="update-banner__actions">
        <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
        <Button variant="secondary" onClick={() => void updateServiceWorker(true)}>
          Reload
        </Button>
      </div>
    </div>
  );
}
