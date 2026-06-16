/**
 * Simulate payment processing
 * with 2 second delay
 */
const processPayment = async (amount, currency) => {

    await new Promise((resolve) =>
        setTimeout(resolve, 2000)
    );

    return {
        status: "success",
        message: `Charged ${amount} ${currency}`
    };
};

module.exports = {
    processPayment
};