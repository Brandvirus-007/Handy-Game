import { Capacitor } from '@capacitor/core';
import type { Platform } from './types';
import { WebPlatform } from './web';

export type { Platform } from './types';

/** Picks the Android implementation inside the Capacitor app, the demo implementation elsewhere. */
export async function createPlatform(): Promise<Platform> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { NativePlatform } = await import('./native');
      return new NativePlatform();
    }
  } catch {
    /* fall through to web */
  }
  return new WebPlatform();
}

export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};
