import type { ProductId } from '../economy/defs';

export type AdPlacement = 'revive' | 'double' | 'reroll' | 'freeDiamonds';

export interface StoreProduct {
  id: ProductId;
  /** Localised price from the store (or a fallback label in the web demo). */
  price: string;
}

/** A purchase the store reports as paid. The app credits it, then calls `finish`. */
export interface CompletedPurchase {
  productId: ProductId;
  token: string;
  finish(): Promise<void>;
}

export type PurchaseOutcome = 'ok' | 'cancelled' | 'pending' | 'error' | 'unavailable';

export interface Platform {
  /** Running inside the Android app. */
  readonly native: boolean;
  /** Ads and purchases are simulated (browser). */
  readonly demo: boolean;
  init(): Promise<void>;

  // ── Ads ──
  /** Shows a rewarded ad. Resolves true only if the reward was earned. */
  showRewarded(placement: AdPlacement): Promise<boolean>;
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
}
