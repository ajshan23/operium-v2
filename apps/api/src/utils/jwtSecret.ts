const secret = process.env.JWT_SECRET;

if (!secret) {
  throw new Error(
    "JWT_SECRET environment variable must be set — refusing to start with an insecure default."
  );
}

export const JWT_SECRET: string = secret;
