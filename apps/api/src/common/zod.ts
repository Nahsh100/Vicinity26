import { applyDecorators, Body, Query, PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { BadRequest } from './errors';

export class ZodPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const r = this.schema.safeParse(value ?? {});
    if (r.success) return r.data;
    const details: Record<string, string[]> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }
    throw BadRequest('Some fields need attention', 'VALIDATION_FAILED', details);
  }
}

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    const s = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete s.$schema;
    return s;
  } catch {
    return { type: 'object' };
  }
}

/** Validates the request body with a shared zod schema and documents it in Swagger. */
export const ZBody = (schema: z.ZodType) => Body(new ZodPipe(schema));

export const ApiZodBody = (schema: z.ZodType) =>
  applyDecorators(ApiBody({ schema: jsonSchema(schema) as never }));

/** Validates the query string. Query values arrive as strings, so schemas should use z.coerce. */
export const ZQuery = (schema: z.ZodType) => Query(new ZodPipe(schema));

export const ApiZodQuery = (schema: z.ZodObject<z.ZodRawShape>) =>
  applyDecorators(
    ...Object.keys(schema.shape).map((name) =>
      ApiQuery({ name, required: !(schema.shape[name] as z.ZodType).safeParse(undefined).success, type: String }),
    ),
  );

export const uuidParam = z.string().uuid();
