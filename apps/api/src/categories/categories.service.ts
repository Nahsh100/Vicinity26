import { Injectable } from '@nestjs/common';
import type { Category, CategorySummary } from '@vicinity/shared';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { BadRequest, NotFound } from '../common/errors';
import { slugify } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(80).optional(),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  aliases: z.array(z.string().trim().min(2).max(60)).max(40).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

type Row = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  aliases?: { alias: string }[];
};

export const toCategorySummary = (c: Pick<Row, 'id' | 'slug' | 'name' | 'icon' | 'color' | 'parentId'>): CategorySummary => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  icon: c.icon,
  color: c.color,
  parentId: c.parentId,
});

@Injectable()
export class CategoriesService {
  private cache: { at: number; tree: Category[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Active category tree with live listing counts. Cached for 60 s. */
  async tree(includeInactive = false): Promise<Category[]> {
    if (!includeInactive && this.cache && Date.now() - this.cache.at < 60_000) return this.cache.tree;
    const [rows, counts] = await Promise.all([
      this.prisma.category.findMany({
        where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { aliases: { select: { alias: true }, orderBy: { alias: 'asc' } } },
      }),
      this.prisma.$queryRaw<{ categoryId: string; n: number }[]>`
        SELECT "categoryId", count(*)::int AS n FROM "Listing"
         WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL AND "visibility" = 'PUBLIC'
         GROUP BY "categoryId"`,
    ]);
    const countBy = new Map(counts.map((c) => [c.categoryId, c.n]));
    const toCat = (r: Row): Category => ({
      ...toCategorySummary(r),
      description: r.description,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      aliases: r.aliases?.map((a) => a.alias) ?? [],
      listingCount: countBy.get(r.id) ?? 0,
    });
    const parents = rows.filter((r) => !r.parentId).map(toCat);
    for (const p of parents) {
      p.children = rows.filter((r) => r.parentId === p.id).map(toCat);
      p.listingCount = (p.listingCount ?? 0) + p.children.reduce((s, c) => s + (c.listingCount ?? 0), 0);
    }
    if (!includeInactive) this.cache = { at: Date.now(), tree: parents };
    return parents;
  }

  async get(idOrSlug: string): Promise<Category> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const c = await this.prisma.category.findFirst({
      where: { deletedAt: null, ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }) },
      include: {
        aliases: { select: { alias: true } },
        children: { where: { deletedAt: null, isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!c) throw NotFound('Category');
    return {
      ...toCategorySummary(c),
      description: c.description,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      aliases: c.aliases.map((a) => a.alias),
      children: c.children.map((ch) => ({ ...toCategorySummary(ch), description: ch.description, sortOrder: ch.sortOrder, isActive: ch.isActive })),
    };
  }

  /** Categories matching typed text, by name or alias (fuzzy). Powers search suggestions. */
  async suggest(q: string, limit = 6): Promise<(CategorySummary & { matched: string })[]> {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const rows = await this.prisma.$queryRaw<(Row & { matched: string; score: number })[]>`
      SELECT c."id", c."slug", c."name", c."icon", c."color", c."parentId", m.matched, max(m.score) AS score
        FROM (
          SELECT "id" AS cid, "name" AS matched, similarity(lower("name"), ${term}) AS score FROM "Category"
           WHERE lower("name") % ${term} OR lower("name") LIKE ${'%' + term + '%'}
          UNION ALL
          SELECT "categoryId", "alias", similarity(lower("alias"), ${term}) FROM "CategoryAlias"
           WHERE lower("alias") % ${term} OR lower("alias") LIKE ${'%' + term + '%'}
        ) m
        JOIN "Category" c ON c."id" = m.cid
       WHERE c."isActive" AND c."deletedAt" IS NULL
       GROUP BY c."id", m.matched
       ORDER BY score DESC
       LIMIT ${limit * 3}`;
    const seen = new Set<string>();
    return rows
      .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      .slice(0, limit)
      .map((r) => ({ ...toCategorySummary(r), matched: r.matched }));
  }

  /** Expands a category id to itself plus active children (selecting a parent searches all of it). */
  async expand(categoryId: string): Promise<string[]> {
    const kids = await this.prisma.category.findMany({ where: { parentId: categoryId, deletedAt: null }, select: { id: true } });
    return [categoryId, ...kids.map((k) => k.id)];
  }

  // ── Admin ──

  async create(input: CategoryInput, actorId: string) {
    if (input.parentId) await this.assertParent(input.parentId);
    const c = await this.prisma.category.create({
      data: {
        name: input.name,
        slug: input.slug ?? slugify(input.name),
        parentId: input.parentId ?? null,
        description: input.description,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        aliases: input.aliases ? { create: [...new Set(input.aliases.map((a) => a.toLowerCase()))].map((alias) => ({ alias })) } : undefined,
      },
    });
    this.cache = null;
    await this.audit.log({ actorId, action: 'category.create', targetType: 'Category', targetId: c.id, metadata: { name: c.name } });
    return this.get(c.id);
  }

  async update(id: string, input: Partial<CategoryInput>, actorId: string) {
    if (input.parentId) {
      if (input.parentId === id) throw BadRequest('A category cannot be its own parent');
      await this.assertParent(input.parentId);
      const hasChildren = await this.prisma.category.count({ where: { parentId: id } });
      if (hasChildren) throw BadRequest('A category with subcategories cannot become a subcategory');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.category.update({
        where: { id },
        data: {
          name: input.name,
          slug: input.slug,
          parentId: input.parentId,
          description: input.description,
          icon: input.icon,
          color: input.color,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
      });
      if (input.aliases) {
        await tx.categoryAlias.deleteMany({ where: { categoryId: id } });
        await tx.categoryAlias.createMany({
          data: [...new Set(input.aliases.map((a) => a.toLowerCase()))].map((alias) => ({ categoryId: id, alias })),
        });
      }
    });
    this.cache = null;
    await this.audit.log({ actorId, action: 'category.update', targetType: 'Category', targetId: id, metadata: input });
    return this.get(id);
  }

  /** Soft-deletes; refused while active listings still use the category. */
  async remove(id: string, actorId: string) {
    const inUse = await this.prisma.listing.count({ where: { categoryId: id, deletedAt: null } });
    if (inUse) throw BadRequest(`${inUse} listings still use this category. Move them or deactivate the category instead.`, 'CATEGORY_IN_USE');
    const kids = await this.prisma.category.count({ where: { parentId: id, deletedAt: null } });
    if (kids) throw BadRequest('Remove its subcategories first', 'CATEGORY_HAS_CHILDREN');
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    this.cache = null;
    await this.audit.log({ actorId, action: 'category.delete', targetType: 'Category', targetId: id });
    return { deleted: true };
  }

  private async assertParent(parentId: string) {
    const p = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!p || p.deletedAt) throw BadRequest('Parent category not found');
    if (p.parentId) throw BadRequest('Categories have two levels: a parent cannot itself be a subcategory');
  }
}
