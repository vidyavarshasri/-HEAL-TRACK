import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requireClerkAuth: RequestHandler = (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
};
