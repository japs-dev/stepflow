export function isMacPlatform(): boolean {
  return (
    typeof window !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(window.navigator.platform || window.navigator.userAgent)
  );
}

export function getCmdLabel(): 'Cmd' | 'Ctrl' {
  return isMacPlatform() ? 'Cmd' : 'Ctrl';
}
