/** The account the 4_accounts migration made for the data that was here before accounts. */
export const OWNER_ID = "owner";

/**
 * The email the migration gave the owner, until he adds his own. While he has it, the old dashboard
 * password still logs him in.
 */
export const OWNER_PLACEHOLDER_EMAIL = "owner@gigdash.invalid";
