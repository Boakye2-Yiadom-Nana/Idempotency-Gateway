require("dotenv").config();

const app =
require("./app");

const redisClient =
require("./config/redis.config");

const PORT =
process.env.PORT || 5000;

(async () => {

    try {
        await redisClient.connect();
    } catch (err) {
        console.error("Failed to initialize idempotency store:", err.message);
        process.exit(1);
    }

    app.listen(PORT, () => {

        console.log(
            `Server running on port ${PORT}`
        );

    });

})();
