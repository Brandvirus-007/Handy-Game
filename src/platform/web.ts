import { t } from '../core/i18n';
import { PRODUCTS, type ProductId } from '../economy/defs';
import type { AdPlacement, CompletedPurchase, Platform, PurchaseOutcome, RewardResult, StoreProduct } from './types';

/**
 * Browser implementation: ads and purchases are simulated with clearly labelled demo
 * overlays, so every monetisation flow can be played and tested without the Android app.
 */
export class WebPlatform implements Platform {
  readonly native = false;
  readonly demo = true;
  private wakeLock: { release(): Promise<void> } | null = null;

  async init(): Promise<void> {}

  async showRewarded(_placement: AdPlacement): Promise<RewardResult> {
    return (await demoOverlay({ seconds: 4, rewarded: true })) ? 'earned' : 'dismissed';
  }

  async showInterstitial(): Promise<void> {
    await demoOverlay({ seconds: 2, rewarded: false });
  }

  privacyOptionsAvailable(): boolean {
    return false;
  }

  async showPrivacyOptions(): Promise<void> {}

  async getProducts(): Promise<StoreProduct[]> {
    return PRODUCTS.map((p) => ({ id: p.id, price: p.fallbackPrice }));
  }

  async purchase(id: ProductId, onPaid: (p: CompletedPurchase) => void): Promise<PurchaseOutcome> {
    const p = PRODUCTS.find((x) => x.id === id);
    if (!p) return 'error';
    const ok = await demoConfirm(t(`shop.product.${id}` as 'shop.product.no_ads'), p.fallbackPrice);
    if (!ok) return 'cancelled';
    onPaid({ productId: id, token: `demo-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`, finish: async () => {} });
    return 'ok';
  }

  async recoverPurchases(): Promise<void> {}

  async ownedProducts(): Promise<ProductId[]> {
    return [];
  }

  vibrate(pattern: number | number[]): void {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  }

  keepAwake(on: boolean): void {
    type WakeLockApi = { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
    const wl = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (on && wl && !this.wakeLock) {
      wl.request('screen')
        .then((l) => (this.wakeLock = l))
        .catch(() => undefined);
    } else if (!on && this.wakeLock) {
      const l = this.wakeLock;
      this.wakeLock = null;
      l.release().catch(() => undefined);
    }
  }

  onBackButton(): void {}
  onPauseResume(): void {}
  exitApp(): void {}
}

function demoOverlay(opts: { seconds: number; rewarded: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'demo-ad';
    el.innerHTML = `
      <div class="demo-ad-box">
        <div class="demo-ad-tag">${t('demo.adTag')}</div>
        <div class="demo-ad-ring"><span>${opts.seconds}</span></div>
        <p>${t(opts.rewarded ? 'demo.adRewarded' : 'demo.adInterstitial')}</p>
        <div class="demo-ad-actions">
          ${opts.rewarded ? `<button class="btn ghost small" data-act="skip">${t('demo.adSkip')}</button>` : ''}
          <button class="btn small" data-act="done" disabled>${t(opts.rewarded ? 'demo.adClaim' : 'common.close')}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const counter = el.querySelector('.demo-ad-ring span')!;
    const done = el.querySelector<HTMLButtonElement>('[data-act=done]')!;
    let left = opts.seconds;
    const timer = setInterval(() => {
      left--;
      counter.textContent = String(Math.max(0, left));
      if (left <= 0) {
        clearInterval(timer);
        done.disabled = false;
        el.classList.add('done');
      }
    }, 1000);
    const finish = (earned: boolean) => {
      clearInterval(timer);
      el.remove();
      resolve(earned);
    };
    el.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'skip') finish(false);
      if (act === 'done' && !done.disabled) finish(opts.rewarded);
    });
  });
}

function demoConfirm(name: string, price: string): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="dialog">
      <div class="demo-ad-tag">${t('demo.buyTag')}</div>
      <p><b>${name}</b> · ${price}</p>
      <p class="hint" style="text-align:left;margin:0">${t('demo.buyBody')}</p>
      <div class="grid2">
        <button class="btn ghost" data-act="no">${t('common.cancel')}</button>
        <button class="btn" data-act="yes">${t('demo.buyConfirm')}</button>
      </div></div>`;
    wrap.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'yes' || act === 'no' || e.target === wrap) {
        wrap.remove();
        resolve(act === 'yes');
      }
    });
    document.body.appendChild(wrap);
  });
}
