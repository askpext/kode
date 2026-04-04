import { platform, release } from 'os';

export function isWslEnvironment(): boolean {
  if (platform() !== 'linux') {
    return false;
  }

  return Boolean(
    process.env.WSL_DISTRO_NAME
    || process.env.WSL_INTEROP
    || release().toLowerCase().includes('microsoft')
  );
}

export function isNativeWindowsEnvironment(): boolean {
  return platform() === 'win32' && !isWslEnvironment();
}

export function getSupportedPlatformLabel(): string {
  if (isWslEnvironment()) {
    return 'WSL';
  }

  switch (platform()) {
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    case 'win32':
      return 'Windows';
    default:
      return platform();
  }
}
