/**
 * App-wide feature flags.
 */

/**
 * When true, subscribers/players are forced to set up TOTP 2FA before they can
 * use their account, and must enter a code on each sign-in.
 *
 * Currently ON HOLD — set back to `true` to re-enable mandatory 2FA. All the
 * 2FA code (enrollment, login challenge, admin reset) stays in place.
 */
export const ENFORCE_PLAYER_2FA = false
