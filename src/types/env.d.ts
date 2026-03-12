// src/types/env.d.ts

declare namespace NodeJS {
  interface ProcessEnv {
    JWT_SECRET: string;
    MONGODB_URI: string;
    CLOUDINARY_CLOUD_NAME: string;
    CLOUDINARY_API_KEY: number;
    CLOUDINARY_API_SECRET: string;
    PORT: number;
    JWT_EXPIRES_IN: string;
    NODE_ENV: string;
  }
}
