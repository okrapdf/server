import { doc } from './url';

type BrowserRuntimeGlobal = typeof globalThis & {
  OkraRuntime?: {
    doc: typeof doc;
  };
};

const runtimeGlobal = globalThis as BrowserRuntimeGlobal;
runtimeGlobal.OkraRuntime = {
  ...(runtimeGlobal.OkraRuntime || {}),
  doc,
};

export { doc };
export default { doc };
