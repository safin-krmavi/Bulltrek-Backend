export const handleZerodhaError = (error: any) => {
  const exchangeMessage =
    error.response?.data?.msg ||
    error.response?.data?.message ||
    error.message ||
    "Unknown exchange error";
  // console.log(error);

  if (error.response?.status === 401 || error.response?.status === 403) {
    throw {
      code: "AUTH_INVALID",
      message: exchangeMessage,
    };
  }

  if (error.response?.status === 429) {
    throw {
      code: "RATE_LIMITED",
      message: exchangeMessage,
    };
  }

  throw {
    code: "EXCHANGE_UNAVAILABLE",
    message: exchangeMessage,
  };
};
