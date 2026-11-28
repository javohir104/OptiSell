/** Tiny event bus: the login page asks the app to play the "welcome" transition. */
export const WELCOME_EVENT = 'optisell:welcome';
export const WELCOME_MS = 1500;

let until = 0;

export function playWelcome(name) {
  until = Date.now() + WELCOME_MS;
  window.dispatchEvent(new CustomEvent(WELCOME_EVENT, { detail: { name } }));
}

/** Seconds until the welcome overlay opens up (so the dashboard animates in right after it). */
export const welcomeDelay = () => Math.max(0, until - Date.now()) / 1000;
