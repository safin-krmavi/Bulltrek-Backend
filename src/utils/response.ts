import { Response } from "express";

const send = (
  res: Response,
  status: number,
  success: boolean,
  messageOrError: string,
  data?: any
) => {
  return res.status(status).json({
    success,
    ...(success
      ? { message: messageOrError, data }
      : { error: messageOrError }),
  });
};

// Success
export const sendSuccess = (res: Response, message: string, data: any = {}) =>
  send(res, 200, true, message, data);

export const sendCreated = (res: Response, message: string, data: any = {}) =>
  send(res, 201, true, message, data);

// Client errors
export const sendBadRequest = (res: Response, error: string) =>
  send(res, 400, false, error);

export const sendUnauthorized = (res: Response, error: string) =>
  send(res, 401, false, error);

export const sendNotFound = (res: Response, error: string) =>
  send(res, 404, false, error);

// Server error
export const sendServerError = (res: Response, error = "Server error") =>
  send(res, 500, false, error);
