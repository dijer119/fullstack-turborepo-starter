import * as Joi from 'joi';

export interface EnvironmentVariables {
  DATABASE_URL: string;
  DIRECT_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
  TELEGRAM_API_ID?: number;
  TELEGRAM_API_HASH?: string;
  TELEGRAM_SESSION_STRING?: string;
  TELEGRAM_CHANNELS?: string;
  NODE_ENV?: string;
  PORT?: number;
  GEMINI_API_KEY?: string;
}

export const validationSchemaForEnv = Joi.object<EnvironmentVariables, true>({
  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().optional(),
  SUPABASE_URL: Joi.string().optional(),
  SUPABASE_KEY: Joi.string().optional(),
  TELEGRAM_API_ID: Joi.number().optional(),
  TELEGRAM_API_HASH: Joi.string().optional(),
  TELEGRAM_SESSION_STRING: Joi.string().optional(),
  TELEGRAM_CHANNELS: Joi.string().optional(),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  GEMINI_API_KEY: Joi.string().optional(),
});
