const crypto = require("crypto");

/**
 * Generate SHA256 hash for request payload comparison.
 * Uses stable-stringify to produce deterministic JSON
 * regardless of key ordering.
 */
const generateHash = (payload) => {

    const deterministicJson =
        JSON.stringify(payload, Object.keys(payload).sort());

    return crypto
        .createHash("sha256")
        .update(deterministicJson)
        .digest("hex");
};

module.exports = generateHash;
