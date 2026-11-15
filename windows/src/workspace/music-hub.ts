import {h,svg} from '../views/dom';
import {AbLoopEngine} from './ab-loop';
import {audioLibrary,type AudioTrack,type AudioPlaylist} from './audio-library';
import {readAudioMetadata,formatBadge} from './audio-metadata';
import {durationText} from './audio-data';
import {
  nextTrack,
  previousTrack,
  shuffled,
  reconcileQueue,
  enqueueTrack,
  playNextTrack,
  playPreviousTrack,
  removeTrack,
  type RepeatMode
} from './audio-queue';
import {kindFromFile,kindLabel} from './media-kinds';
import {
  fetchFeed,
  loadFeeds,
  saveFeeds,
  substackFeedUrl,
  updateEpisodePosition,
  markEpisodePlayed,
  downloadPodcastEnclosure,
  removeDownloadedPodcast,
  type PodcastFeed,
  type PodcastEpisode
} from './podcast-feeds';
import {parseLyrics,activeLine,matchLyricsTrack,type Lyrics} from './lyrics';
import {chapterEndAt,chapterSleepStep} from './sleep-timer';
import {fetchOnlineLyrics} from './lyrics-provider';
import {cssUrl,onlineLookupsEnabled,safeHttpsUrl,setOnlineLookups,ONLINE_LOOKUPS_OFF} from './online-lookups';
import {hasSafeFetch,safeFetchImage} from './safe-fetch';
import {resolveCoverSrc} from './cover-src';
import {echoDna} from './echo-music-dna';
import {handOffLockScreen,lockScreenPlan,nativeBridgeId} from './lock-screen';
import {rankMusicFlowCandidates,filterMusicFlowCandidates,audioTrackToFlowItem,type MusicFlowItem} from './music-flow';
import {
  streamService,
  cacheStreamTrack,
  findBrokenStreamEntries,
  pruneIdsFromPlaylistOrders,
  searchMultiSource,
  resolveDirectUrl,
  resolveBatchUrl,
  queueWithArchiveParts,
  describeStreamError,
  unresolvedStreamError,
  verifyAudioUrl,
  type StreamService,
  type StreamTrack,
  type StreamSearchResult
} from './stream-service';
import {audioDsp} from './audio-dsp';
import {ensurePreservesPitch} from './audio-pitch';

export type {AudioTrack,AudioPlaylist};

type Preferences={current?:string;position:number;volume:number;speed:number;fade:number;autoplay?:boolean;recent:string[];favorites:string[];queue:string[];originalQueue:string[];shuffle:boolean;repeat:RepeatMode;sort:'newest'|'oldest'|'title'|'title-desc'|'artist'|'artist-desc'|'longest'|'shortest'|'year'|'year-desc'|'random'|'mostplayed'|'leastplayed'|'album'|'album-desc'|'genre'|'genre-desc'|'recent'|'trackno'|'composer'|'composer-desc'|'discno'|'albumartist'|'albumartist-desc'|'bitrate'|'bitrate-desc'|'size'|'size-desc'|'samplerate'|'samplerate-desc'|'channels'|'channels-desc'|'bpm'|'bpm-desc'|'bitdepth'|'bitdepth-desc'|'format'|'format-desc'|'chapters'|'chapters-desc'|'lyrics'|'lyrics-desc'|'cover'|'cover-desc'|'hasbpm'|'hasbpm-desc'|'hasyear'|'hasyear-desc'|'hasgenre'|'hasgenre-desc'|'hasartist'|'hasartist-desc'|'hasalbum'|'hasalbum-desc'|'hascomposer'|'hascomposer-desc'|'hastrackno'|'hastrackno-desc'|'hasdiscno'|'hasdiscno-desc'|'hasalbumartist'|'hasalbumartist-desc';showRemaining?:boolean};

export function createMusicHub(options:{exportPlaylist?:(text:string)=>void|Promise<void>;notify:(text:string)=>void;beforePlay:()=>void|Promise<void>}){
 const library=audioLibrary(),audio=new Audio();audio.preload='metadata';
 audio.crossOrigin='anonymous';
 audioDsp.attachAudioElement(audio);
 ensurePreservesPitch(audio, true);
 // ... rest of the file would be here, but truncated for this example. The full file is the modified one.
}