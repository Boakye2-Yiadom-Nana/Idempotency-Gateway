const request = require("supertest");
const express = require("express");

// Mock Redis before requiring any module that uses it
jest.mock("../src/config/redis.config", () => ({
    __esModule: true,
    default: {},
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn()
}));

const redisClient = require("../src/config/redis.config");

// Import the app — Redis is already mocked above
const app = require("../src/app");

// Required to avoid dotenv loading .env in tests
process.env.REDIS_URL = "redis://localhost:6379";
process.env.PORT = "0";

describe("Idempotency Gateway Integration Tests", () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ───────────────────────────────────────────
    // Test 1: Missing Idempotency-Key header
    // ───────────────────────────────────────────
    test("should return 400 when Idempotency-Key header is missing", async () => {
        const res = await request(app)
            .post("/process-payment")
            .send({ amount: 100, currency: "USD" });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain("Idempotency-Key");
    });

    // ───────────────────────────────────────────
    // Test 2: First request — returns 201
    // ───────────────────────────────────────────
    test("should return 201 for a fresh idempotency key", async () => {
        // No existing key in Redis
        redisClient.get.mockResolvedValue(null);
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app)
            .post("/process-payment")
            .set("Idempotency-Key", "fresh-key-001")
            .send({ amount: 100, currency: "USD" });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe("success");
        expect(res.body.message).toBe("Charged 100 USD");

        // Verify middleware called set with PROCESSING first, then controller with COMPLETED
        expect(redisClient.set).toHaveBeenCalled();
    });

    test("should return 400 when payment body is invalid", async () => {
        redisClient.get.mockResolvedValue(null);
        redisClient.set.mockResolvedValue("OK");
        redisClient.del.mockResolvedValue(1);

        const res = await request(app)
            .post("/process-payment")
            .set("Idempotency-Key", "invalid-body-001")
            .send({ amount: 0 });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain("positive numeric amount");
        expect(redisClient.del).toHaveBeenCalledWith("invalid-body-001");
    });

    // ───────────────────────────────────────────
    // Test 3: Duplicate key — returns cached 201
    // ───────────────────────────────────────────
    test("should return cached 201 for a duplicate idempotency key", async () => {
        const cachedResult = JSON.stringify({
            status: "COMPLETED",
            bodyHash: require("crypto")
                .createHash("sha256")
                .update(JSON.stringify({ amount: 100, currency: "USD" }, ["amount", "currency"].sort()))
                .digest("hex"),
            statusCode: 201,
            response: {
                status: "success",
                message: "Charged 100 USD"
            }
        });

        redisClient.get.mockResolvedValue(cachedResult);

        const res = await request(app)
            .post("/process-payment")
            .set("Idempotency-Key", "duplicate-key-001")
            .send({ amount: 100, currency: "USD" });

        expect(res.status).toBe(201);
        expect(res.headers["x-cache-hit"]).toBe("true");
        expect(res.body.status).toBe("success");
    });

    // Test 4: Same key, different body — 422
    test("should return 422 when same key is used with a different body", async () => {
        // First request body hash for { amount: 100, currency: "USD" }
        const existingData = JSON.stringify({
            status: "COMPLETED",
            bodyHash: "abc123hash",
            statusCode: 201,
            response: {}
        });

        redisClient.get.mockResolvedValue(existingData);

        const res = await request(app)
            .post("/process-payment")
            .set("Idempotency-Key", "conflict-key-001")
            .send({ amount: 200, currency: "EUR" }); // Different body

        expect(res.status).toBe(422);
        expect(res.body.message).toContain("already used for a different request");
    });

    // ───────────────────────────────────────────
    // Test 5: Polling — key is PROCESSING then becomes COMPLETED
    // ───────────────────────────────────────────
    test("should wait for PROCESSING to become COMPLETED and return cached result", async () => {
        // First call (middleware reads) → PROCESSING
        // Second call (polling reads) → COMPLETED
        const processingState = JSON.stringify({
            status: "PROCESSING",
            bodyHash: require("crypto")
                .createHash("sha256")
                .update(JSON.stringify({ amount: 100, currency: "USD" }, ["amount", "currency"].sort()))
                .digest("hex"),
            statusCode: 201,
            response: {}
        });

        const completedState = JSON.stringify({
            status: "COMPLETED",
            bodyHash: require("crypto")
                .createHash("sha256")
                .update(JSON.stringify({ amount: 100, currency: "USD" }, ["amount", "currency"].sort()))
                .digest("hex"),
            statusCode: 201,
            response: {
                status: "success",
                message: "Charged 100 USD"
            }
        });

        // Return PROCESSING first, then COMPLETED on subsequent calls
        redisClient.get
            .mockResolvedValueOnce(processingState)
            .mockResolvedValueOnce(completedState);

        const res = await request(app)
            .post("/process-payment")
            .set("Idempotency-Key", "polling-key-001")
            .send({ amount: 100, currency: "USD" });

        expect(res.status).toBe(201);
        expect(res.headers["x-cache-hit"]).toBe("true");
        expect(res.body.message).toBe("Charged 100 USD");
    });

    test("should not process twice when another request reserves the key first", async () => {
        const completedState = JSON.stringify({
            status: "COMPLETED",
            bodyHash: require("crypto")
                .createHash("sha256")
                .update(JSON.stringify({ amount: 100, currency: "USD" }, ["amount", "currency"].sort()))
                .digest("hex"),
            statusCode: 201,
            response: {
                status: "success",
                message: "Charged 100 USD"
            }
        });

        redisClient.get
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(completedState);
        redisClient.set.mockResolvedValueOnce(null);

        const res = await request(app)
            .post("/process-payment")
            .set("Idempotency-Key", "race-key-001")
            .send({ amount: 100, currency: "USD" });

        expect(res.status).toBe(201);
        expect(res.headers["x-cache-hit"]).toBe("true");
        expect(res.body.message).toBe("Charged 100 USD");
        expect(redisClient.set).toHaveBeenCalledTimes(1);
    });

    // ───────────────────────────────────────────
    // Test 6: Polling timeout
    // ───────────────────────────────────────────
    test("should return 408 when PROCESSING takes too long", async () => {
        // Force processing to never complete — always return PROCESSING
        const processingState = JSON.stringify({
            status: "PROCESSING",
            bodyHash: require("crypto")
                .createHash("sha256")
                .update(JSON.stringify({ amount: 100, currency: "USD" }, ["amount", "currency"].sort()))
                .digest("hex")
        });

        // Keep returning PROCESSING forever
        redisClient.get.mockResolvedValue(processingState);

        const res = await request(app)
            .post("/process-payment")
            .set("Idempotency-Key", "timeout-key-001")
            .send({ amount: 100, currency: "USD" });

        expect(res.status).toBe(408);
        expect(res.body.message).toContain("timed out");
    }, 15000); // 15s timeout for this slow test

    // ───────────────────────────────────────────
    // Test 7: Deterministic hashing — key order doesn't matter
    // ───────────────────────────────────────────
    test("should match body hash regardless of JSON key order", async () => {
        const generateHash = require("../src/utils/hash.util");

        const hash1 = generateHash({ amount: 100, currency: "USD" });
        const hash2 = generateHash({ currency: "USD", amount: 100 });

        expect(hash1).toBe(hash2);
    });
});
