const WEBREG_URL = "https://sims.rutgers.edu/webreg/";

// Both operations begin inside the user's tap. Waiting for the clipboard
// before opening WebReg can lose popup activation on Safari.
export function copyIndexAndOpenWebReg(index: string, onCopied: () => void, onCopyFailed: () => void): void {
  try {
    void navigator.clipboard.writeText(index).then(onCopied, onCopyFailed);
  } catch {
    onCopyFailed();
  }
  window.open(WEBREG_URL, "_blank", "noopener,noreferrer");
}
