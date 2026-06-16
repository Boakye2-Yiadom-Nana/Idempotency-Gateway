const { createClient } = require("redis");

const memoryStore = new Map();

let redisClient;
let useMemoryStore = false;

const getMemoryRecord = (key) => {
    const record = memoryStore.get(key);

    if (!record) {
        return null;
    }

    if (record.expiresAt && record.expiresAt <= Date.now()) {
        memoryStore.delete(key);
        return null;
    }

    return record.value;
};

const setMemoryRecord = (key, value, options = {}) => {
    if (options.NX && getMemoryRecord(key) !== null) {
        return null;
    }

    const expiresAt = options.EX
        ? Date.now() + options.EX * 1000
        : null;

    memoryStore.set(key, {
        value,
        expiresAt
    });

    return "OK";
};

const connect = async () => {
    redisClient = createClient({
        url: process.env.REDIS_URL || "redis://localhost:6379",
        socket: {
            connectTimeout: 1000,
            reconnectStrategy: false
        }
    });

    redisClient.on("error", (err) => {
        if (!useMemoryStore) {
            console.log("Redis Error:", err.message);
        }
    });

    try {
        await redisClient.connect();
        console.log("Connected to Redis");
    } catch (err) {
        useMemoryStore = true;
        console.log(
            "Redis unavailable. Falling back to in-memory idempotency store."
        );
    }
};

const get = async (key) => {
    if (useMemoryStore) {
        return getMemoryRecord(key);
    }

    return redisClient.get(key);
};

const set = async (key, value, options) => {
    if (useMemoryStore) {
        return setMemoryRecord(key, value, options);
    }

    return redisClient.set(key, value, options);
};

const del = async (key) => {
    if (useMemoryStore) {
        return memoryStore.delete(key) ? 1 : 0;
    }

    return redisClient.del(key);
};

const on = (...args) => {
    if (redisClient) {
        redisClient.on(...args);
    }
};

module.exports = {
    connect,
    get,
    set,
    del,
    on
};
