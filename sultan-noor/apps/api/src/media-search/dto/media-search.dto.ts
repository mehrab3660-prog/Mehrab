import { IsString } from 'class-validator';

export class ImageSearchDto {
  // Data URI or externally-hosted URL of the query image.
  @IsString()
  imageUrl: string;
}

export class VoiceSearchDto {
  // Base64-encoded audio (webm/mp3/wav) captured from the browser mic.
  @IsString()
  audioBase64: string;
}
