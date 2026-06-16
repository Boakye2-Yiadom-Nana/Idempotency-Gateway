/**
 * OpenAPI 3.0 specification for the Idempotency Gateway API.
 * This is a static spec object passed directly to swagger-ui-express.
 */
const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Idempotency Gateway API",
    version: "1.0.0",
    description:
      "Payment gateway with idempotency support. " +
      "Use the `Idempotency-Key` header to prevent duplicate payment processing.\n\n" +
      "**How idempotency works:**\n" +
      "- **First request** with a key → processes payment, returns `201`\n" +
      "- **Same key + same body** → returns cached `201` with `X-Cache-Hit: true`\n" +
      "- **Same key + different body** → returns `422` conflict\n" +
      "- **Still processing** → server polls Redis up to 10s, then returns result or `408` timeout",
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Local development server",
    },
  ],
  paths: {
    "/process-payment": {
      post: {
        summary: "Process a payment (idempotent)",
        tags: ["Payments"],
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            schema: { type: "string", format: "uuid" },
            required: true,
            description:
              "Unique key to ensure idempotent processing. " +
              "Generate a UUID v4 for each unique payment operation. " +
              "Retry with the same key to get the cached result instead of charging again.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["amount", "currency"],
                properties: {
                  amount: {
                    type: "number",
                    example: 100,
                    description: "Payment amount",
                  },
                  currency: {
                    type: "string",
                    example: "USD",
                    description: "ISO 4217 currency code",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Payment processed successfully",
            headers: {
              "X-Cache-Hit": {
                schema: { type: "string" },
                description: '"true" if this response was served from cache (duplicate request)',
              },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Charged 100 USD" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing Idempotency-Key header",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          "408": {
            description: "Request timed out waiting for processing to complete",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          "422": {
            description: "Idempotency key already used for a different request body",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
