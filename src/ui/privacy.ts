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
      <p><b>Game data</b> (progress, settings, purchases) stays on your device. I don’t run any servers.</p>
      <p><b>Google Play Games:</b> If you are signed in, Google stores your scores, achievements and a copy of your progress in your Google account, so you can keep playing on another phone. Signing in is optional.</p>
      <p><b>Ads:</b> The Android app shows ads from Google AdMob. Google may use your advertising ID, IP address and usage data to show and count ads. In the EU and UK the app asks for your consent first. You can change it any time in the settings.</p>
      <p><b>Purchases</b> go entirely through Google Play. I never see your payment details.</p>
      <p><b>No data is sold.</b> The game is not meant for children under 13.</p>
      <p>Full policy and contact: <span class="url">${PRIVACY_URL}</span></p>`;
  }
  return `
    <h3>Datenschutz kurz erklärt</h3>
    <p><b>Spieldaten</b> (Fortschritt, Einstellungen, Käufe) bleiben auf deinem Gerät. Ich betreibe keine eigenen Server.</p>
    <p><b>Google Play Games:</b> Bist du angemeldet, speichert Google deine Punkte, Erfolge und eine Kopie deines Fortschritts in deinem Google-Konto. So kannst du auf einem anderen Handy weiterspielen. Die Anmeldung ist freiwillig.</p>
    <p><b>Werbung:</b> Die Android-App zeigt Werbung von Google AdMob. Google kann dabei die Werbe-ID, die IP-Adresse und Nutzungsdaten verwenden, um Werbung anzuzeigen und zu zählen. In der EU und in Großbritannien fragt die App vorher nach deiner Einwilligung. Du kannst sie jederzeit in den Einstellungen ändern.</p>
    <p><b>Käufe</b> laufen komplett über Google Play. Deine Zahlungsdaten sehe ich nie.</p>
    <p><b>Es werden keine Daten verkauft.</b> Das Spiel ist nicht für Kinder unter 13 Jahren gedacht.</p>
    <p>Ganze Erklärung und Kontakt: <span class="url">${PRIVACY_URL}</span></p>`;
}
