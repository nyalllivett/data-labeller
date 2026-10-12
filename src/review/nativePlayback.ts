import type { VideoPlayer } from 'expo-video';
import type { PlaybackPort } from './PlaybackController';

export type VideoHandle = Pick<VideoPlayer, 'currentTime' | 'status' | 'playing' | 'play' | 'pause' | 'addListener'>;
export function nativePlayback(player: VideoHandle): PlaybackPort {
  return {
    read: () => ({ status: player.status, positionMs: player.currentTime * 1000, playing: player.playing }),
    play: () => player.play(), pause: () => player.pause(), seek: (mediaMs) => { player.currentTime = mediaMs / 1000; },
    subscribe(listener) {
      const subscriptions: { remove(): void }[] = [];
      try {
        subscriptions.push(player.addListener('timeUpdate', ({ currentTime }) => listener({ positionMs: currentTime * 1000 })));
        subscriptions.push(player.addListener('statusChange', ({ status }) => listener({ status })));
        subscriptions.push(player.addListener('playingChange', ({ isPlaying }) => listener({ playing: isPlaying })));
      } catch (error) { for (const subscription of subscriptions) subscription.remove(); throw error; }
      return () => { for (const subscription of subscriptions) subscription.remove(); };
    },
  };
}
