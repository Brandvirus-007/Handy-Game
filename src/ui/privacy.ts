import { getLang } from '../core/i18n';

/**
 * In-app summary of the privacy policy. The full policy (public/privacy.html) must be hosted
 * publicly and its URL entered in the Play Console. Fill in the placeholders before publishing.
 */
export const PRIVACY_URL = 'https://brandvirus-007.github.io/Handy-Game/privacy.html';

export function privacyHtml(): string {
  if (getLang() === 'en') {
    return `
      <h3>Privacy at a glance</h3>
      <p><b>Game data</b> (progress, settings, purchases you made) is stored only on your device. We run no servers and create no accounts.</p>
      <p><b>Advertising:</b> The Android app shows ads from Google AdMob. Google may process your device's advertising ID, IP address and usage data to deliver and measure ads. In the EU/UK you are asked for consent first; you can change your choice at any time in the settings.</p>
      <p><b>Purchases</b> are handled entirely by Google Play. We never see your payment details.</p>
      <p><b>No data</b> is sold. The game is not directed at children under 13.</p>
      <p>Full policy and contact: <span class="url">${PRIVACY_URL}</span></p>`;
  }
  return `
    <h3>Datenschutz auf einen Blick</h3>
    <p><b>Spieldaten</b> (Fortschritt, Einstellungen, getätigte Käufe) werden nur auf deinem Gerät gespeichert. Wir betreiben keine Server und legen keine Konten an.</p>
    <p><b>Werbung:</b> Die Android-App zeigt Anzeigen von Google AdMob. Google kann dabei die Werbe-ID deines Geräts, die IP-Adresse und Nutzungsdaten verarbeiten, um Anzeigen auszuliefern und zu messen. In der EU/UK wirst du vorher um Einwilligung gebeten; du kannst sie jederzeit in den Einstellungen ändern.</p>
    <p><b>Käufe</b> wickelt ausschließlich Google Play ab. Deine Zahlungsdaten sehen wir nie.</p>
    <p>Es werden <b>keine Daten verkauft</b>. Das Spiel richtet sich nicht an Kinder unter 13 Jahren.</p>
    <p>Vollständige Erklärung und Kontakt: <span class="url">${PRIVACY_URL}</span></p>`;
}
