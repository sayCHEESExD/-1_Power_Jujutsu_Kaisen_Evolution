import { STARTER_CHARACTER } from '@jjk/shared';
import { lookFromState } from '../bloxity/avatarLook.js';
import type { NetPlayerState } from '../net/netTypes.js';
import { AVATAR_SLOT, type BodyLook } from '../suits/SuitBody.js';

/**
 * What a replicated player LOOKS like: the equipped character when they wear
 * its morph, else their own Bloxity avatar (which then travels with the look).
 * Local and remote players both come through here, so every screen draws the
 * same body.
 */
export const lookOf = (state: NetPlayerState): BodyLook =>
  state.morph
    ? { character: state.character || STARTER_CHARACTER }
    : { character: AVATAR_SLOT, avatar: lookFromState(state.avatar) };
