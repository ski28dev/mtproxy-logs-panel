export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') {
    return;
  }

  const { token, fetchMe, hydrate } = useAuth();
  hydrate();

  if (!token.value) {
    return navigateTo('/login');
  }

  const admin = useState<any | null>('auth-admin');
  if (!admin.value) {
    const result = await fetchMe();
    if (!result) {
      return navigateTo('/login');
    }
  }
});
