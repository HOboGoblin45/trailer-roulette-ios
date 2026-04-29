/**
 * Player router — picks the right implementation based on platform.
 * Both iOS and web use the YouTube IFrame Player API (since v1.2.0) for
 * real onEnded events and seamless video swapping. Implementations live
 * in separate files to allow future platform-specific affordances
 * (e.g. iOS-only AirPlay routing).
 *
 * The platform check happens at module load so bundlers tree-shake the
 * unused implementation in production builds where possible.
 */
import { Capacitor } from '@capacitor/core';
import PlayerWeb from './Player.web.jsx';
import PlayerIOS from './Player.ios.jsx';

const Impl = Capacitor.getPlatform() === 'ios' ? PlayerIOS : PlayerWeb;

export default function Player(props) {
  return <Impl {...props} />;
}
