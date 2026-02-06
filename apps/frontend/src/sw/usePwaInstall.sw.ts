import { usePwaInstallStore } from '@frontend/stores/usePwaInstall.store';
import { useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
	preventDefault: () => void;
}

export function usePWAInstall() {
  //TODO: is there a better way of doing this? 
	const triggerInstallationFlow = usePwaInstallStore((state) => state.triggerInstallationFlow);
	const dismissInstallationFlow = usePwaInstallStore((state) => state.dismissInstallationFlow);
	const setUserPlatform = usePwaInstallStore((state) => state.setUserPlatform);
	const userPlatform = usePwaInstallStore((state) => state.userPlatform);

  useEffect(() => {

    // check if display is open in standalone mode, return early if so
    const isDisplayStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & {standalone: boolean}).standalone === true;
    
      if (isDisplayStandalone) {
      return;
    }

    //Detect User-Platform
    const userAgent = window.navigator.userAgent || "";
    const isChromium = (window as any).chrome !== undefined;
    const isIOS = /iPad|iPhone|iPod|Macintosh|Safari/.test(userAgent) && !isChromium;

    if(!userPlatform || userPlatform == null) setUserPlatform(isChromium ? "chromium" : isIOS ? "ios" : "other");

    // Trigger installation flow if not Chromium
    if (!isChromium) {
      triggerInstallationFlow();
      return;
    }
    
    const handleBeforeInstallPrompt = (e: Event) => {
        triggerInstallationFlow(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
        dismissInstallationFlow();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [triggerInstallationFlow, dismissInstallationFlow, setUserPlatform, userPlatform]);
}