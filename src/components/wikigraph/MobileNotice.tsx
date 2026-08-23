import { useEffect, useRef, useState } from "react";
import styles from "./MobileNotice.module.css";

const DISMISSED_KEY = "wikigraph-mobile-notice-dismissed";

const wasDismissed = () => {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
};

export default function MobileNotice({ visible }: { visible: boolean }) {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (visible && !dismissed) dialog.showModal();
    else if (dialog.open) dialog.close();

    return () => {
      if (dialog.open) dialog.close();
    };
  }, [visible, dismissed]);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Storage may be unavailable in privacy modes; dismissal still works.
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="mobile-notice-title"
      onCancel={dismiss}
    >
      <div id="mobile-notice-title" className={styles.title}>
        Best experienced on desktop
      </div>
      <p className={styles.message}>
        Wikigraph works on mobile, but it&apos;s much easier to navigate on a
        larger screen.
      </p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={dismiss}
        autoFocus
      >
        Continue on mobile
      </button>
    </dialog>
  );
}
