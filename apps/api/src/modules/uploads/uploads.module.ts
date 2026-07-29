import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  BadRequestException,
  Controller,
  Inject,
  Injectable,
  Module,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';

import { ApiEnvelopeResponse } from '../../common/decorators/api-response.decorator';
import { Roles } from '../../common/decorators/auth.decorators';
import { appConfig } from '../../config/configuration';

/** Where uploads land on disk, relative to the API's working directory. */
export const UPLOAD_DIR = 'uploads';
export const UPLOAD_ROUTE = '/uploads';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Accepted image types, each with the magic bytes that actually identify it.
 * A caller controls the filename and the declared MIME type, so neither is
 * trusted — the file's own header decides.
 */
const SIGNATURES: { extension: string; mime: string; matches: (buffer: Buffer) => boolean }[] = [
  {
    extension: '.jpg',
    mime: 'image/jpeg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    extension: '.png',
    mime: 'image/png',
    matches: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    extension: '.webp',
    mime: 'image/webp',
    matches: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    extension: '.avif',
    mime: 'image/avif',
    matches: (b) =>
      b.subarray(4, 8).toString('ascii') === 'ftyp' &&
      b.subarray(8, 12).toString('ascii').startsWith('avif'),
  },
];

export class UploadResultDto {
  @ApiProperty({ example: '/uploads/6f1c….jpg' }) url!: string;
  @ApiProperty({ example: 'image/jpeg' }) mimeType!: string;
  @ApiProperty({ example: 248_312 }) sizeBytes!: number;
}

/**
 * Local-disk storage.
 *
 * This is the driver, not the contract: swapping in S3 or a CDN means
 * replacing `store()` and leaving every caller untouched. Files are written
 * under a random name so an upload can never overwrite another, and the
 * original filename never reaches the filesystem.
 */
@Injectable()
export class UploadsService {
  constructor(@Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>) {}

  async store(file: Express.Multer.File): Promise<UploadResultDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file was received.');
    }

    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Images must be 10MB or smaller.');
    }

    // The declared MIME type is a hint; the header is the evidence.
    const signature = SIGNATURES.find((candidate) => candidate.matches(file.buffer));

    if (!signature) {
      throw new BadRequestException('Only JPG, PNG, WebP and AVIF images are accepted.');
    }

    const directory = join(process.cwd(), UPLOAD_DIR);
    await mkdir(directory, { recursive: true });

    const filename = `${randomUUID()}${signature.extension}`;
    await writeFile(join(directory, filename), file.buffer);

    return {
      // Absolute so the browser can load it whatever origin the app runs on.
      url: `${this.config.apiPublicUrl}${UPLOAD_ROUTE}/${filename}`,
      mimeType: signature.mime,
      sizeBytes: file.size,
    };
  }
}

@ApiTags('Uploads')
@ApiBearerAuth('access-token')
@Controller('admin/uploads')
@Roles('ADMIN', 'EDITOR')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Upload an image for a tour gallery or blog cover' })
  @ApiEnvelopeResponse(UploadResultDto)
  upload(@UploadedFile() file: Express.Multer.File): Promise<UploadResultDto> {
    return this.uploads.store(file);
  }
}

@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
