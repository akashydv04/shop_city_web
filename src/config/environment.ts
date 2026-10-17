export type AppEnvironment = 'dev' | 'uat' | 'preprod' | 'prod'

const environments: AppEnvironment[] = ['dev', 'uat', 'preprod', 'prod']

function readEnvironmentLabel() {
  const value = (import.meta.env.VITE_APP_ENV?.trim().toLowerCase() || import.meta.env.MODE).toLowerCase()
  if (!environments.includes(value as AppEnvironment)) {
    throw new Error(`Unsupported app environment: ${value}`)
  }
  return value as AppEnvironment
}

const environment = readEnvironmentLabel()
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '') || ''
const requestedDemoFallback = import.meta.env.VITE_ALLOW_DEMO_FALLBACK?.trim().toLowerCase() === 'true'

export const appConfig = {
  environment,
  apiBaseUrl,
  // Production is always fail-closed, even if a local value accidentally enables fallback.
  allowDemoFallback: requestedDemoFallback && environment !== 'prod',
  get requiresApi() {
    return environment !== 'dev' || !this.allowDemoFallback
  },
}
