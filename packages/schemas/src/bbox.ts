import { z } from "zod";

/** 0-1 normalized bounding box (canonical format used by API) */
export const bboxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

/** Legacy ymin/xmin format (web app) */
export const bboxLegacySchema = z.object({
  ymin: z.number(),
  xmin: z.number(),
  ymax: z.number(),
  xmax: z.number(),
  label: z.string().optional(),
});

export type Bbox = z.infer<typeof bboxSchema>;
export type BboxLegacy = z.infer<typeof bboxLegacySchema>;
