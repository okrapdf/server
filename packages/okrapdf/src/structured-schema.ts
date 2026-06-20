import { z, type ZodType } from 'zod';
import type { JsonSchema, StructuredSchema } from './types';

export interface NormalizedStructuredSchema<T> {
  jsonSchema: JsonSchema;
  parser?: ZodType<T>;
}

export interface StructuredValidationSuccess<T> {
  success: true;
  data: T;
}

export interface StructuredValidationFailure {
  success: false;
  issues: string[];
}

export function normalizeStructuredSchema<T>(
  schema: StructuredSchema<T>,
): NormalizedStructuredSchema<T> {
  const maybeZod = schema as ZodType<T>;
  const hasSafeParse = typeof (maybeZod as { safeParse?: unknown }).safeParse === 'function';
  if (hasSafeParse) {
    return {
      jsonSchema: z.toJSONSchema(maybeZod, { target: 'draft-2020-12' }) as JsonSchema,
      parser: maybeZod,
    };
  }
  return { jsonSchema: schema as JsonSchema };
}

export function structuredSchemaCacheKey<T>(schema: StructuredSchema<T>): string {
  return JSON.stringify(normalizeStructuredSchema(schema).jsonSchema);
}

export function validateStructuredData<T>(
  schema: StructuredSchema<T>,
  value: unknown,
): StructuredValidationSuccess<T> | StructuredValidationFailure {
  const normalized = normalizeStructuredSchema(schema);
  if (normalized.parser) {
    const parsed = normalized.parser.safeParse(value);
    if (parsed.success) {
      return { success: true, data: parsed.data };
    }
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
        return `${path}${issue.message}`;
      }),
    };
  }

  const issues: string[] = [];
  validateJsonSchemaValue(normalized.jsonSchema, value, '$', issues);
  if (issues.length > 0) {
    return { success: false, issues };
  }
  return { success: true, data: value as T };
}

function validateJsonSchemaValue(
  schema: JsonSchema | undefined,
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (!schema || typeof schema !== 'object') return;

  const type = typeof schema.type === 'string' ? schema.type : undefined;
  if (type) {
    validateJsonSchemaType(type, value, path, issues);
    if (issues.length > 0) return;
  }

  if (type === 'object' || (!type && isRecord(value))) {
    validateJsonSchemaObject(schema, value, path, issues);
    return;
  }

  if (type === 'array' || (!type && Array.isArray(value))) {
    validateJsonSchemaArray(schema, value, path, issues);
  }
}

function validateJsonSchemaType(
  type: string,
  value: unknown,
  path: string,
  issues: string[],
): void {
  const valid =
    (type === 'string' && typeof value === 'string') ||
    (type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
    (type === 'integer' && typeof value === 'number' && Number.isInteger(value)) ||
    (type === 'boolean' && typeof value === 'boolean') ||
    (type === 'null' && value === null) ||
    (type === 'object' && isRecord(value)) ||
    (type === 'array' && Array.isArray(value));

  if (!valid) {
    const actual =
      value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    issues.push(`${path}: expected ${type}, received ${actual}`);
  }
}

function validateJsonSchemaObject(
  schema: JsonSchema,
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`${path}: expected object`);
    return;
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  for (const key of required) {
    if (typeof key === 'string' && !(key in value)) {
      issues.push(`${path}.${key}: is required`);
    }
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!(key in value)) continue;
    validateJsonSchemaValue(propertySchema as JsonSchema, value[key], `${path}.${key}`, issues);
  }
}

function validateJsonSchemaArray(
  schema: JsonSchema,
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (!Array.isArray(value)) {
    issues.push(`${path}: expected array`);
    return;
  }

  const minItems = typeof schema.minItems === 'number' ? schema.minItems : undefined;
  const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : undefined;
  if (typeof minItems === 'number' && value.length < minItems) {
    issues.push(`${path}: expected at least ${minItems} items`);
  }
  if (typeof maxItems === 'number' && value.length > maxItems) {
    issues.push(`${path}: expected at most ${maxItems} items`);
  }

  const itemSchema = isRecord(schema.items) ? (schema.items as JsonSchema) : undefined;
  if (!itemSchema) return;
  value.forEach((item, index) => {
    validateJsonSchemaValue(itemSchema, item, `${path}[${index}]`, issues);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
