import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave } from '../src/core/storage';
import { creditPurchase } from '../src/economy/profile';

/* The Android platform is tested against mocked Capacitor plugins: these tests pin down the
   money-relevant rules (rewards only on the Rewarded event, credit-then-consume, recovery). */

const m = vi.hoisted(() => {
  const adListeners: Record<string, (arg?: unknown) => void> = {};
  const iapListeners: Record<string, (arg?: unknown) => void> = {};
  return {
    adListeners,
    iapListeners,
    admob: {
      AdMob: {
        requestConsentInfo: vi.fn(async () => ({ status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED', isConsentFormAvailable: true })),
        showConsentForm: vi.fn(),
        initialize: vi.fn(async () => undefined),
        prepareRewardVideoAd: vi.fn(async () => ({ adUnitId: 'r' })),
        prepareInterstitial: vi.fn(async () => ({ adUnitId: 'i' })),
        addListener: vi.fn(async (ev: string, fn: (arg?: unknown) => void) => {
          adListeners[ev] = fn;
          return { remove: async () => void delete adListeners[ev] };
        }),
        showRewardVideoAd: vi.fn(),
        showInterstitial: vi.fn(async () => undefined),
        showPrivacyOptionsForm: vi.fn(async () => undefined),
      },
      AdmobConsentStatus: { REQUIRED: 'REQUIRED', OBTAINED: 'OBTAINED' },
      RewardAdPluginEvents: { Rewarded: 'reward', Dismissed: 'dismissed', FailedToShow: 'failed' },
      InterstitialAdPluginEvents: { Dismissed: 'i-dismissed', FailedToShow: 'i-failed' },
    },
    iap: {
      NativePurchases: {
        isBillingSupported: vi.fn(async () => ({ isBillingSupported: true })),
        addListener: vi.fn(async (ev: string, fn: (arg?: unknown) => void) => {
          iapListeners[ev] = fn;
          return { remove: async () => undefined };
        }),
        getProducts: vi.fn(async () => ({ products: [{ identifier: 'diamonds_80', priceString: '1,09 €' }] })),
        purchaseProduct: vi.fn(),
        consumePurchase: vi.fn(async () => undefined),
        acknowledgePurchase: vi.fn(async () => undefined),
        getUnfinishedTransactions: vi.fn(async () => ({ transactions: [{ productIdentifier: 'no_ads', purchaseToken: 'tok-rec', purchaseState: '1' }] })),
        getPurchases: vi.fn(async () => ({
          purchases: [
            { productIdentifier: 'no_ads', purchaseState: '1' },
            { productIdentifier: 'diamonds_80', purchaseState: '1' },
          ],
        })),
      },
      PURCHASE_TYPE: { INAPP: 'inapp' },
    },
  };
});

vi.mock('@capacitor-community/admob', () => m.admob);
vi.mock('@capgo/native-purchases', () => m.iap);
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: async () => undefined })), exitApp: vi.fn() } }));
vi.mock('@capacitor/haptics', () => ({ Haptics: { vibrate: vi.fn(async () => undefined) } }));
vi.mock('@capacitor-community/keep-awake', () => ({ KeepAwake: { keepAwake: vi.fn(async () => undefined), allowSleep: vi.fn(async () => undefined) } }));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { hide: vi.fn(async () => undefined) } }));

const { NativePlatform } = await import('../src/platform/native');
const tick = () => new Promise((r) => setTimeout(r, 15));

async function ready() {
  const p = new NativePlatform();
  await p.init();
  await tick();
  return p;
}

describe('native ads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grants a reward only when the Rewarded event fires', async () => {
    const p = await ready();
    m.admob.AdMob.showRewardVideoAd.mockImplementation(async () => {
      setTimeout(() => {
        m.adListeners.reward?.();
        m.adListeners.dismissed?.();
      }, 1);
      return { type: 'r', amount: 1 };
    });
    expect(await p.showRewarded('revive')).toBe(true);
  });

  it('gives nothing if the ad is closed early', async () => {
    const p = await ready();
    m.admob.AdMob.showRewardVideoAd.mockImplementation(() => {
      setTimeout(() => m.adListeners.dismissed?.(), 1);
      return new Promise(() => undefined); // never resolves: no reward
    });
    expect(await p.showRewarded('double')).toBe(false);
  });

  it('gives nothing if the ad fails to show and preloads a new one', async () => {
    const p = await ready();
    m.admob.AdMob.showRewardVideoAd.mockImplementation(async () => {
      throw new Error('failed to show');
    });
    expect(await p.showRewarded('reroll')).toBe(false);
    expect(m.admob.AdMob.prepareRewardVideoAd).toHaveBeenCalled();
  });

  it('exposes the EU privacy options when consent requires them', async () => {
    const p = await ready();
    expect(p.privacyOptionsAvailable()).toBe(true);
    expect(m.admob.AdMob.initialize).toHaveBeenCalled();
  });
});

describe('native purchases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('credits, then consumes consumables with the purchase token', async () => {
    const p = await ready();
    m.iap.NativePurchases.purchaseProduct.mockResolvedValue({ productIdentifier: 'diamonds_80', purchaseToken: 'tok-1', transactionId: 'x', purchaseState: '1' });
    const paid: { productId: string; token: string; finish(): Promise<void> }[] = [];
    expect(await p.purchase('diamonds_80', (x) => paid.push(x))).toBe('ok');
    expect(paid).toHaveLength(1);
    expect(paid[0].token).toBe('tok-1');
    // Nothing is consumed before the app has credited and saved the reward.
    expect(m.iap.NativePurchases.consumePurchase).not.toHaveBeenCalled();
    await paid[0].finish();
    expect(m.iap.NativePurchases.consumePurchase).toHaveBeenCalledWith({ purchaseToken: 'tok-1' });
    expect(m.iap.NativePurchases.purchaseProduct.mock.calls[0][0]).toMatchObject({ autoAcknowledgePurchases: false });
  });

  it('acknowledges (does not consume) one-time products', async () => {
    const p = await ready();
    m.iap.NativePurchases.purchaseProduct.mockResolvedValue({ productIdentifier: 'no_ads', purchaseToken: 'tok-2', transactionId: 'x', purchaseState: '1' });
    let finish: (() => Promise<void>) | null = null;
    await p.purchase('no_ads', (x) => (finish = x.finish));
    await finish!();
    expect(m.iap.NativePurchases.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: 'tok-2' });
    expect(m.iap.NativePurchases.consumePurchase).not.toHaveBeenCalled();
  });

  it('reports pending and cancelled purchases without crediting', async () => {
    const p = await ready();
    const onPaid = vi.fn();
    m.iap.NativePurchases.purchaseProduct.mockResolvedValueOnce({ productIdentifier: 'diamonds_80', purchaseToken: 't', transactionId: 'x', purchaseState: '2' });
    expect(await p.purchase('diamonds_80', onPaid)).toBe('pending');
    m.iap.NativePurchases.purchaseProduct.mockRejectedValueOnce(new Error('User cancelled the purchase'));
    expect(await p.purchase('diamonds_80', onPaid)).toBe('cancelled');
    expect(onPaid).not.toHaveBeenCalled();
  });

  it('recovers paid-but-unfinished purchases and credits completed pending ones', async () => {
    const p = await ready();
    const onPaid = vi.fn();
    await p.recoverPurchases(onPaid);
    expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ productId: 'no_ads', token: 'tok-rec' }));
    m.iapListeners.transactionUpdated?.({ productIdentifier: 'diamonds_80', purchaseToken: 'tok-late', purchaseState: '1' });
    expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ productId: 'diamonds_80', token: 'tok-late' }));
  });

  it('restores only one-time products and shows store prices', async () => {
    const p = await ready();
    expect(await p.ownedProducts()).toEqual(['no_ads']);
    const prices = await p.getProducts();
    expect(prices.find((x) => x.id === 'diamonds_80')?.price).toBe('1,09 €');
    expect(prices.find((x) => x.id === 'diamonds_450')?.price).toBe('4,99 €');
  });
});

describe('crediting', () => {
  it('credits each purchase token exactly once', () => {
    const s = defaultSave();
    expect(creditPurchase(s, 'diamonds_450', 'tok-a')).toBe(true);
    expect(creditPurchase(s, 'diamonds_450', 'tok-a')).toBe(false);
    expect(s.diamonds).toBe(450);
    expect(creditPurchase(s, 'starter_pack', 'tok-b')).toBe(true);
    expect(s.chars).toContain('nova');
    expect(s.owned.starter).toBe(true);
    expect(s.bank).toBe(3000);
  });
});
