import type { MultipartPlan } from '../storage/storage.service';
import type { Video } from './entities/video.entity';

export type UploadPlan =
  | { type: 'single'; url: string }
  | ({ type: 'multipart' } & MultipartPlan);

export interface RegisteredVideo {
  video: Video;
  upload: UploadPlan;
}
