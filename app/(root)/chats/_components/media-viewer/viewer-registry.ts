import type { FC } from 'react';
import type { MediaType } from '../attachment-menu';
import type { ViewerProps } from './viewer-types';
import { ImageViewer } from './viewers/ImageViewer';
import { VideoViewer } from './viewers/VideoViewer';
import { AudioViewer } from './viewers/AudioViewer';
import { DocumentViewer } from './viewers/DocumentViewer';

// Open/Closed: add new types by registering here without touching existing viewers
const registry: Record<MediaType, FC<ViewerProps>> = {
  image: ImageViewer,
  video: VideoViewer,
  audio: AudioViewer,
  document: DocumentViewer,
};

export function getViewer(type: MediaType): FC<ViewerProps> {
  return registry[type] ?? DocumentViewer;
}
