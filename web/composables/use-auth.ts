type LoginPayload = {
  username: string;
  password: string;
};

export function useAuth() {
  const token = useState<string | null>('auth-token', () => null);
  const admin = useState<any | null>('auth-admin', () => null);
  const api = useApi();

  function persist() {
    if (!process.client) {
      return;
    }

    if (token.value) {
      localStorage.setItem('mtproxy-panel-token', token.value);
    } else {
      localStorage.removeItem('mtproxy-panel-token');
    }
  }

  function hydrate() {
    if (!process.client || token.value) {
      return;
    }
    token.value = localStorage.getItem('mtproxy-panel-token');
  }

  async function login(payload: LoginPayload) {
    const response = await api<any>('/auth/login', {
      method: 'POST',
      body: payload
    });

    token.value = response.token;
    admin.value = response.admin;
    persist();
  }

  async function fetchMe() {
    hydrate();
    if (!token.value) {
      return null;
    }

    try {
      const response = await api<any>('/auth/me');
      admin.value = response.admin;
      return response.admin;
    } catch {
      logout();
      return null;
    }
  }

  function logout() {
    token.value = null;
    admin.value = null;
    persist();
    navigateTo('/login');
  }

  return {
    token,
    admin,
    login,
    fetchMe,
    hydrate,
    logout
  };
}
