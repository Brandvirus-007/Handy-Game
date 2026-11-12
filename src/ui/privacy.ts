import { getLang } from '../core/i18n';

/**
 * In-app summary of the privacy policy. The full policy (public/privacy.html) must be hosted
 * publicly and its URL entered in the Play Console. Fill in the placeholders before publishing.
 */
export const PRIVACY_URL = 'https://brandvirus-007.github.io/Handy-Game/privacy.html';

export function privacyHtml(): string {
  if (getLang() === 'en') {
    return `
      <h3>Privacy in short</h3>
      <p><b>Game data</b> (progress, settings, purchases) stays on your device. There are no servers and no accounts.</p>
      <p><b>Ads:</b> The Android app shows ads from Google AdMob. Google may use your advertising ID, IP address and usage data to show and count ads. In the EU and UK the app asks for your consent first. You can change it any time in the settings.</p>
      <p><b>Purchases</b> go entirely through Google Play. I never see your payment details.</p>
      <p><b>No data is sold.</b> The game is not meant for children under 13.</p>
      <p>Full policy and contact: <span class="url">${PRIVACY_URL}</span></p>`;
  }
  return `
    <h3>Datenschutz kurz erklärt</h3>
    <p><b>Spieldaten</b> (Fortschritt, Einstellungen, Käufe) bleiben auf deinem Gerät. Es gibt keine Server und keine Konten.</p>
    <p><b>Werbung:</b> Die Android-App zeigt Werbung von Google AdMob. Google kann dabei die Werbe-ID, die IP-Adresse und Nutzungsdaten verwenden, um Werbung anzuzeigen und zu zählen. In der EU und in Großbritannien fragt die App vorher nach deiner Einwilligung. Du kannst sie jederzeit in den Einstellungen ändern.</p>
    <p><b>Käufe</b> laufen komplett über Google Play. Deine Zahlungsdaten sehe ich nie.</p>
    <p><b>Es werden keine Daten verkauft.</b> Das Spiel ist nicht für Kinder unter 13 Jahren gedacht.</p>
    <p>Ganze Erklärung und Kontakt: <span class="url">${PRIVACY_URL}</span></p>`;
}
