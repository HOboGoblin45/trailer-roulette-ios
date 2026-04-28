/**
 * Player router — picks the right implementation based on platform.
 * iOS uses SFSafariViewController via @capacitor/browser (ToS-compliant).
 * Web uses an iframe embed.
 *
 * The platform check happens at module load so bundlers tree-shake the unused
 * implementation in production builds where possible.
 */
import { Capacitor } from '@capacitor/core';
import PlayerWeb from './Player.web.jsx';
import PlayerIOS from './Player.ios.jsx';

const Impl = Capacitor.getPlatform() === 'ios' ? PlayerIOS : PlayerWeb;

export default function Player(props) {
  return <Impl {...props} />;
}
