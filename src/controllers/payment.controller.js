const paymentService = require("../services/payment.service");
const redisClient = require("../config/redis.config");
const TTL = 86400; // 24 hours in seconds

const isValidPaymentRequest = ({ amount, currency }) => {
    return (
        typeof amount === "number" &&
        Number.isFinite(amount) &&
        amount > 0 &&
        typeof currency === "string" &&
        currency.trim().length > 0
    );
};

/**
 * Process payment request
 */
const processPayment = async (req, res) => {
    try {
        const { amount, currency } = req.body;

        if (!isValidPaymentRequest(req.body)) {
            if (req.idempotencyKey) {
                await redisClient.del(req.idempotencyKey).catch(() => {});
            }

            return res.status(400).json({
                message:
                    "Request body must include a positive numeric amount and a currency."
            });
        }

        const result = await paymentService.processPayment(
            amount,
            currency.trim()
        );

        // Save completed response for future duplicate requests
        await redisClient.set(
            req.idempotencyKey,
            JSON.stringify({
                status: "COMPLETED",
                bodyHash: req.bodyHash,
                statusCode: 201,
                response: result
            }),
            { EX: TTL }
        );

        return res.status(201).json(result);

    } catch (error) {

        console.error(error);

        // Clear stuck PROCESSING key so client can retry
        if (req.idempotencyKey) {
            await redisClient.del(req.idempotencyKey).catch(() => {});
        }

        return res.status(500).json({
            message: "Internal Server Error"
        });
    }
};

module.exports = {
    processPayment
};
