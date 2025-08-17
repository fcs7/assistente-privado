// Express type extensions
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      rawBody?: string;
    }
  }
}

export {};