/**
 * Gemini Constants
 * 
 * Centralized constants for Gemini integration including environment variable names
 * and default values.
 */

import { trimIdent } from '@/utils/trimIdent';

/** Environment variable name for Gemini API key */
export const GEMINI_API_KEY_ENV = 'GEMINI_API_KEY';

/** Environment variable name for Google API key (alternative) */
export const GOOGLE_API_KEY_ENV = 'GOOGLE_API_KEY';

/** Environment variable name for Gemini model selection */
export const GEMINI_MODEL_ENV = 'GEMINI_MODEL';

/** Default Gemini model */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';

/**
 * Instruction for changing chat title
 * Used in system prompts to instruct agents to call the title tool on the first turn.
 */
export const CHANGE_TITLE_INSTRUCTION = trimIdent(
  `Before answering, call the "change_title" tool to set a concise chat title that represents the current task. If the task changes substantially later, call "change_title" again to refresh the title.`
);
