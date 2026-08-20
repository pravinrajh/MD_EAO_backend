import type { Express, NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { isSwaggerEnabled } from "./env";
import { logger } from "./logger";
import { getOpenApiDocument } from "../docs/openapi";

const SWAGGER_CSP =
  "default-src 'self'; base-uri 'self'; font-src 'self' https: data:; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'";

function swaggerCsp(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Content-Security-Policy", SWAGGER_CSP);
  next();
}

export function mountSwagger(app: Express): void {
  if (!isSwaggerEnabled()) {
    logger.info("Swagger UI disabled");
    return;
  }

  const document = getOpenApiDocument();

  app.get("/api-docs.json", swaggerCsp, (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(document);
  });

  app.use(
    "/api-docs",
    swaggerCsp,
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: "AI Executive Office API",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: "none",
        filter: true,
        deepLinking: true,
        tagsSorter: "none",
      },
    }),
  );
}
