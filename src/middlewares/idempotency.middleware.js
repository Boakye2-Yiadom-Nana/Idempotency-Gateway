const redisClient = require("../config/redis.config");
const generateHash = require("../utils/hash.util");

const TTL = 86400; // 24 hours in seconds
const POLL_INTERVAL = 100;
const MAX_WAIT = 10000;

const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const sendCachedResponse = (res, cached) => {
    return res
        .status(cached.statusCode)
        .set("X-Cache-Hit", "true")
        .json(cached.response);
};

const handleExistingRequest = async (
    key,
    bodyHash,
    res
) => {
    const startTime = Date.now();

    while (Date.now() - startTime <= MAX_WAIT) {
        const existing = await redisClient.get(key);

        if (!existing) {
            await sleep(POLL_INTERVAL);
            continue;
        }

        const cached = JSON.parse(existing);

        if (cached.bodyHash !== bodyHash) {
            return res.status(422).json({
                message:
                    "Idempotency key already used for a different request body."
            });
        }

        if (cached.status === "COMPLETED") {
            return sendCachedResponse(res, cached);
        }

        await sleep(POLL_INTERVAL);
    }

    return res.status(408).json({
        message:
            "Request timed out waiting for processing to complete."
    });
};

const idempotencyMiddleware = async (req, res, next) => {
    const key = req.header("Idempotency-Key");

    if (!key) {
        return res.status(400).json({
            message: "Idempotency-Key header required"
        });
    }

    const bodyHash = generateHash(req.body);
    const existing = await redisClient.get(key);

    if (existing) {
        return handleExistingRequest(key, bodyHash, res);
    }

    const reserved = await redisClient.set(
        key,
        JSON.stringify({
            status: "PROCESSING",
            bodyHash
        }),
        { EX: TTL, NX: true }
    );

    if (reserved !== "OK") {
        return handleExistingRequest(key, bodyHash, res);
    }

    req.idempotencyKey = key;
    req.bodyHash = bodyHash;

    return next();
};

module.exports = idempotencyMiddleware;
