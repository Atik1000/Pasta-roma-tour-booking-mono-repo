import {
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import type { PaginationMeta } from '@pasta/types';
import { buildPaginationMeta, normalizePagination } from '@pasta/utils';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../../common/decorators/api-response.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';

/** Only published, non-deleted posts reach the public site. */
const PUBLIC_BLOG_FILTER = { status: 'PUBLISHED', deletedAt: null } as const;

export class ListPostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Category name, e.g. "Travel Guide".' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ description: 'Free-text search over title and content.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class BlogSummaryDto {
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ description: 'First paragraph, derived from the content.' }) excerpt!: string;
  @ApiProperty({ type: [String] }) categories!: string[];
  @ApiPropertyOptional({ nullable: true }) publishedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) coverImage!: string | null;
}

export class BlogDetailDto extends BlogSummaryDto {
  @ApiProperty({ description: 'Markdown body.' }) content!: string;
  @ApiPropertyOptional({ nullable: true }) metaTitle!: string | null;
  @ApiPropertyOptional({ nullable: true }) metaDescription!: string | null;
  @ApiProperty({ type: [String] }) keywords!: string[];
}

export class BlogCategoryDto {
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Published posts in this category.' }) count!: number;
}

/** The design shows no excerpt field, so the teaser is derived from the body. */
function deriveExcerpt(content: string, maxLength = 180): string {
  const firstParagraph = content
    .split('\n\n')
    .map((block) => block.trim())
    .find((block) => block.length > 0 && !block.startsWith('#'));

  const text = (firstParagraph ?? '').replace(/\s+/g, ' ');
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trimEnd()}…`;
}

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPostsQueryDto): Promise<{ data: BlogSummaryDto[]; meta: PaginationMeta }> {
    const { page, limit, skip, take } = normalizePagination(query);

    const where = {
      ...PUBLIC_BLOG_FILTER,
      ...(query.category ? { categories: { some: { category: { name: query.category } } } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' as const } },
              { content: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take,
        include: { categories: { include: { category: { select: { name: true } } } } },
      }),
      this.prisma.blog.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        excerpt: deriveExcerpt(row.content),
        categories: row.categories.map((link) => link.category.name),
        publishedAt: row.publishedAt?.toISOString() ?? null,
        coverImage: row.coverImage,
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findBySlug(slug: string): Promise<BlogDetailDto> {
    const post = await this.prisma.blog.findFirst({
      where: { slug, ...PUBLIC_BLOG_FILTER },
      include: { categories: { include: { category: { select: { name: true } } } } },
    });

    if (!post) {
      throw new NotFoundException('That article could not be found.');
    }

    return {
      slug: post.slug,
      title: post.title,
      excerpt: deriveExcerpt(post.content),
      content: post.content,
      categories: post.categories.map((link) => link.category.name),
      publishedAt: post.publishedAt?.toISOString() ?? null,
      coverImage: post.coverImage,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      keywords: post.keywords,
    };
  }

  async categories(): Promise<BlogCategoryDto[]> {
    const rows = await this.prisma.blogCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { blogs: { where: { blog: PUBLIC_BLOG_FILTER } } } },
      },
    });

    return rows.map((row) => ({ name: row.name, slug: row.slug, count: row._count.blogs }));
  }
}

@ApiTags('Blog')
@Controller('blog')
@Public()
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @ApiOperation({ summary: 'Published articles' })
  @ApiPaginatedResponse(BlogSummaryDto)
  list(@Query() query: ListPostsQueryDto) {
    return this.blog.list(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Categories with published post counts' })
  @ApiEnvelopeResponse(BlogCategoryDto)
  categories(): Promise<BlogCategoryDto[]> {
    return this.blog.categories();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'A single published article' })
  @ApiEnvelopeResponse(BlogDetailDto)
  findOne(@Param('slug') slug: string): Promise<BlogDetailDto> {
    return this.blog.findBySlug(slug);
  }
}

@Module({
  controllers: [BlogController],
  providers: [BlogService],
})
export class BlogModule {}
