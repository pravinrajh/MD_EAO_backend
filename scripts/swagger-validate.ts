import { buildOpenApiDocument, OPENAPI_TAGS } from "../src/docs/openapi";
import { assertMatchesExpressInventory, assertValidOpenApi } from "../src/docs/validate";

try {
  const document = buildOpenApiDocument();
  const result = assertValidOpenApi(document);
  assertMatchesExpressInventory(result.operations);

  console.log(`OpenAPI ${document.openapi} valid`);
  console.log(`Endpoints: ${result.endpointCount}`);
  for (const tag of OPENAPI_TAGS) {
    console.log(`  ${tag.name}: ${result.tagCounts[tag.name] ?? 0}`);
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
