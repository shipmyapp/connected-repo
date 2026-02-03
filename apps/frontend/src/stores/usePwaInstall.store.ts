import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
	preventDefault: () => void;
}

interface PwaInstallState {
  userPlatform: "chromium" | "ios" | "other" | null;
	setUserPlatform: (platform: "chromium" | "ios" | "other") => void;
  showPwaInstallationPrompt: boolean;
  deferredInstallationPrompt: BeforeInstallPromptEvent | null;
  triggerInstallationFlow: (deferredPrompt?: BeforeInstallPromptEvent)=> void;
  dismissInstallationFlow: (permanant?: boolean)=> void;
}

/**
 * the localStorage key to store/retrieve dismissal flag of pwa-installation prompt 
 */
const PWA_INSTALLATION_DISMISSAL_KEY = 'pwa_install_dismissed';
const PWA_INSTALLATION_DISMISSAL_DURATION_DAYS = 2;

export const usePwaInstallStore = create<PwaInstallState>((set) => ({

	userPlatform: null,

	setUserPlatform: (platform) => {
		set({ userPlatform: platform });
	},

  showPwaInstallationPrompt: false,
  deferredInstallationPrompt: null,

  triggerInstallationFlow: (deferredPrompt?: BeforeInstallPromptEvent)=>{

    // Check if installation has been dismissed in the last 2 days
    const dismissedTimestamp = localStorage.getItem(PWA_INSTALLATION_DISMISSAL_KEY);

    if (dismissedTimestamp) {
        const now = Date.now();
        const dismissedAt = Number(dismissedTimestamp);
        const durationMs = PWA_INSTALLATION_DISMISSAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
        if (now - dismissedAt < durationMs) {
            return;
        }
    }

    set({
      showPwaInstallationPrompt: true,
      deferredInstallationPrompt: deferredPrompt ?? null,
    });

  },

  dismissInstallationFlow: ()=>{

    set({
      showPwaInstallationPrompt: false,
      deferredInstallationPrompt: null,
    });

    localStorage.setItem(PWA_INSTALLATION_DISMISSAL_KEY, Date.now().toString());
  }
  
}));