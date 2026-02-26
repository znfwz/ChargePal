import { useEffect, useMemo, useState } from 'react';

type InstallOutcome = 'accepted' | 'dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>;
}

const DISMISS_KEY = 'chargepal_install_prompt_dismissed_at';
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const isIos = (): boolean => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // Safari iOS standalone
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

export const useInstallPrompt = () => {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [choice, setChoice] = useState<InstallOutcome | null>(null);

  useEffect(() => {
    const previousDismissedAt = Number(localStorage.getItem(DISMISS_KEY) || '0');
    if (previousDismissedAt && Date.now() - previousDismissedAt < DISMISS_TTL_MS) {
      setDismissed(true);
    }

    if (isStandalone()) {
      setInstalled(true);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setChoice('accepted');
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const showPrompt = useMemo(() => {
    if (installed || dismissed) {
      return false;
    }
    if (isIos()) {
      return true;
    }
    return promptEvent !== null;
  }, [dismissed, installed, promptEvent]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const promptInstall = async (): Promise<InstallOutcome | null> => {
    if (!promptEvent) {
      return null;
    }
    await promptEvent.prompt();
    const result = await promptEvent.userChoice;
    setChoice(result.outcome);
    if (result.outcome === 'accepted') {
      setInstalled(true);
    } else {
      dismiss();
    }
    setPromptEvent(null);
    return result.outcome;
  };

  return {
    isIos: isIos(),
    installed,
    showPrompt,
    canDirectInstall: !!promptEvent,
    promptInstall,
    dismiss,
    choice,
  };
};
