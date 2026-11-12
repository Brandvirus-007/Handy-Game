/**
 * Store & ad configuration. Replace the AdMob IDs with your own before publishing
 * (and the APPLICATION_ID in android/app/src/main/res/values/strings.xml).
 * As long as Google's official test IDs are configured, the app requests test ads only.
 */
export const ADMOB = {
  appId: 'ca-app-pub-3940256099942544~3347511713',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
};

const TEST_PREFIX = 'ca-app-pub-3940256099942544';
export const ADS_ARE_TEST = ADMOB.rewarded.startsWith(TEST_PREFIX) || ADMOB.interstitial.startsWith(TEST_PREFIX);
