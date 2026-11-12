import type { PluginListenerHandle } from '@capacitor/core';
import { PRODUCTS, getProduct, type ProductId } from '../economy/defs';
import { ADMOB, ADS_ARE_TEST } from './config';
import type { AdPlacement, CompletedPurchase, Platform, PurchaseOutcome, StoreProduct } from './types';

type AdMobModule = typeof import('@capacitor-community/admob');
type PurchasesModule = typeof import('@capgo/native-purchases');
type Transaction = import('@capgo/native-purchases').Transaction;

const PURCHASED = '1';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Android implementation: AdMob (with Google UMP consent) + Google Play Billing.
 * Every plugin is loaded lazily so the web build never pulls them in.
 */
export class NativePlatform implements Platform {
  readonly native = true;
  readonly demo = false;
  private ads: AdMobModule | null = null;
  private iap: PurchasesModule | null = null;
  private canRequestAds = false;
  private privacyRequired = false;
  private rewardedReady: Promise<boolean> | null = null;
  private interstitialReady: Promise<boolean> | null = null;
  private billing = false;
  private purchaseHandler: ((p: CompletedPurchase) => void) | null = null;
  private app: typeof import('@capacitor/app') | null = null;
  private haptics: typeof import('@capacitor/haptics') | null = null;
  private keepAwakeMod: typeof import('@capacitor-community/keep-awake') | null = null;

  async init(): Promise<void> {
    const [app, haptics, keep, status] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/haptics'),
      import('@capacitor-community/keep-awake'),
      import('@capacitor/status-bar'),
    ]);
    this.app = app;
    this.haptics = haptics;
    this.keepAwakeMod = keep;
    try {
      await status.StatusBar.hide();
    } catch {
      /* not critical */
    }
    // Ads and billing initialise in the background so the menu is usable immediately.
    void this.initAds();
    void this.initBilling();
  }

  // ───────────────────────── Ads ─────────────────────────

  private async initAds(): Promise<void> {
    try {
      this.ads = await import('@capacitor-community/admob');
      const { AdMob, AdmobConsentStatus } = this.ads;
      // Google's consent (UMP) must be gathered before ads are requested (EEA/UK).
      try {
        let info = await AdMob.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) info = await AdMob.showConsentForm();
        this.canRequestAds = info.canRequestAds;
        // The enum is not exported by the plugin's index – compare the string value.
        this.privacyRequired = String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
      } catch {
        this.canRequestAds = true;
      }
      if (!this.canRequestAds) return;
      await AdMob.initialize({ initializeForTesting: ADS_ARE_TEST });
      this.loadRewarded();
      this.loadInterstitial();
    } catch {
      this.canRequestAds = false;
    }
  }

  private loadRewarded(): void {
    if (!this.ads) return;
    this.rewardedReady = this.ads.AdMob.prepareRewardVideoAd({ adId: ADMOB.rewarded, isTesting: ADS_ARE_TEST })
      .then(() => true)
      .catch(() => false);
  }

  private loadInterstitial(): void {
    if (!this.ads) return;
    this.interstitialReady = this.ads.AdMob.prepareInterstitial({ adId: ADMOB.interstitial, isTesting: ADS_ARE_TEST })
      .then(() => true)
      .catch(() => false);
  }

  async showRewarded(_placement: AdPlacement): Promise<boolean> {
    if (!this.ads || !this.canRequestAds) return false;
    const { AdMob, RewardAdPluginEvents } = this.ads;
    let ready = await (this.rewardedReady ?? Promise.resolve(false));
    if (!ready) {
      this.loadRewarded();
      ready = await (this.rewardedReady ?? Promise.resolve(false));
      if (!ready) return false;
    }
    this.rewardedReady = null;
    let earned = false;
    const handles: PluginListenerHandle[] = [];
    let close!: () => void;
    const closed = new Promise<void>((r) => (close = r));
    // Rewards are granted only from the Rewarded event – never on click or dismiss.
    handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (earned = true)));
    handles.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => close()));
    handles.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => close()));
    AdMob.showRewardVideoAd().then(
      () => (earned = true),
      () => close(),
    );
    await Promise.race([closed, sleep(180_000)]);
    for (const h of handles) void h.remove();
    this.loadRewarded();
    return earned;
  }

  async showInterstitial(): Promise<void> {
    if (!this.ads || !this.canRequestAds) return;
    const ready = await (this.interstitialReady ?? Promise.resolve(false));
    if (!ready) {
      this.loadInterstitial();
      return;
    }
    this.interstitialReady = null;
    const { AdMob, InterstitialAdPluginEvents } = this.ads;
    let close!: () => void;
    const closed = new Promise<void>((r) => (close = r));
    const handles = [
      await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => close()),
      await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => close()),
    ];
    AdMob.showInterstitial().catch(() => close());
    await Promise.race([closed, sleep(120_000)]);
    for (const h of handles) void h.remove();
    this.loadInterstitial();
  }

  privacyOptionsAvailable(): boolean {
    return this.privacyRequired;
  }

  async showPrivacyOptions(): Promise<void> {
    try {
      await this.ads?.AdMob.showPrivacyOptionsForm();
    } catch {
      /* form unavailable */
    }
  }

  // ───────────────────────── Purchases ─────────────────────────

  private async initBilling(): Promise<void> {
    try {
      this.iap = await import('@capgo/native-purchases');
      const { isBillingSupported } = await this.iap.NativePurchases.isBillingSupported();
      this.billing = isBillingSupported;
      // Pending purchases (e.g. paid in a shop) complete later – credit them when they do.
      await this.iap.NativePurchases.addListener('transactionUpdated', (tx) => {
        if (tx.purchaseState === PURCHASED) this.deliver(tx);
      });
    } catch {
      this.billing = false;
    }
  }

  private async ready(): Promise<boolean> {
    for (let i = 0; i < 30 && !this.iap; i++) await sleep(100);
    return !!this.iap && this.billing;
  }

  private deliver(tx: Transaction): void {
    const id = tx.productIdentifier as ProductId;
    const def = PRODUCTS.find((p) => p.id === id);
    const token = tx.purchaseToken ?? tx.transactionId;
    if (!def || !token || !this.iap || !this.purchaseHandler) return;
    const iap = this.iap.NativePurchases;
    this.purchaseHandler({
      productId: id,
      token,
      finish: () => (def.consumable ? iap.consumePurchase({ purchaseToken: token }) : iap.acknowledgePurchase({ purchaseToken: token })),
    });
  }

  async getProducts(): Promise<StoreProduct[]> {
    const fallback = PRODUCTS.map((p) => ({ id: p.id, price: p.fallbackPrice }));
    if (!(await this.ready()) || !this.iap) return fallback;
    try {
      const { products } = await this.iap.NativePurchases.getProducts({
        productIdentifiers: PRODUCTS.map((p) => p.id),
        productType: this.iap.PURCHASE_TYPE.INAPP,
      });
      return PRODUCTS.map((p) => ({ id: p.id, price: products.find((x) => x.identifier === p.id)?.priceString ?? p.fallbackPrice }));
    } catch {
      return fallback;
    }
  }

  async purchase(id: ProductId, onPaid: (p: CompletedPurchase) => void): Promise<PurchaseOutcome> {
    if (!(await this.ready()) || !this.iap) return 'unavailable';
    this.purchaseHandler = onPaid;
    try {
      // We acknowledge/consume ourselves – only after the reward has been saved.
      const tx = await this.iap.NativePurchases.purchaseProduct({
        productIdentifier: id,
        productType: this.iap.PURCHASE_TYPE.INAPP,
        isConsumable: false,
        autoAcknowledgePurchases: false,
        quantity: 1,
      });
      if (tx.purchaseState && tx.purchaseState !== PURCHASED) return 'pending';
      this.deliver(tx);
      return 'ok';
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
      return msg.includes('cancel') ? 'cancelled' : 'error';
    }
  }

  async recoverPurchases(onPaid: (p: CompletedPurchase) => void): Promise<void> {
    this.purchaseHandler = onPaid;
    if (!(await this.ready()) || !this.iap) return;
    try {
      const { transactions } = await this.iap.NativePurchases.getUnfinishedTransactions();
      for (const tx of transactions) if (!tx.purchaseState || tx.purchaseState === PURCHASED) this.deliver(tx);
    } catch {
      /* nothing to recover */
    }
  }

  async ownedProducts(): Promise<ProductId[]> {
    if (!(await this.ready()) || !this.iap) return [];
    try {
      const { purchases } = await this.iap.NativePurchases.getPurchases({ productType: this.iap.PURCHASE_TYPE.INAPP });
      return purchases
        .filter((p) => !p.purchaseState || p.purchaseState === PURCHASED)
        .map((p) => p.productIdentifier as ProductId)
        .filter((id) => PRODUCTS.some((d) => d.id === id) && !getProduct(id).consumable);
    } catch {
      return [];
    }
  }

  // ───────────────────────── Device ─────────────────────────

  vibrate(pattern: number | number[]): void {
    const duration = Array.isArray(pattern) ? pattern.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) : pattern;
    this.haptics?.Haptics.vibrate({ duration: Math.max(10, Math.min(400, duration)) }).catch(() => undefined);
  }

  keepAwake(on: boolean): void {
    const k = this.keepAwakeMod?.KeepAwake;
    if (!k) return;
    (on ? k.keepAwake() : k.allowSleep()).catch(() => undefined);
  }

  onBackButton(handler: () => void): void {
    void this.whenApp().then((a) => a?.App.addListener('backButton', () => handler()));
  }

  onPauseResume(handler: (active: boolean) => void): void {
    void this.whenApp().then((a) => a?.App.addListener('appStateChange', (s) => handler(s.isActive)));
  }

  exitApp(): void {
    void this.app?.App.exitApp();
  }

  private async whenApp() {
    for (let i = 0; i < 50 && !this.app; i++) await sleep(50);
    return this.app;
  }
}
