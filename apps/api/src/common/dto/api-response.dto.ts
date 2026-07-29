import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Documents the pagination block of the response envelope. */
export class PaginationMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 10 }) limit!: number;
  @ApiProperty({ example: 24 }) total!: number;
  @ApiProperty({ example: 3 }) totalPages!: number;
  @ApiProperty({ example: true }) hasNextPage!: boolean;
  @ApiProperty({ example: false }) hasPreviousPage!: boolean;
}

export class ApiFieldErrorDto {
  @ApiProperty({ example: 'email' }) field!: string;
  @ApiProperty({ example: 'email must be an email' }) message!: string;
}

/** Documents the error envelope produced by `AllExceptionsFilter`. */
export class ApiErrorDto {
  @ApiProperty({ example: false }) success!: false;
  @ApiProperty({ example: 422 }) statusCode!: number;
  @ApiProperty({ example: 'UNPROCESSABLE_ENTITY' }) error!: string;
  @ApiProperty({ example: 'The submitted data is invalid.' }) message!: string;
  @ApiPropertyOptional({ type: [ApiFieldErrorDto] }) errors?: ApiFieldErrorDto[];
  @ApiProperty({ example: '/api/v1/tours' }) path!: string;
  @ApiProperty({ example: '2024-05-21T10:35:00.000Z' }) timestamp!: string;
}
