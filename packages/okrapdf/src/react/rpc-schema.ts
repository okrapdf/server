import { normalizeStructuredSchema } from '../structured-schema';
import type { StructuredSchema } from '../types';

type RpcArgObject = Record<string, unknown> & {
  schema?: unknown;
};

export function normalizeOkraRpcArgs(args: readonly unknown[]): unknown[] {
  return args.map((arg) => {
    if (!isRpcArgObject(arg) || arg.schema === undefined) return arg;
    return {
      ...arg,
      schema: normalizeRpcSchema(arg.schema),
    };
  });
}

function normalizeRpcSchema(schema: unknown): unknown {
  if (!isStructuredSchemaLike(schema)) return schema;
  try {
    return normalizeStructuredSchema(schema as StructuredSchema<unknown>).jsonSchema;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Okra RPC schema normalization failed: ${detail}. Pass JSON Schema directly or use a Zod version supported by @okrapdf/sdk.`,
    );
  }
}

function isStructuredSchemaLike(value: unknown): value is StructuredSchema<unknown> {
  return !!value && typeof value === 'object';
}

function isRpcArgObject(value: unknown): value is RpcArgObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
