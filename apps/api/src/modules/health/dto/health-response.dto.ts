import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'development' })
  environment!: string;

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({ example: 128, description: 'Process uptime in seconds.' })
  uptime!: number;

  @ApiProperty({ example: '2024-05-21T10:35:00.000Z' })
  timestamp!: string;
}

export class ReadinessResponseDto {
  @ApiProperty({ example: 'ready' })
  status!: 'ready';

  @ApiProperty({ example: 'up' })
  database!: 'up';

  @ApiProperty({ example: '2024-05-21T10:35:00.000Z' })
  timestamp!: string;
}
