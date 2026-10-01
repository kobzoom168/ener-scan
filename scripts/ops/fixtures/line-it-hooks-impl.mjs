export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith("?real")) return nextResolve(specifier.slice(0, -5), context);
  if (specifier === "@line/bot-sdk") {
    return { url: new URL("./fake-line-bot-sdk.mjs", import.meta.url).href, shortCircuit: true };
  }
  if (specifier.endsWith("/storage/scanUploadStorage.js")) {
    return { url: new URL("./fake-scanUploadStorage.mjs", import.meta.url).href, shortCircuit: true };
  }
  if (specifier.endsWith("/scanV2/scanUploadThumbnail.service.js") || specifier.endsWith("./scanUploadThumbnail.service.js")) {
    return { url: new URL("./fake-scanUploadThumbnail.mjs", import.meta.url).href, shortCircuit: true };
  }
  if (specifier.endsWith("/objectCheck.service.js")) {
    return { url: new URL("./fake-objectCheck.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
