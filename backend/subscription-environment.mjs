export function subscriptionEnvironment(source){
 const env={...source};
 for(const key of Object.keys(env))if(/^ANTHROPIC_|^CLAUDE_CODE_USE_|^AWS_|^GOOGLE_APPLICATION_CREDENTIALS$|^CLAUDE_CODE_OAUTH_|^CLAUDE_CODE_RESUME_INTERRUPTED_TURN$|^CLAUDE_CODE_RESUME_PROMPT$|^CLAUDE_CODE_RETRY_WATCHDOG|^CLAUDE_CODE_MAX_RETRIES$|^CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST$|^CLAUDECODE$/i.test(key))delete env[key];
 // No indefinite quota polling, and no inherited automatic interrupted-turn replay.
 env.CLAUDE_CODE_MAX_RETRIES='2';
 return env;
}
