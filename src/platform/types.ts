import type { ProductId } from '../economy/defs';

export type AdPlacement = 'revive' | 'double' | 'reroll' | 'freeDiamonds';

/** earned = reward granted · dismissed = closed early · unavailable = no ad could be shown. */
export type RewardResult = 'earned' | 'dismissed' | 'unavailable';

export interface StoreProduct {
  id: ProductId;
  /** Localised price from the store (or a fallback label in the web demo). */
  price: string;
  /** Numeric price and ISO currency from the store (missing in the web demo). */
  amount?: number;
  currency?: string;
}

/** A purchase the store reports as paid. The app credits it, then calls `finish`. */
export interface CompletedPurchase {
  productId: ProductId;
  token: string;
  finish(): Promise<void>;
}

export type ShareResult = 'shared' | 'copied' | 'failed';

export type PurchaseOutcome = 'ok' | 'cancelled' | 'pending' | 'error' | 'unavailable';

export interface Platform {
  /** Running inside the Android app. */
  readonly native: boolean;
  /** Ads and purchases are simulated (browser). */
  readonly demo: boolean;
  init(): Promise<void>;

  // ── Ads ──
  /** Shows a rewarded ad. Only 'earned' may grant the reward. */
  showRewarded(placement: AdPlacement): Promise<RewardResult>;
  showInterstitial(): Promise<void>;
  /** Whether the user must be offered a way to change their ad consent (EU). */
  privacyOptionsAvailable(): boolean;
  showPrivacyOptions(): Promise<void>;

  // ── Purchases ──
  getProducts(): Promise<StoreProduct[]>;
  purchase(id: ProductId, onPaid: (p: CompletedPurchase) => void): Promise<PurchaseOutcome>;
  /** Purchases that were paid but never credited/finished (crash, pending → paid). */
  recoverPurchases(onPaid: (p: CompletedPurchase) => void): Promise<void>;
  /** Owned one-time products (for "restore purchases"). */
  ownedProducts(): Promise<ProductId[]>;

  // ── Device ──
  vibrate(pattern: number | number[]): void;
  keepAwake(on: boolean): void;
  onBackButton(handler: () => void): void;
  onPauseResume(handler: (active: boolean) => void): void;
  exitApp(): void;
  /** Shares a text (system share sheet; falls back to copying it). */
  share(text: string): Promise<ShareResult>;
  /** Asks Google Play for its in-app rating dialog (Google decides whether it shows). */
  requestReview(): Promise<void>;
}

/** Copies text to the clipboard (used when sharing is not possible). */
export async function copyText(text: string): Promise<ShareResult> {
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
