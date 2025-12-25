export function handleKotakError(error: any): never {
  if (error.response) {
    throw {
      code: "KOTAK_API_ERROR",
      status: error.response.status,
      message:
        error?.response?.data?.error[0]?.message ||
        error.response.data?.message ||
        error.response.data?.stat ||
        "Kotak API error",
    };
  }

  throw {
    code: "KOTAK_UNKNOWN_ERROR",
    message: error.message || "Unknown Kotak error",
  };
}
