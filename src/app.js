const express = require("express");
const swaggerUi = require("swagger-ui-express");

const paymentRoutes =
require("./routes/payment.routes");
const swaggerSpec =
require("./config/swagger.config");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        name: "Idempotency Gateway API",
        health: "ok",
        endpoint: "POST /process-payment",
        docs: "/api-docs"
    });
});

// Swagger UI documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API routes
app.use("/", paymentRoutes);
app.use("/api", paymentRoutes);

// Global error-handling middleware
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    return res.status(500).json({
        message: "Internal Server Error"
    });
});

module.exports = app;
