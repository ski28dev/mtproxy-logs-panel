export function useApi() {
  const config = useRuntimeConfig();
  const token = useState<string | null>('auth-token', () => null);

  return async function api<T>(path: string, options: any = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers || {})
    };

    if (token.value) {
      headers.authorization = `Bearer ${token.value}`;
    }

    return await $fetch<T>(`${config.public.apiBase}${path}`, {
      ...options,
      headers
    });
  };
}
