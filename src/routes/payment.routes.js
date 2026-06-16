const express = require("express");

const router =
    express.Router();

const {
    processPayment
} = require(
    "../controllers/payment.controller"
);

const idempotencyMiddleware =
    require(
        "../middlewares/idempotency.middleware"
    );

/**
 * @openapi
 * /process-payment:
 *   post:
 *     summary: Process a payment (idempotent)
 *     description: |
 *       Charges the given amount in the specified currency.
 *       Include an `Idempotency-Key` header to prevent duplicate charges.
 *
 *       - **First request** → processes payment, returns 201
 *       - **Same key + same body** → returns cached 201 with `X-Cache-Hit: true`
 *       - **Same key + different body** → returns 422 conflict
 *       - **Request still processing** → polls up to 10s then returns cached result or 408 timeout
 *     tags:
 *       - Payments
 *     parameters:
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentRequest'
 *     responses:
 *       201:
 *         description: Payment processed successfully
 *         headers:
 *           X-Cache-Hit:
 *             schema:
 *               type: string
 *             description: "true" if this was a cached duplicate response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentResponse'
 *       400:
 *         description: Missing Idempotency-Key header
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       408:
 *         description: Request timed out waiting for processing to complete
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Idempotency key already used for a different request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
    "/process-payment",
    idempotencyMiddleware,
    processPayment
);

module.exports = router;
